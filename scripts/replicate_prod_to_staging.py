"""
Replicate prod data → staging (DynamoDB tables + S3 media bucket).

Usage:
    python3 scripts/replicate_prod_to_staging.py [--dry-run] [--skip-s3] [--skip-dynamo]

Requires AWS credentials with read access to prod resources and write access to staging.
"""
import argparse
import boto3
import sys
import time

# ---------------------------------------------------------------------------
# Resource mapping: prod name → staging name
# ---------------------------------------------------------------------------
TABLE_MAP = {
    "TeamMediaHubStack-TeamsTableE80F987E-1THOJUJC7RNIZ": "TeamMediaHubStack-Staging-TeamsTableE80F987E-116OW45QOVQGL",
    "TeamMediaHubStack-InvitesTableE9630325-1P43ZIUHYTGNW": "TeamMediaHubStack-Staging-InvitesTableE9630325-55XKTCVFPRN1",
    "TeamMediaHubStack-MediaTableCFC93525-8YTEVX5PQ0Z9": "TeamMediaHubStack-Staging-MediaTableCFC93525-1WCAV0MVU03C7",
    "TeamMediaHubStack-AuditTableB07F8EEB-UTXBXRWIM6DI": "TeamMediaHubStack-Staging-AuditTableB07F8EEB-7Y23RN55YARO",
    "TeamMediaHubStack-UsersTable9725E9C8-3IY64EFAG6RM": "TeamMediaHubStack-Staging-UsersTable9725E9C8-1RRKKS35KR902",
    "TeamMediaHubStack-TeamMembersTableCADD68CD-10GHX6G9FS2TM": "TeamMediaHubStack-Staging-TeamMembersTableCADD68CD-101HJ0KQL3OK7",
    "TeamMediaHubStack-AuthCodesTableA2697F2B-JM39DUSQK5YC": "TeamMediaHubStack-Staging-AuthCodesTableA2697F2B-687QW4B188TX",
    "TeamMediaHubStack-UserTokensTableDF29304D-1FBRIKAHW0E5N": "TeamMediaHubStack-Staging-UserTokensTableDF29304D-1RZB527LICEM4",
    "TeamMediaHubStack-WebhookEventsTableCA203B38-R1FZL2WYRSCQ": "TeamMediaHubStack-Staging-WebhookEventsTableCA203B38-192FSM1I9VBCZ",
}

PROD_BUCKET = "teammediahubstack-mediabucketbcbb02ba-yya0tjoyk8dm"
STAGING_BUCKET = "teammediahubstack-staging-mediabucketbcbb02ba-c1zsibc2uhk6"

# Fields to sanitize in Teams table to avoid staging hitting live Stripe
STRIPE_FIELDS_TO_CLEAR = [
    "stripe_customer_id",
    "stripe_subscription_id",
    "stripe_price_id",
    "subscription_status",
    "current_period_end",
    "cancel_at_period_end",
    "cancel_at",
    "past_due_since",
]

# ---------------------------------------------------------------------------
# DynamoDB replication
# ---------------------------------------------------------------------------
def replicate_table(ddb_resource, prod_name: str, staging_name: str, dry_run: bool, sanitize_stripe: bool = False):
    """Scan all items from prod table and batch-write them to staging table."""
    prod_table = ddb_resource.Table(prod_name)
    staging_table = ddb_resource.Table(staging_name)

    short_name = prod_name.split("-")[1] if "-" in prod_name else prod_name
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Replicating: {short_name}")
    print(f"  Prod:    {prod_name}")
    print(f"  Staging: {staging_name}")

    total = 0
    scan_kwargs = {}
    while True:
        response = prod_table.scan(**scan_kwargs)
        items = response.get("Items", [])

        if sanitize_stripe:
            for item in items:
                for field in STRIPE_FIELDS_TO_CLEAR:
                    item.pop(field, None)
                # Reset plan to free so staging doesn't think it has a paid plan
                if "plan" in item:
                    item["plan"] = "free"
                if "storage_limit_gb" in item:
                    item["storage_limit_gb"] = 10
                if "storage_limit_bytes" in item:
                    item["storage_limit_bytes"] = 10 * 1024 * 1024 * 1024

        if not dry_run and items:
            with staging_table.batch_writer() as batch:
                for item in items:
                    batch.put_item(Item=item)

        total += len(items)

        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        scan_kwargs["ExclusiveStartKey"] = last_key

    print(f"  Items copied: {total}")
    return total


def replicate_all_tables(dry_run: bool):
    """Replicate all DynamoDB tables from prod to staging."""
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    grand_total = 0

    for prod_name, staging_name in TABLE_MAP.items():
        is_teams = "TeamsTable" in prod_name
        count = replicate_table(ddb, prod_name, staging_name, dry_run, sanitize_stripe=is_teams)
        grand_total += count

    print(f"\n{'[DRY RUN] ' if dry_run else ''}DynamoDB total items: {grand_total}")


# ---------------------------------------------------------------------------
# S3 replication (uses aws s3 sync for efficiency)
# ---------------------------------------------------------------------------
def replicate_s3(dry_run: bool):
    """Sync S3 media bucket from prod to staging using aws cli."""
    import subprocess

    print(f"\n{'[DRY RUN] ' if dry_run else ''}Syncing S3 media bucket:")
    print(f"  Prod:    s3://{PROD_BUCKET}")
    print(f"  Staging: s3://{STAGING_BUCKET}")

    cmd = [
        "aws", "s3", "sync",
        f"s3://{PROD_BUCKET}",
        f"s3://{STAGING_BUCKET}",
        "--region", "us-east-1",
    ]

    if dry_run:
        cmd.append("--dryrun")

    print(f"  Running: {' '.join(cmd)}\n")
    result = subprocess.run(cmd, capture_output=False, text=True)

    if result.returncode != 0:
        print(f"\n  ERROR: S3 sync failed with exit code {result.returncode}")
        return False

    print(f"\n  S3 sync {'(dry run) ' if dry_run else ''}complete.")
    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Replicate prod data to staging")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be copied without writing")
    parser.add_argument("--skip-s3", action="store_true", help="Skip S3 media sync")
    parser.add_argument("--skip-dynamo", action="store_true", help="Skip DynamoDB table copy")
    args = parser.parse_args()

    print("=" * 60)
    print("  Team Media Hub: Prod → Staging Replication")
    print("=" * 60)

    if args.dry_run:
        print("\n*** DRY RUN MODE — no data will be written ***\n")

    if not args.dry_run:
        print("\nThis will OVERWRITE staging data with production data.")
        print("Stripe fields on Teams will be sanitized (reset to free plan).")
        confirm = input("\nType 'yes' to continue: ").strip().lower()
        if confirm != "yes":
            print("Aborted.")
            sys.exit(0)

    start = time.time()

    if not args.skip_dynamo:
        replicate_all_tables(args.dry_run)

    if not args.skip_s3:
        replicate_s3(args.dry_run)

    elapsed = time.time() - start
    print(f"\n{'[DRY RUN] ' if args.dry_run else ''}Done in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
