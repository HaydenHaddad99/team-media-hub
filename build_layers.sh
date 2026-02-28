#!/bin/bash
# Build Lambda layers for deployment

set -e

echo "Building Lambda layers..."

# Build cryptography layer
echo "Building cryptography layer..."
mkdir -p layers/cryptography/python
pip3 install cryptography -t layers/cryptography/python/ --upgrade --force-reinstall --only-binary=:all: --python-version 312 --implementation cp --abi cp312 --platform linux_arm64

echo "✅ Lambda layers built successfully"
