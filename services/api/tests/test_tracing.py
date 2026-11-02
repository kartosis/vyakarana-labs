"""Second exit review Y1: X-Ray must never receive response bodies (refresh tokens, ID tokens, exports).

Powertools' Tracer records each handler's response as trace metadata by default. Tracing is configured at
import time and the rest of the suite disables it, so this runs the handler in a fresh interpreter with
tracing on and captures every segment the X-Ray SDK would send.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SCRIPT = r"""
import json, os, sys
sys.path[:0] = [sys.argv[1], sys.argv[2]]
import conftest
os.environ.pop("POWERTOOLS_TRACE_DISABLED", None)
TRACE = "Root=1-5759e988-bd862e3fe1be46a994272793;Parent=53995c3f42cd8ad8;Sampled=1"
os.environ.update({"LAMBDA_TASK_ROOT": "/var/task", "AWS_LAMBDA_FUNCTION_NAME": "vl-api"})
os.environ["_X_AMZN_TRACE_ID"] = TRACE
from moto import mock_aws
with mock_aws():
    conftest.create_table()
    from aws_xray_sdk.core import xray_recorder
    sent = []
    xray_recorder.emitter.send_entity = lambda e: sent.append(e.serialize())
    from vl_api import app as A, auth
    auth._jwks = lambda: conftest.FakeJwks()
    tok = conftest.make_token("u1")
    path = "/api/v1/auth/session"
    http = {"method": "POST", "path": path, "sourceIp": "1.2.3.4"}
    ev = {"version": "2.0", "routeKey": "$default", "rawPath": path, "rawQueryString": "", "cookies": [],
          "headers": {"content-type": "application/json", "x-vl-auth": f"Bearer {tok}"},
          "requestContext": {"http": http, "requestId": "r", "domainName": "x", "stage": "$default"},
          "body": json.dumps({"refreshToken": "SECRET-REFRESH-TOKEN-0123456789"}), "isBase64Encoded": False}
    out = A.handler(ev, conftest.Ctx())
    leak = "SECRET-REFRESH-TOKEN" in "\n".join(sent)
    print(json.dumps({"status": out["statusCode"], "segments": len(sent), "leak": leak}))
"""


def test_traces_do_not_carry_response_bodies() -> None:
    tests = Path(__file__).resolve().parent
    run = subprocess.run(  # noqa: S603 (fixed command: this interpreter and a script defined above)
        [sys.executable, "-c", SCRIPT, str(tests), str(tests.parent / "src")],
        capture_output=True,
        text=True,
        cwd=tests.parent,
        timeout=120,
    )
    assert run.returncode == 0, run.stderr[-2000:]
    import json

    out = json.loads(run.stdout.strip().splitlines()[-1])
    assert out["status"] == 200 and out["segments"] >= 1  # tracing really ran
    assert out["leak"] is False, "the refresh token reached X-Ray"
