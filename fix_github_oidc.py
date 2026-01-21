#!/usr/bin/env python3
import boto3
import json

iam = boto3.client('iam')
account_id = "652056695654"

# Create OIDC provider
try:
    response = iam.create_open_id_connect_provider(
        Url='https://token.actions.githubusercontent.com',
        ThumbprintList=['6938fd4d98bab03faadb97b34396831e3780aea1'],
        ClientIDList=['sts.amazonaws.com']
    )
    print(f"Created OIDC provider: {response['OpenIDConnectProviderArn']}")
except iam.exceptions.EntityAlreadyExistsException:
    print("OIDC provider already exists")

# Create/update IAM role
role_name = "GitHubActionsDeployRole"
trust_policy = {
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow",
        "Principal": {
            "Federated": f"arn:aws:iam::{account_id}:oidc-provider/token.actions.githubusercontent.com"
        },
        "Action": "sts:AssumeRoleWithWebIdentity",
        "Condition": {
            "StringEquals": {
                "token.actions.githubusercontent.com:sub": "repo:haydenhaddad99/team-media-hub:ref:refs/heads/main",
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
            }
        }
    }]
}

try:
    response = iam.create_role(
        RoleName=role_name,
        AssumeRolePolicyDocument=json.dumps(trust_policy),
        Description="GitHub Actions deployment role"
    )
    print(f"Created role: {response['Role']['Arn']}")
except iam.exceptions.EntityAlreadyExistsException:
    # Update trust policy
    iam.update_assume_role_policy(
        RoleName=role_name,
        PolicyDocument=json.dumps(trust_policy)
    )
    print("Updated role trust policy")

# Add deployment policy
deploy_policy = {
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow",
        "Action": [
            "cloudformation:*", "s3:*", "lambda:*", "apigateway:*",
            "apigatewayv2:*", "dynamodb:*", "cloudfront:*", "iam:*",
            "logs:*", "ec2:*", "sts:GetServiceBearerToken"
        ],
        "Resource": "*"
    }]
}

iam.put_role_policy(
    RoleName=role_name,
    PolicyName="GitHubActionsDeployPolicy",
    PolicyDocument=json.dumps(deploy_policy)
)
print("Added deployment policy")

# Get role ARN
role = iam.get_role(RoleName=role_name)
print(f"\n✅ Setup complete!\n")
print(f"Add this to GitHub secrets:")
print(f"AWS_ROLE_ARN={role['Role']['Arn']}")
