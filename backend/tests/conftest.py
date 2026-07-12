"""
Shared fixtures for backend tests.
Mocks AWS services (DynamoDB, S3) using moto so no real AWS calls are made.
"""
import os
import sys

# Ensure backend/src is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

# ---------------------------------------------------------------------------
# Environment variables – MUST be set before any application module is imported
# because common/config.py reads os.getenv() at module level.
# ---------------------------------------------------------------------------
TEST_ENV = {
    "AWS_REGION": "us-east-1",
    "AWS_DEFAULT_REGION": "us-east-1",
    "AWS_ACCESS_KEY_ID": "testing",
    "AWS_SECRET_ACCESS_KEY": "testing",
    "AWS_SECURITY_TOKEN": "testing",
    "AWS_SESSION_TOKEN": "testing",
    "TABLE_TEAMS": "Teams",
    "TABLE_INVITES": "Invites",
    "TABLE_MEDIA": "Media",
    "TABLE_AUDIT": "Audit",
    "TABLE_USERS": "Users",
    "TABLE_TEAM_MEMBERS": "TeamMembers",
    "TABLE_AUTH_CODES": "AuthCodes",
    "TABLE_WEBHOOK_EVENTS": "WebhookEvents",
    "TABLE_USER_TOKENS": "UserTokens",
    "TABLE_PUSH_SUBSCRIPTIONS": "PushSubscriptions",
    "MEDIA_BUCKET": "test-media-bucket",
    "MEDIA_GSI_NAME": "gsi1",
    "SETUP_KEY": "test-setup-key",
    "FRONTEND_BASE_URL": "https://test.example.com",
    "APP_BASE_URL": "https://test.example.com",
    "CLOUDFRONT_DOMAIN": "https://dtest.cloudfront.net",
    "CLOUDFRONT_KEY_PAIR_ID": "TESTKEYPAIRID",
    "CLOUDFRONT_PRIVATE_KEY": "",
    "STRIPE_SECRET_KEY": "sk_test_fake",
    "STRIPE_WEBHOOK_SECRET": "whsec_test_fake",
    "STRIPE_PRICE_50GB": "price_test_50gb",
    "STRIPE_PRICE_200GB": "price_test_200gb",
    "SES_FROM_EMAIL": "noreply@test.example.com",
    "DEMO_ENABLED": "false",
    "DEMO_TEAM_ID": "",
}

# Set env vars NOW, at module level, before pytest collects test files
# which trigger application imports.
for _k, _v in TEST_ENV.items():
    os.environ.setdefault(_k, _v)

import json
import pytest
import boto3
from unittest.mock import patch
from moto import mock_aws


