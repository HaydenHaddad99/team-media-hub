import os

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

TABLE_TEAMS = os.getenv("TABLE_TEAMS", "")
TABLE_INVITES = os.getenv("TABLE_INVITES", "")
TABLE_MEDIA = os.getenv("TABLE_MEDIA", "")
TABLE_AUDIT = os.getenv("TABLE_AUDIT", "")

MEDIA_BUCKET = os.getenv("MEDIA_BUCKET", "")

SIGNED_URL_TTL_SECONDS = int(os.getenv("SIGNED_URL_TTL_SECONDS", "900"))  # 15 min default
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(300 * 1024 * 1024)))  # 300MB MVP cap

# Allow-list for MVP. Expand later.
ALLOWED_CONTENT_TYPES = set(
    x.strip() for x in os.getenv(
        "ALLOWED_CONTENT_TYPES",
        "image/jpeg,image/png,image/heic,video/mp4,video/quicktime",
    ).split(",")
)