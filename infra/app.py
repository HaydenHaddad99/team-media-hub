
import os
import aws_cdk as cdk
from stacks.team_media_hub_stack import TeamMediaHubStack

app = cdk.App()

TeamMediaHubStack(
    app,
    "TeamMediaHubStack",
    env=cdk.Environment(
        account=os.getenv("CDK_DEFAULT_ACCOUNT"),
        region=os.getenv("CDK_DEFAULT_REGION", "us-east-1"),
    ),
)

app.synth()

