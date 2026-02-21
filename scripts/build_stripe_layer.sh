#!/usr/bin/env bash
set -euo pipefail

rm -rf layers/stripe/python
mkdir -p layers/stripe/python
python3 -m pip install -q stripe -t layers/stripe/python

test -d layers/stripe/python/stripe
PYTHONPATH=layers/stripe/python python3 -c "import stripe; print(stripe.VERSION)"
