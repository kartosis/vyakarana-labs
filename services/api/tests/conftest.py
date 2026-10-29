from __future__ import annotations

import json
import os
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any

import boto3
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from moto import mock_aws

os.environ.update(
    {
        "AWS_DEFAULT_REGION": "us-east-1",
        "AWS_REGION": "us-east-1",
        "AWS_ACCESS_KEY_ID": "testing",
        "AWS_SECRET_ACCESS_KEY": "testing",
        "TABLE_NAME": "vl-main",
        "USER_POOL_ID": "us-east-1_TEST",
        "CLIENT_ID": "client-123",
        "POWERTOOLS_TRACE_DISABLED": "1",
        "POWERTOOLS_SERVICE_NAME": "vl-api",
    }
)

ISSUER = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TEST"
_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


@dataclass
class _SigningKey:
    key: Any


class FakeJwks:
    def get_signing_key_from_jwt(self, token: str) -> _SigningKey:
        return _SigningKey(_KEY.public_key())


def make_token(sub: str = "user-1", **overrides: Any) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "sub": sub,
        "iss": ISSUER,
        "client_id": "client-123",
        "token_use": "access",
        "username": sub,
        "iat": now,
        "exp": now + 3600,
        **overrides,
    }
    return jwt.encode(claims, _KEY, algorithm="RS256")


def create_table() -> Any:
    ddb = boto3.client("dynamodb")
    ddb.create_table(
        TableName="vl-main",
        AttributeDefinitions=[
            {"AttributeName": n, "AttributeType": "S"} for n in ("PK", "SK", "LSI1SK", "GSI1PK", "GSI1SK")
        ],
        KeySchema=[{"AttributeName": "PK", "KeyType": "HASH"}, {"AttributeName": "SK", "KeyType": "RANGE"}],
        LocalSecondaryIndexes=[
            {
                "IndexName": "LSI1",
                "KeySchema": [
                    {"AttributeName": "PK", "KeyType": "HASH"},
                    {"AttributeName": "LSI1SK", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
        GlobalSecondaryIndexes=[
            {
                "IndexName": "GSI1",
                "KeySchema": [
                    {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                    {"AttributeName": "GSI1SK", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
                "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5},
            }
        ],
        BillingMode="PROVISIONED",
        ProvisionedThroughput={"ReadCapacityUnits": 10, "WriteCapacityUnits": 10},
    )
    return boto3.resource("dynamodb").Table("vl-main")


@pytest.fixture
def aws(monkeypatch: pytest.MonkeyPatch) -> Iterator[Any]:
    with mock_aws():
        table = create_table()
        from vl_api import app as app_module
        from vl_api import auth

        app_module.repo.cache_clear()
        monkeypatch.setattr(auth, "_jwks", lambda: FakeJwks())
        yield table


class Ctx:
    function_name = "vl-api"
    memory_limit_in_mb = 256
    invoked_function_arn = "arn:aws:lambda:us-east-1:123456789012:function:vl-api"
    aws_request_id = "req-1"


Call = Callable[..., tuple[int, Any, dict[str, Any]]]


@pytest.fixture
def call(aws: Any) -> Call:
    from vl_api.app import handler

    def _call(
        method: str,
        path: str,
        body: Any = None,
        token: str | None = None,
        cookies: list[str] | None = None,
        query: str = "",
    ) -> tuple[int, Any, dict[str, Any]]:
        headers = {"content-type": "application/json"}
        if token:
            headers["x-vl-auth"] = f"Bearer {token}"
        event = {
            "version": "2.0",
            "routeKey": "$default",
            "rawPath": path,
            "rawQueryString": query,
            "queryStringParameters": dict(p.split("=", 1) for p in query.split("&")) if query else None,
            "headers": headers,
            "cookies": cookies or [],
            "requestContext": {
                "http": {
                    "method": method,
                    "path": path,
                    "protocol": "HTTP/1.1",
                    "sourceIp": "1.2.3.4",
                    "userAgent": "t",
                },
                "accountId": "anonymous",
                "apiId": "x",
                "domainName": "x.lambda-url.us-east-1.on.aws",
                "domainPrefix": "x",
                "requestId": "r",
                "routeKey": "$default",
                "stage": "$default",
                "time": "29/Oct/2026:00:00:00 +0000",
                "timeEpoch": 0,
            },
            "body": json.dumps(body) if body is not None else None,
            "isBase64Encoded": False,
        }
        res = handler(event, Ctx())
        payload = json.loads(res["body"]) if res.get("body") else None
        return res["statusCode"], payload, res

    return _call
