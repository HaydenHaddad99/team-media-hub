
import os
import aws_cdk as cdk
from stacks.team_media_hub_stack import TeamMediaHubStack

app = cdk.App()

stage = os.getenv("DEPLOY_STAGE", "prod")
stack_name = "TeamMediaHubStack" if stage == "prod" else f"TeamMediaHubStack-{stage.capitalize()}"

TeamMediaHubStack(
    app,
    stack_name,
    stage=stage,
    env=cdk.Environment(
        account=os.getenv("CDK_DEFAULT_ACCOUNT"),
        region=os.getenv("CDK_DEFAULT_REGION", "us-east-1"),
    ),
)

app.synth()

