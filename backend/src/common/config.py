import os

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

TABLE_TEAMS = os.getenv("TABLE_TEAMS", "")
TABLE_INVITES = os.getenv("TABLE_INVITES", "")
TABLE_MEDIA = os.getenv("TABLE_MEDIA", "")
TABLE_AUDIT = os.getenv("TABLE_AUDIT", "")
TABLE_USERS = os.getenv("TABLE_USERS", "")
TABLE_TEAM_MEMBERS = os.getenv("TABLE_TEAM_MEMBERS", "")
TABLE_AUTH_CODES = os.getenv("TABLE_AUTH_CODES", "")

MEDIA_BUCKET = os.getenv("MEDIA_BUCKET", "")

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "").rstrip("/")

SES_FROM_EMAIL = os.getenv("SES_FROM_EMAIL", "").strip()

SETUP_KEY = os.getenv("SETUP_KEY", "")  # Required to create teams; empty string disables check (dev only)

SIGNED_URL_TTL_SECONDS = int(os.getenv("SIGNED_URL_TTL_SECONDS", "900"))  # 15 min default
THUMBNAIL_URL_TTL_SECONDS = int(os.getenv("THUMBNAIL_URL_TTL_SECONDS", "3600"))  # 1 hour for thumbnails (rarely change)
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(300 * 1024 * 1024)))  # 300MB MVP cap

# Allow-list for MVP. Expand later.
ALLOWED_CONTENT_TYPES = set(
    x.strip() for x in os.getenv(
        "ALLOWED_CONTENT_TYPES",
        "image/jpeg,image/png,image/heic,video/mp4,video/quicktime",
    ).split(",")
)

DEMO_ENABLED = os.getenv("DEMO_ENABLED", "false").lower() == "true"
DEMO_TEAM_ID = os.getenv("DEMO_TEAM_ID", "")
DEMO_INVITE_TTL_DAYS = int(os.getenv("DEMO_INVITE_TTL_DAYS", "1"))