#!/bin/bash
# Set up GitHub OIDC for AWS
# Run this once to enable GitHub Actions to deploy without long-lived AWS keys

set -e

AWS_REGION=${1:-us-east-1}
GITHUB_ORG=${2:-your-github-org}
GITHUB_REPO=${3:-team-media-hub}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "Setting up GitHub OIDC provider..."
echo "AWS Account: $AWS_ACCOUNT_ID"
echo "GitHub: $GITHUB_ORG/$GITHUB_REPO"

# Create OIDC provider if not exists
PROVIDER_ARN=$(aws iam list-open-id-connect-providers --region $AWS_REGION --query "OpenIDConnectProviderList[?contains(OpenIDConnectProviderArn, 'token.actions.githubusercontent.com')].OpenIDConnectProviderArn" --output text)

if [ -z "$PROVIDER_ARN" ]; then
  echo "Creating OIDC provider..."
  PROVIDER_ARN=$(aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
    --client-id-list sts.amazonaws.com \
    --query 'OpenIDConnectProviderArn' \
    --output text)
  echo "Created: $PROVIDER_ARN"
else
  echo "OIDC provider already exists: $PROVIDER_ARN"
fi

# Create IAM role for GitHub Actions
ROLE_NAME="GitHubActionsDeployRole"
TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "$PROVIDER_ARN"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:sub": "repo:$GITHUB_ORG/$GITHUB_REPO:ref:refs/heads/main",
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
EOF
)

echo "Creating IAM role: $ROLE_NAME"
aws iam create-role \
  --role-name $ROLE_NAME \
  --assume-role-policy-document "$TRUST_POLICY" \
  --description "GitHub Actions deployment role for $GITHUB_REPO" 2>/dev/null || echo "Role already exists"

ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text)
echo "Role ARN: $ROLE_ARN"

# Attach policies for CDK deployment
echo "Attaching deployment policies..."

DEPLOY_POLICY=$(cat <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "s3:*",
        "lambda:*",
        "apigateway:*",
        "apigatewayv2:*",
        "dynamodb:*",
        "cloudfront:*",
        "iam:*",
        "logs:*",
        "ec2:*"
      ],
      "Resource": "*"
    }
  ]
}
EOF
)

aws iam put-role-policy \
  --role-name $ROLE_NAME \
  --policy-name GitHubActionsDeployPolicy \
  --policy-document "$DEPLOY_POLICY"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Add these secrets to your GitHub repo:"
echo "  AWS_ROLE_ARN=$ROLE_ARN"
echo "  SETUP_KEY=<your-setup-key>"
echo ""
echo "Visit: https://github.com/$GITHUB_ORG/$GITHUB_REPO/settings/secrets/actions"
