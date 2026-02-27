#!/bin/bash
# Add RESEND_API_KEY to GitHub repository secrets
# Run this from the repo root: ./scripts/add_resend_secret.sh

set -e

REPO="HaydenHaddad99/team-media-hub"
SECRET_NAME="RESEND_API_KEY"
SECRET_VALUE="re_9b9dgvqL_KytCcXYYteRD2X2SQ7gqhmoN"

echo "Adding RESEND_API_KEY to GitHub Secrets..."
echo "Repository: $REPO"
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) not installed"
    echo ""
    echo "Install with:"
    echo "  brew install gh          # macOS"
    echo "  sudo apt install gh      # Ubuntu/Debian"
    echo ""
    echo "Or add the secret manually:"
    echo "1. Go to: https://github.com/$REPO/settings/secrets/actions"
    echo "2. Click 'New repository secret'"
    echo "3. Name: $SECRET_NAME"
    echo "4. Value: $SECRET_VALUE"
    echo "5. Click 'Add secret'"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub CLI"
    echo ""
    echo "Run: gh auth login"
    exit 1
fi

# Add the secret
echo "Adding secret..."
echo "$SECRET_VALUE" | gh secret set "$SECRET_NAME" --repo="$REPO"

echo ""
echo "✅ Successfully added RESEND_API_KEY to GitHub Secrets"
echo ""
echo "Verify at: https://github.com/$REPO/settings/secrets/actions"
echo ""
echo "Next steps:"
echo "1. Verify the secret was added (it will show as 'Updated:' with a timestamp)"
echo "2. Trigger a deploy: git push origin main"
echo "3. Monitor GitHub Actions: https://github.com/$REPO/actions"
