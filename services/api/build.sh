#!/usr/bin/env bash
# Package the API for AWS Lambda (python3.13, arm64). boto3 comes with the runtime.
# Output: services/api/dist/vl-api.zip
set -euo pipefail
cd "$(dirname "$0")"
rm -rf build dist && mkdir -p build/pkg dist
uv export --no-dev --no-hashes --no-emit-project --format requirements-txt -o build/requirements.txt -q
python3 -m pip install --quiet --target build/pkg \
  --platform manylinux2014_aarch64 --implementation cp --python-version 3.13 --only-binary=:all: \
  -r build/requirements.txt
# The Lambda runtime already provides boto3/botocore and their dependencies.
rm -rf build/pkg/{botocore,boto3,s3transfer,jmespath,dateutil,urllib3,six.py}* build/pkg/python_dateutil* build/pkg/bin
cp -r src/vl_api build/pkg/
find build/pkg -name "__pycache__" -type d -prune -exec rm -rf {} +
(cd build/pkg && zip -qr9 ../../dist/vl-api.zip .)
echo "built dist/vl-api.zip ($(du -h dist/vl-api.zip | cut -f1))"
