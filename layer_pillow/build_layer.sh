#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/out"
rm -rf "$OUT"
mkdir -p "$OUT/python"

# Build in Lambda-compatible container (Amazon Linux)
docker run --rm -v "$OUT":/var/task public.ecr.aws/lambda/python:3.12 \
  bash -lc "pip install --no-cache-dir pillow -t /var/task/python"

cd "$OUT"
zip -r "$ROOT/pillow_layer.zip" python >/dev/null
echo "Built: $ROOT/pillow_layer.zip"
