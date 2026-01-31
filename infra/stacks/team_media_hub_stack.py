import os

from constructs import Construct
from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    CfnOutput,
    CfnParameter,
    aws_lambda as _lambda,
    aws_apigatewayv2 as apigwv2,
    aws_apigatewayv2_integrations as apigwv2_integrations,
    aws_s3 as s3,
    aws_s3_notifications as s3n,
    aws_dynamodb as dynamodb,
    aws_iam as iam,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_s3_deployment as s3deploy,
)

class TeamMediaHubStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # -------------------------
        # CloudFormation Parameters
        # -------------------------
        demo_enabled = CfnParameter(
            self,
            "DemoEnabled",
            type="String",
            default="false",
            allowed_values=["true", "false"],
            description="Enable public demo mode (creates short-lived viewer tokens)"
        )

        demo_team_id = CfnParameter(
            self,
            "DemoTeamId",
            type="String",
            default="",
            description="Team ID for demo mode (use existing team or create one)"
        )

        demo_invite_ttl_days = CfnParameter(
            self,
            "DemoInviteTtlDays",
            type="Number",
            default=1,
            min_value=1,
            max_value=30,
            description="TTL in days for demo invite tokens"
        )

        ses_from_email = CfnParameter(
            self,
            "SesFromEmail",
            type="String",
            default="",
            description="Verified SES From email address (leave blank to log codes only)"
        )

        # -------------------------
        # Media Storage (private)
        # -------------------------
        media_bucket = s3.Bucket(
            self,
            "MediaBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            enforce_ssl=True,
            removal_policy=RemovalPolicy.DESTROY,  # dev/MVP only
            auto_delete_objects=True,              # dev/MVP only
            cors=[
                s3.CorsRule(
                    allowed_methods=[
                        s3.HttpMethods.GET,
                        s3.HttpMethods.HEAD,
                        s3.HttpMethods.PUT,
                        s3.HttpMethods.POST,
                    ],
                    allowed_origins=["*"],  # tighten to CloudFront domain if desired
                    allowed_headers=["*"],
                    exposed_headers=["ETag", "x-amz-version-id", "Content-Type", "Content-Length"],
                    max_age=3600,
                )
            ],
        )

        # -------------------------
        # App Data (DynamoDB)
        # -------------------------
        teams_table = dynamodb.Table(
            self,
            "TeamsTable",
            partition_key=dynamodb.Attribute(name="team_id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )
        
        # GSI for team code lookup
        teams_table.add_global_secondary_index(
            index_name="team-code-index",
            partition_key=dynamodb.Attribute(name="team_code", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
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

        # Users table (account-lite system)
        users_table = dynamodb.Table(
            self,
            "UsersTable",
            partition_key=dynamodb.Attribute(name="user_id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )
        
        # GSI for email lookup
        users_table.add_global_secondary_index(
            index_name="email-index",
            partition_key=dynamodb.Attribute(name="email", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # Team members table (user-team relationships)
        team_members_table = dynamodb.Table(
            self,
            "TeamMembersTable",
            partition_key=dynamodb.Attribute(name="user_id", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="team_id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )
        
        # GSI for team -> members lookup
        team_members_table.add_global_secondary_index(
            index_name="team-index",
            partition_key=dynamodb.Attribute(name="team_id", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="user_id", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # Magic link verification codes table
        auth_codes_table = dynamodb.Table(
            self,
            "AuthCodesTable",
            partition_key=dynamodb.Attribute(name="code_hash", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
            time_to_live_attribute="expires_at",
        )

        # -------------------------
        # Backend: Lambda + HTTP API
        # -------------------------
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
                "TABLE_USERS": users_table.table_name,
                "TABLE_TEAM_MEMBERS": team_members_table.table_name,
                "TABLE_AUTH_CODES": auth_codes_table.table_name,
                "SIGNED_URL_TTL_SECONDS": "900",
                "MAX_UPLOAD_BYTES": str(300 * 1024 * 1024),
                "ALLOWED_CONTENT_TYPES": "image/jpeg,image/png,image/heic,video/mp4,video/quicktime",
                "SETUP_KEY": os.getenv("SETUP_KEY", ""),
                "DEMO_ENABLED": demo_enabled.value_as_string,
                "DEMO_TEAM_ID": demo_team_id.value_as_string,
                "DEMO_INVITE_TTL_DAYS": demo_invite_ttl_days.value_as_string,
                "SES_FROM_EMAIL": ses_from_email.value_as_string,
                # FRONTEND_BASE_URL will be set after we create CloudFront distribution
            },
        )

        teams_table.grant_read_write_data(api_fn)
        invites_table.grant_read_write_data(api_fn)
        media_table.grant_read_write_data(api_fn)
        audit_table.grant_read_write_data(api_fn)
        users_table.grant_read_write_data(api_fn)
        team_members_table.grant_read_write_data(api_fn)
        auth_codes_table.grant_read_write_data(api_fn)

        api_fn.add_to_role_policy(iam.PolicyStatement(
            actions=["s3:PutObject", "s3:GetObject", "s3:HeadObject", "s3:DeleteObject"],
            resources=[
                media_bucket.arn_for_objects("media/*"),
                media_bucket.arn_for_objects("thumbnails/*"),  # Allow API to fetch thumbnails
            ],
        ))

        api_fn.add_to_role_policy(iam.PolicyStatement(
            actions=["ses:SendEmail", "ses:SendRawEmail"],
            resources=["*"]
        ))

        http_api = apigwv2.HttpApi(
            self,
            "HttpApi",
            cors_preflight=apigwv2.CorsPreflightOptions(
                allow_headers=["content-type", "x-invite-token", "x-setup-key"],
                allow_methods=[
                    apigwv2.CorsHttpMethod.GET,
                    apigwv2.CorsHttpMethod.POST,
                    apigwv2.CorsHttpMethod.DELETE,
                    apigwv2.CorsHttpMethod.OPTIONS,
                ],
                allow_origins=["*"],  # tighten after you know your CloudFront domain
                max_age=Duration.days(10),
            ),
        )

        integration = apigwv2_integrations.HttpLambdaIntegration(
            "LambdaIntegration",
            handler=api_fn
        )

        for route in [
            ("/health", apigwv2.HttpMethod.GET),
            ("/me", apigwv2.HttpMethod.GET),
            ("/demo", apigwv2.HttpMethod.GET),
            ("/teams", apigwv2.HttpMethod.POST),
            ("/invites", apigwv2.HttpMethod.POST),
            ("/invites/revoke", apigwv2.HttpMethod.POST),
            ("/auth/join-team", apigwv2.HttpMethod.POST),
            ("/auth/verify", apigwv2.HttpMethod.POST),
            ("/media", apigwv2.HttpMethod.GET),
            ("/media", apigwv2.HttpMethod.DELETE),
            ("/media/thumbnail", apigwv2.HttpMethod.GET),
            ("/media/upload-url", apigwv2.HttpMethod.POST),
            ("/media/complete", apigwv2.HttpMethod.POST),
            ("/media/download-url", apigwv2.HttpMethod.GET),
        ]:
            http_api.add_routes(path=route[0], methods=[route[1]], integration=integration)

        # -------------------------
        # Thumbnail Generation Lambda
        # -------------------------
        pillow_layer = _lambda.LayerVersion(
            self,
            "PillowLayer",
            code=_lambda.Code.from_asset("../layer_pillow/pillow_layer.zip"),
            compatible_runtimes=[_lambda.Runtime.PYTHON_3_12],
            description="Pillow for image thumbnail generation",
        )

        thumb_fn = _lambda.Function(
            self,
            "ThumbnailFunction",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="thumbs.thumbnail_handler.handler",
            code=_lambda.Code.from_asset("../backend/src"),
            timeout=Duration.seconds(30),
            memory_size=1024,
            environment={
                "MEDIA_BUCKET": media_bucket.bucket_name,
                "TABLE_MEDIA": media_table.table_name,
                "MEDIA_GSI_NAME": "gsi1",
            },
            layers=[pillow_layer],
        )

        media_bucket.grant_read(thumb_fn, "media/*")
        media_bucket.grant_put(thumb_fn, "thumbnails/*")
        media_table.grant_read_write_data(thumb_fn)

        media_bucket.add_event_notification(
            s3.EventType.OBJECT_CREATED,
            s3n.LambdaDestination(thumb_fn),
            s3.NotificationKeyFilter(prefix="media/")
        )

        # -------------------------
        # Frontend Hosting: S3 + CloudFront (private bucket)
        # -------------------------
        site_bucket = s3.Bucket(
            self,
            "SiteBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            enforce_ssl=True,
            removal_policy=RemovalPolicy.DESTROY,  # dev/MVP only
            auto_delete_objects=True,              # dev/MVP only
        )

        oai = cloudfront.OriginAccessIdentity(self, "SiteOAI")
        site_bucket.grant_read(oai)

        distribution = cloudfront.Distribution(
            self,
            "SiteDistribution",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3Origin(site_bucket, origin_access_identity=oai),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowed_methods=cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
            ),
            default_root_object="index.html",
            error_responses=[
                # SPA routing: any "missing" path loads index.html
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.minutes(1),
                ),
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.minutes(1),
                ),
            ],
        )

        # Now that we have a stable site URL, make backend return real invite URLs
        api_fn.add_environment("FRONTEND_BASE_URL", f"https://{distribution.domain_name}")

        # Upload the built frontend assets from ../frontend/dist
        # IMPORTANT: build frontend before `cdk deploy`
        s3deploy.BucketDeployment(
            self,
            "DeployFrontend",
            sources=[s3deploy.Source.asset("../frontend/dist")],
            destination_bucket=site_bucket,
            distribution=distribution,
            distribution_paths=["/*"],
            # Light caching for MVP; tweak later:
            cache_control=[
                s3deploy.CacheControl.from_string("public, max-age=300"),
            ],
        )

        # -------------------------
        # Outputs
        # -------------------------
        CfnOutput(self, "ApiBaseUrl", value=http_api.url or "")
        CfnOutput(self, "MediaBucketName", value=media_bucket.bucket_name)
        CfnOutput(self, "SiteUrl", value=f"https://{distribution.domain_name}")
