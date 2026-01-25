import boto3

_s3 = None

def _get_s3_client():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3")
    return _s3

def presign_get_url(bucket: str, key: str, expires_in: int) -> str:
    """Generate a presigned GET URL for an S3 object."""
    if not key:
        return ""
    
    s3 = _get_s3_client()
    url = s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires_in,
        HttpMethod="GET",
    )
    return url

def delete_object(bucket: str, key: str):
    """Delete an S3 object. Best effort; does not raise if missing."""
    try:
        s3 = _get_s3_client()
        s3.delete_object(Bucket=bucket, Key=key)
    except Exception:
        pass
