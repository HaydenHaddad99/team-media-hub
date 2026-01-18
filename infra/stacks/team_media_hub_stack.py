
from constructs import Construct
from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    CfnOutput,
    aws_lambda as _lambda,
    aws_apigatewayv2 as apigwv2,
    aws_apigatewayv2_integrations as apigwv2_integrations,
    aws_s3 as s3,
    aws_dynamodb as dynamodb,
    aws_iam as iam,
)

class TeamMediaHubStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # -------- Storage (private) --------
        media_bucket = s3.Bucket(
            self,
            "MediaBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            enforce_ssl=True,
            removal_policy=RemovalPolicy.DESTROY,  # MVP/dev only. Change to RETAIN for prod.
            auto_delete_objects=True,              # MVP/dev only. Remove for prod.
        )

        teams_table = dynamodb.Table(
            self,
            "TeamsTable",
            partition_key=dynamodb.Attribute(name="team_id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )

        invites_table = dynamodb.Table(
            self,
            "InvitesTable",
            partition_key=dynamodb.Attribute(name="token_hash", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )

        media_table = dynamodb.Table(
            self,
            "MediaTable",
            partition_key=dynamodb.Attribute(name="team_id", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="sk", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )

        media_table.add_global_secondary_index(
            index_name="gsi1",
            partition_key=dynamodb.Attribute(name="gsi1pk", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="gsi1sk", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        audit_table = dynamodb.Table(
            self,
            "AuditTable",
            partition_key=dynamodb.Attribute(name="team_id", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="sk", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )

        # -------- Lambda (single API function for MVP) --------
        api_fn = _lambda.Function(
            self,
            "ApiFunction",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="main.handler",
            code=_lambda.Code.from_asset("../backend/src"),
            timeout=Duration.seconds(30),
            memory_size=512,
            environment={
                "MEDIA_BUCKET": media_bucket.bucket_name,
                "TABLE_TEAMS": teams_table.table_name,
                "TABLE_INVITES": invites_table.table_name,
                "TABLE_MEDIA": media_table.table_name,
                "TABLE_AUDIT": audit_table.table_name,
                "SIGNED_URL_TTL_SECONDS": "900",
                "MAX_UPLOAD_BYTES": str(300 * 1024 * 1024),
                # Keep allow-list explicit for security posture
                "ALLOWED_CONTENT_TYPES": "image/jpeg,image/png,image/heic,video/mp4,video/quicktime",
            },
        )

        # -------- IAM (least privilege for MVP) --------
        teams_table.grant_read_write_data(api_fn)
        invites_table.grant_read_write_data(api_fn)
        media_table.grant_read_write_data(api_fn)
        audit_table.grant_read_write_data(api_fn)

        # S3 access restricted to the media prefix
        api_fn.add_to_role_policy(iam.PolicyStatement(
            actions=["s3:PutObject", "s3:GetObject", "s3:HeadObject"],
            resources=[media_bucket.arn_for_objects("media/*")],
        ))

        # -------- HTTP API Gateway --------
        http_api = apigwv2.HttpApi(
            self,
            "HttpApi",
            cors_preflight=apigwv2.CorsPreflightOptions(
                allow_headers=["content-type", "x-invite-token"],
                allow_methods=[apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
                allow_origins=["*"],  # Tighten to CloudFront domain later
                max_age=Duration.days(10),
            ),
        )

        integration = apigwv2_integrations.HttpLambdaIntegration(
            "LambdaIntegration",
            handler=api_fn
        )

        # Routes
        for route in [
            ("/health", apigwv2.HttpMethod.GET),
            ("/teams", apigwv2.HttpMethod.POST),
            ("/invites", apigwv2.HttpMethod.POST),
            ("/media", apigwv2.HttpMethod.GET),
            ("/media/upload-url", apigwv2.HttpMethod.POST),
            ("/media/complete", apigwv2.HttpMethod.POST),
            ("/media/download-url", apigwv2.HttpMethod.GET),
        ]:
            http_api.add_routes(
                path=route[0],
                methods=[route[1]],
                integration=integration,
            )

        CfnOutput(self, "ApiBaseUrl", value=http_api.url or "")
        CfnOutput(self, "MediaBucketName", value=media_bucket.bucket_name)
