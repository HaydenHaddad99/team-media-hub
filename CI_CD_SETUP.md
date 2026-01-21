# GitHub Actions CI/CD Setup

This directory contains scripts and documentation for setting up CI/CD pipelines.

## Setup Instructions

### 1. Run the OIDC setup script

```bash
chmod +x scripts/setup-github-oidc.sh
./scripts/setup-github-oidc.sh us-east-1 <your-github-org> team-media-hub
```

Replace `<your-github-org>` with your actual GitHub org or username.

### 2. Add GitHub secrets

The script will output your `AWS_ROLE_ARN`. Add these to your GitHub repo settings:

- `AWS_ROLE_ARN`: Role ARN from script output
- `SETUP_KEY`: Your team creation setup key (e.g., `my-secret-setup-key-12345`)

Go to: `https://github.com/<org>/<repo>/settings/secrets/actions`

### 3. Push to main branch

Once secrets are set, push any change to `main` branch to trigger deployment:

```bash
git add .
git commit -m "Enable CI/CD"
git push origin main
```

## Workflows

### `ci.yml` - Pull Request CI
- **Trigger**: Any PR to `main`
- **Steps**:
  - Lint Python backend (flake8)
  - Build React frontend (npm run build)
  - Verify build artifacts

### `deploy.yml` - Main Branch Deploy
- **Trigger**: Commits to `main` branch
- **Steps**:
  - Build frontend
  - Deploy with CDK (`cdk deploy`)
  - S3 frontend upload (automatic via CDK BucketDeployment)

## Security

- Uses GitHub OIDC (no long-lived AWS keys stored)
- Trust policy scoped to `main` branch only
- SETUP_KEY stored as GitHub secret (never exposed)
- IAM role has narrowest possible permissions for your stack

## Troubleshooting

**"role not found" error**: Make sure you ran the setup script and set `AWS_ROLE_ARN` secret.

**"SETUP_KEY is empty"**: Add `SETUP_KEY` secret to GitHub.

**CDK deploy fails**: Check CloudFormation events in AWS Console for details.