# ---------------------------------------------------------------------------
# DynamoDB table creation helpers
# ---------------------------------------------------------------------------
def _create_tables(dynamodb):
    """Create the DynamoDB tables used by the application."""
    dynamodb.create_table(
        TableName="Teams",
        KeySchema=[{"AttributeName": "team_id", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "team_id", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )
    dynamodb.create_table(
        TableName="Invites",
        KeySchema=[{"AttributeName": "token_hash", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "token_hash", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )
    dynamodb.create_table(
        TableName="Media",
        KeySchema=[
            {"AttributeName": "team_id", "KeyType": "HASH"},
            {"AttributeName": "sk", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "team_id", "AttributeType": "S"},
            {"AttributeName": "sk", "AttributeType": "S"},
            {"AttributeName": "gsi1pk", "AttributeType": "S"},
        ],
        GlobalSecondaryIndexes=[
            {
                "IndexName": "gsi1",
                "KeySchema": [{"AttributeName": "gsi1pk", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    dynamodb.create_table(
        TableName="Audit",
        KeySchema=[
            {"AttributeName": "team_id", "KeyType": "HASH"},
            {"AttributeName": "sk", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "team_id", "AttributeType": "S"},
            {"AttributeName": "sk", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    dynamodb.create_table(
        TableName="Users",
        KeySchema=[{"AttributeName": "user_id", "KeyType": "HASH"}],
        AttributeDefinitions=[
            {"AttributeName": "user_id", "AttributeType": "S"},
            {"AttributeName": "email", "AttributeType": "S"},
        ],
        GlobalSecondaryIndexes=[
            {
                "IndexName": "email-index",
                "KeySchema": [{"AttributeName": "email", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    dynamodb.create_table(
        TableName="TeamMembers",
        KeySchema=[
            {"AttributeName": "user_id", "KeyType": "HASH"},
            {"AttributeName": "team_id", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "user_id", "AttributeType": "S"},
            {"AttributeName": "team_id", "AttributeType": "S"},
        ],
        GlobalSecondaryIndexes=[
            {
                "IndexName": "team-index",
                "KeySchema": [{"AttributeName": "team_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    dynamodb.create_table(
        TableName="AuthCodes",
        KeySchema=[{"AttributeName": "code_hash", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "code_hash", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )
    dynamodb.create_table(
        TableName="WebhookEvents",
        KeySchema=[{"AttributeName": "event_id", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "event_id", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )
    dynamodb.create_table(
        TableName="UserTokens",
        KeySchema=[{"AttributeName": "token_hash", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "token_hash", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )
    dynamodb.create_table(
        TableName="PushSubscriptions",
        KeySchema=[
            {"AttributeName": "team_id", "KeyType": "HASH"},
            {"AttributeName": "endpoint_hash", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "team_id", "AttributeType": "S"},
            {"AttributeName": "endpoint_hash", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


@pytest.fixture
def aws(monkeypatch):
    """
    Start moto mock for DynamoDB + S3, create tables and bucket.
    Returns a dict with dynamodb resource, s3 client, and table references.
    """
    with mock_aws():
        region = "us-east-1"
        ddb = boto3.resource("dynamodb", region_name=region)
        s3 = boto3.client("s3", region_name=region)

        _create_tables(ddb)
        s3.create_bucket(Bucket="test-media-bucket")

        # Patch the boto3 resources used by the application modules
        # so they use the mocked resources instead of real AWS
        monkeypatch.setattr("common.config.DYNAMODB", ddb)
        monkeypatch.setattr("common.db.dynamodb", ddb)

        # Patch table name constants that were resolved at import time
        monkeypatch.setattr("common.config.TABLE_TEAMS", "Teams")
        monkeypatch.setattr("common.config.TABLE_INVITES", "Invites")
        monkeypatch.setattr("common.config.TABLE_MEDIA", "Media")
        monkeypatch.setattr("common.config.TABLE_AUDIT", "Audit")
        monkeypatch.setattr("common.config.TABLE_USERS", "Users")
        monkeypatch.setattr("common.config.TABLE_TEAM_MEMBERS", "TeamMembers")
        monkeypatch.setattr("common.config.TABLE_AUTH_CODES", "AuthCodes")
        monkeypatch.setattr("common.config.TABLE_WEBHOOK_EVENTS", "WebhookEvents")
        monkeypatch.setattr("common.config.TABLE_PUSH_SUBSCRIPTIONS", "PushSubscriptions")
        monkeypatch.setattr("common.config.MEDIA_BUCKET", "test-media-bucket")
        monkeypatch.setattr("common.config.SETUP_KEY", "test-setup-key")

        yield {
            "dynamodb": ddb,
            "s3": s3,
            "teams_table": ddb.Table("Teams"),
            "invites_table": ddb.Table("Invites"),
            "media_table": ddb.Table("Media"),
            "audit_table": ddb.Table("Audit"),
            "push_subscriptions_table": ddb.Table("PushSubscriptions"),
        }


# ---------------------------------------------------------------------------
# Helper factories
# ---------------------------------------------------------------------------
import hashlib
import time

def make_invite_token(team_id: str, role: str = "admin", token: str = "test-token-abc123"):
    """Return (raw_token, token_hash, invite_record) for seeding Invites table."""
    h = hashlib.sha256(token.encode("utf-8")).hexdigest()
    record = {
        "token_hash": h,
        "team_id": team_id,
        "role": role,
        "created_at": int(time.time()),
        "expires_at": int(time.time()) + 86400,
    }
    return token, h, record

def make_event(method: str = "GET", path: str = "/", body: dict = None, headers: dict = None, query: str = ""):
    """Build a minimal API Gateway v2 event dict."""
    event = {
        "requestContext": {"http": {"method": method, "path": path}},
        "rawPath": path,
        "rawQueryString": query,
        "headers": headers or {},
        "body": json.dumps(body) if body else None,
        "isBase64Encoded": False,
    }
    return event
