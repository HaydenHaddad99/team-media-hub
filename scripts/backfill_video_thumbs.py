#!/usr/bin/env python3
"""
Backfill video thumbnails for existing uploads.

Scans the Media DynamoDB table for video items without a thumb_key, then
invokes the thumbnail Lambda with a synthetic S3 event for each one.

Usage:
    # Dry run (shows what would be processed, no Lambda invocations):
    python scripts/backfill_video_thumbs.py --stage staging --dry-run

    # Live run:
    python scripts/backfill_video_thumbs.py --stage staging
    python scripts/backfill_video_thumbs.py --stage prod
"""
import argparse
import json
import time
import boto3

REGION = "us-east-1"

# Table and bucket names per environment
CONFIGS = {
    "prod": {
        "media_table": "TeamMediaHubStack-MediaTableCFC93525-8YTEVX5PQ0Z9",
        "media_bucket": None,   # resolved at runtime from DDB item object_key prefix
        "lambda_name": "TeamMediaHubStack-ThumbnailHandler",
    },
    "staging": {
        "media_table": "TeamMediaHubStack-Staging-MediaTableCFC93525-STAGINGID",
        "media_bucket": None,
        "lambda_name": "TeamMediaHubStack-Staging-ThumbnailHandler",
    },
}


def scan_all(ddb, table_name):
    items = []
    kwargs = {"TableName": table_name}
    while True:
        resp = ddb.scan(**kwargs)
        items.extend(resp.get("Items", []))
        lek = resp.get("LastEvaluatedKey")
        if not lek:
            break
        kwargs["ExclusiveStartKey"] = lek
    return items


def val(item, key):
    v = item.get(key, {})
    if "S" in v:
        return v["S"]
    if "N" in v:
        return v["N"]
    if "BOOL" in v:
        return v["BOOL"]
    return None


def resolve_config(stage: str, ddb, lam) -> dict:
    """Resolve the actual table/bucket/lambda names for the given stage."""
    cfg = dict(CONFIGS[stage])

    # Resolve the real table name by listing DynamoDB tables that match the prefix
    prefix = f"TeamMediaHubStack-{'Staging-' if stage == 'staging' else ''}MediaTable"
    paginator = ddb.get_paginator("list_tables")
    for page in paginator.paginate():
        for name in page["TableNames"]:
            if name.startswith(prefix):
                cfg["media_table"] = name
                break

    # Resolve the real Lambda function name
    prefix_lam = f"TeamMediaHubStack-{'Staging-' if stage == 'staging' else ''}ThumbnailFunction"
    paginator_lam = lam.get_paginator("list_functions")
    for page in paginator_lam.paginate():
        for fn in page["Functions"]:
            if fn["FunctionName"].startswith(prefix_lam):
                cfg["lambda_name"] = fn["FunctionName"]
                break

    return cfg


def build_s3_event(bucket: str, key: str) -> dict:
    """Build a minimal S3 ObjectCreated event payload for the thumbnail Lambda."""
    return {
        "Records": [
            {
                "s3": {
                    "bucket": {"name": bucket},
                    "object": {"key": key},
                }
            }
        ]
    }


def main():
    parser = argparse.ArgumentParser(description="Backfill video thumbnails")
    parser.add_argument("--stage", choices=["staging", "prod"], default="staging")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be processed without invoking Lambda")
    args = parser.parse_args()

    ddb = boto3.client("dynamodb", region_name=REGION)
    lam = boto3.client("lambda", region_name=REGION)
    s3  = boto3.client("s3", region_name=REGION)

    print(f"Resolving resource names for stage: {args.stage}")
    cfg = resolve_config(args.stage, ddb, lam)
    print(f"  Table:  {cfg['media_table']}")
    print(f"  Lambda: {cfg['lambda_name']}")

    print("\nScanning media table...")
    all_items = scan_all(ddb, cfg["media_table"])
    print(f"  Total media items: {len(all_items)}")

    # Filter: videos without a thumb_key
    to_backfill = [
        item for item in all_items
        if (val(item, "content_type") or "").startswith("video/")
        and not val(item, "thumb_key")
        and val(item, "object_key")
    ]

    print(f"  Videos missing thumbnails: {len(to_backfill)}")

    if not to_backfill:
        print("\nNothing to backfill.")
        return

    if args.dry_run:
        print("\n[DRY RUN] Would invoke Lambda for:")
        for item in to_backfill:
            print(f"  {val(item, 'object_key')}  ({val(item, 'content_type')})")
        return

    # Resolve the bucket name from the first item's object_key
    # object_key format: media/{team_id}/{media_id}/{filename}
    # The bucket is the same for all items in a stage.
    # We resolve it by asking S3 which bucket contains the key.
    sample_key = val(to_backfill[0], "object_key")
    bucket_name = _resolve_bucket(s3, args.stage, sample_key)
    if not bucket_name:
        print(f"\nERROR: Could not resolve S3 bucket for stage '{args.stage}'. "
              f"Pass --stage with the correct environment or check your AWS credentials.")
        return
    print(f"  Bucket: {bucket_name}")

    print(f"\nInvoking Lambda for {len(to_backfill)} video(s)...")
    ok = 0
    failed = 0

    for i, item in enumerate(to_backfill, 1):
        key = val(item, "object_key")
        media_id = val(item, "media_id") or key
        payload = build_s3_event(bucket_name, key)

        print(f"  [{i}/{len(to_backfill)}] {key}", end="", flush=True)
        try:
            resp = lam.invoke(
                FunctionName=cfg["lambda_name"],
                InvocationType="RequestResponse",
                Payload=json.dumps(payload).encode(),
            )
            status = resp.get("StatusCode")
            fn_error = resp.get("FunctionError")
            if fn_error or status != 200:
                body = resp["Payload"].read().decode()
                print(f"  ERROR (status={status}, fnError={fn_error}): {body[:200]}")
                failed += 1
            else:
                print("  OK")
                ok += 1
        except Exception as e:
            print(f"  EXCEPTION: {e}")
            failed += 1

        # Brief pause to avoid Lambda throttling on large backlogs
        if i < len(to_backfill):
            time.sleep(0.5)

    print(f"\nDone. {ok} succeeded, {failed} failed.")


def _resolve_bucket(s3_client, stage: str, sample_key: str) -> str | None:
    """Find the S3 bucket that contains the sample key by listing buckets."""
    prefix = "teammediahubstack-mediabucket" if stage == "prod" else "teammediahubstack-staging-mediabucket"
    try:
        resp = s3_client.list_buckets()
        candidates = [b["Name"] for b in resp["Buckets"] if prefix in b["Name"].lower()]
        for bucket in candidates:
            try:
                s3_client.head_object(Bucket=bucket, Key=sample_key)
                return bucket
            except Exception:
                continue
    except Exception:
        pass
    return None


if __name__ == "__main__":
    main()
