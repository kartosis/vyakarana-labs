"""Policy-as-code checks on the IAM written in Terraform (external review #2, #3; QUALITY.md §6).

Reads the HCL directly (python-hcl2), so it needs no AWS credentials and no Terraform binary:
    uv run --no-project --with python-hcl2==7.3.1 --with pytest pytest -q infra/terraform/tests

What it guarantees
  * the deploy role can change IAM only on app roles (`vl-app-*`), never on the pipeline roles (`vl-github-*`);
  * every app role it creates or edits carries the permissions boundary, which it cannot remove or rewrite;
  * it can pass app roles only to Lambda;
  * the plan role (pull requests) can read the Terraform state but never write or delete it;
  * the boundary grants no IAM or STS, and covers what the API role grants;
  * the API role grants every DynamoDB / Cognito action the API code actually calls.
"""

from __future__ import annotations

import fnmatch
import re
from pathlib import Path
from typing import Any

import hcl2
import pytest

TF = Path(__file__).resolve().parents[1]
REPO = TF.parents[1]
ACCOUNT = "123456789012"
BOUNDARY_REF = "${aws_iam_policy.app_boundary.arn}"

Stmt = dict[str, Any]


def load(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        return hcl2.load(f)


def policy_docs(tf: dict[str, Any]) -> dict[str, list[Stmt]]:
    out: dict[str, list[Stmt]] = {}
    for block in tf.get("data", []):
        for name, body in block.get("aws_iam_policy_document", {}).items():
            out[name] = body.get("statement", [])
    return out


def resources(tf: dict[str, Any], kind: str) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for block in tf.get("resource", []):
        out.update(block.get(kind, {}))
    return out


def concrete(s: str) -> str:
    """Interpolations → sample values, so ARNs can be matched."""
    s = s.replace("${data.aws_caller_identity.me.account_id}", ACCOUNT)
    s = s.replace("${aws_s3_bucket.state.arn}", "arn:aws:s3:::vyakarana-labs-tfstate-" + ACCOUNT)
    s = s.replace(BOUNDARY_REF, f"arn:aws:iam::{ACCOUNT}:policy/vl-app-boundary")
    return s


def matches(patterns: list[str], value: str) -> bool:
    return any(fnmatch.fnmatchcase(value.lower(), concrete(p).lower()) for p in patterns)


def effect(s: Stmt) -> str:
    return str(s.get("effect", "Allow"))


def conditions(s: Stmt) -> dict[str, tuple[str, list[str]]]:
    return {c["variable"]: (c["test"], list(c["values"])) for c in s.get("condition", [])}


def applying(stmts: list[Stmt], action: str, resource: str, eff: str) -> list[Stmt]:
    return [
        s
        for s in stmts
        if effect(s) == eff and matches(s.get("actions", []), action) and matches(s.get("resources", ["*"]), resource)
    ]


def role_policies(tf: dict[str, Any], role: str) -> list[Stmt]:
    """Statements of every inline policy attached to aws_iam_role.<role>."""
    docs = policy_docs(tf)
    out: list[Stmt] = []
    for rp in resources(tf, "aws_iam_role_policy").values():
        if rp["role"] == f"${{aws_iam_role.{role}.id}}":
            ref = re.fullmatch(r"\$\{data\.aws_iam_policy_document\.(\w+)\.json\}", rp["policy"])
            assert ref, f"inline policy of {role} must come from a policy document: {rp['policy']}"
            out += docs[ref.group(1)]
    return out


BOOT = load(TF / "bootstrap" / "main.tf")
DEPLOY = role_policies(BOOT, "deploy")
PLAN = role_policies(BOOT, "plan")
IAM_WRITES = [
    "iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole", "iam:UpdateAssumeRolePolicy", "iam:PutRolePolicy",
    "iam:DeleteRolePolicy", "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:PutRolePermissionsBoundary",
    "iam:DeleteRolePermissionsBoundary", "iam:TagRole", "iam:UntagRole", "iam:PassRole",
]  # fmt: skip
PIPELINE_ROLES = [f"arn:aws:iam::{ACCOUNT}:role/vl-github-deploy", f"arn:aws:iam::{ACCOUNT}:role/vl-github-plan"]
APP_ROLE = f"arn:aws:iam::{ACCOUNT}:role/vl-app-api"


# ---------------------------------------------------------------- review #2: deploy role
@pytest.mark.parametrize("role", PIPELINE_ROLES)
@pytest.mark.parametrize("action", IAM_WRITES)
def test_deploy_role_cannot_touch_pipeline_roles(action: str, role: str) -> None:
    assert not applying(DEPLOY, action, role, "Allow"), f"{action} on {role} is allowed"
    assert applying(DEPLOY, action, role, "Deny"), f"no explicit deny of {action} on {role}"


def test_iam_writes_only_on_app_roles() -> None:
    for s in DEPLOY:
        if effect(s) != "Allow":
            continue
        writes = [a for a in s.get("actions", []) if a.startswith("iam:") and not re.match(r"iam:(Get|List)", a)]
        if not writes or writes == ["iam:CreateServiceLinkedRole"]:
            continue
        for r in s.get("resources", []):
            assert concrete(r).endswith(":role/vl-app-*"), f"{s.get('sid')}: IAM writes on {r}"


@pytest.mark.parametrize(
    "action", ["iam:CreateRole", "iam:PutRolePolicy", "iam:AttachRolePolicy", "iam:PutRolePermissionsBoundary"]
)
def test_role_changes_require_the_boundary(action: str) -> None:
    for s in applying(DEPLOY, action, APP_ROLE, "Allow"):
        test, values = conditions(s).get("iam:PermissionsBoundary", ("", []))
        assert test == "StringEquals" and values == [BOUNDARY_REF], f"{s.get('sid')}: {action} without the boundary"


def test_boundary_cannot_be_removed_or_rewritten() -> None:
    assert applying(DEPLOY, "iam:DeleteRolePermissionsBoundary", APP_ROLE, "Deny")
    boundary = f"arn:aws:iam::{ACCOUNT}:policy/vl-app-boundary"
    for a in ["iam:CreatePolicyVersion", "iam:DeletePolicy", "iam:DeletePolicyVersion", "iam:SetDefaultPolicyVersion"]:
        assert not applying(DEPLOY, a, boundary, "Allow")
        assert applying(DEPLOY, a, boundary, "Deny"), a


def test_pass_role_only_app_roles_only_to_lambda() -> None:
    allowed = [s for s in DEPLOY if effect(s) == "Allow" and matches(s.get("actions", []), "iam:PassRole")]
    assert allowed
    for s in allowed:
        assert all(concrete(r).endswith(":role/vl-app-*") for r in s["resources"]), s.get("sid")
        assert conditions(s).get("iam:PassedToService") == ("StringEquals", ["lambda.amazonaws.com"]), s.get("sid")


def test_boundary_grants_no_iam_or_sts() -> None:
    boundary = policy_docs(BOOT)["app_boundary"]
    for s in boundary:
        if effect(s) == "Allow":
            assert not any(a.split(":")[0] in ("iam", "sts", "organizations", "account") or a == "*" for a in s["actions"])
    assert applying(boundary, "iam:CreateRole", "*", "Deny") and applying(boundary, "sts:AssumeRole", "*", "Deny")


def test_boundary_policy_is_the_one_required() -> None:
    pol = resources(BOOT, "aws_iam_policy")["app_boundary"]
    assert pol["name"] == "vl-app-boundary" and pol["policy"] == "${data.aws_iam_policy_document.app_boundary.json}"


# ---------------------------------------------------------------- review #3: plan role
def test_plan_role_reads_state_but_cannot_write_it() -> None:
    obj = f"arn:aws:s3:::vyakarana-labs-tfstate-{ACCOUNT}/prod/terraform.tfstate"
    for a in ["s3:PutObject", "s3:DeleteObject", "s3:DeleteObjectVersion", "s3:PutObjectAcl"]:
        assert not applying(PLAN, a, obj, "Allow"), a
        assert applying(PLAN, a, obj, "Deny"), a
    assert applying(PLAN, "s3:GetObject", obj, "Allow")


def test_plan_role_has_only_read_only_managed_policy() -> None:
    attached = [
        a["policy_arn"]
        for a in resources(BOOT, "aws_iam_role_policy_attachment").values()
        if a["role"] == "${aws_iam_role.plan.name}"
    ]
    assert attached == ["arn:aws:iam::aws:policy/ReadOnlyAccess"]


# ---------------------------------------------------------------- app roles (modules)
MODULE_ROLES = [
    (path, name, body)
    for path in sorted((TF / "modules").glob("*/*.tf"))
    for name, body in resources(load(path), "aws_iam_role").items()
]


@pytest.mark.parametrize(("path", "name", "body"), MODULE_ROLES, ids=[f"{p.parent.name}.{n}" for p, n, _ in MODULE_ROLES])
def test_app_roles_have_prefix_and_boundary(path: Path, name: str, body: dict[str, Any]) -> None:
    assert body["name"].startswith("${var.name}-app-"), f"{path.parent.name}.{name}: {body['name']}"
    assert body.get("permissions_boundary") == "${var.permissions_boundary}", f"{path.parent.name}.{name}"


def test_prod_passes_the_boundary_to_modules_with_roles() -> None:
    prod = load(TF / "envs" / "prod" / "main.tf")
    with_roles = {p.parent.name for p, _, _ in MODULE_ROLES}
    for block in prod.get("module", []):
        for name, body in block.items():
            if Path(body["source"]).name in with_roles:
                assert "vl-app-boundary" in body.get("permissions_boundary", ""), name


# ---------------------------------------------------------------- the API role covers what the code calls
DDB_CALLS = {
    "get_item": ["GetItem"], "put_item": ["PutItem"], "update_item": ["UpdateItem"], "delete_item": ["DeleteItem"],
    "query": ["Query"], "batch_get_item": ["BatchGetItem"], "batch_writer": ["BatchWriteItem"],
    "transact_write_items": [],  # per operation inside, below
}  # fmt: skip
TX_OPS = {"Put": "PutItem", "Update": "UpdateItem", "Delete": "DeleteItem", "ConditionCheck": "ConditionCheckItem"}
# Cognito user-pool operations a public app client makes without IAM authorization (they are not IAM actions).
COGNITO_PUBLIC = {"InitiateAuth", "RespondToAuthChallenge", "RevokeToken", "GetTokensFromRefreshToken", "SignUp"}


def needed_api_actions() -> set[str]:
    src = (REPO / "services/api/src/vl_api/repo.py").read_text(encoding="utf-8")
    calls = set(re.findall(r"self\.t\.(\w+)\(", src)) | set(re.findall(r"meta\.client\.(\w+)\(", src))
    unknown = calls - DDB_CALLS.keys()
    assert not unknown, f"map these DynamoDB calls to IAM actions: {unknown}"
    actions = {f"dynamodb:{a}" for c in calls for a in DDB_CALLS[c]}
    if "transact_write_items" in calls:
        actions |= {f"dynamodb:{TX_OPS[op]}" for op in re.findall(r'"(Put|Update|Delete|ConditionCheck)":', src)}
    app = (REPO / "services/api/src/vl_api/app.py").read_text(encoding="utf-8")
    ops = {"".join(w.title() for w in m.split("_")) for m in re.findall(r"cognito\(\)\.(\w+)\(", app)}
    actions |= {f"cognito-idp:{op}" for op in ops - COGNITO_PUBLIC}
    return actions


def test_api_role_grants_every_action_the_code_uses() -> None:
    api = policy_docs(load(TF / "modules/api/main.tf"))["api"]
    granted = {a for s in api if effect(s) == "Allow" for a in s["actions"]}
    missing = needed_api_actions() - granted
    assert not missing, f"the API calls these but its role does not grant them: {sorted(missing)}"


def test_boundary_covers_the_api_role() -> None:
    boundary = policy_docs(BOOT)["app_boundary"]
    api = policy_docs(load(TF / "modules/api/main.tf"))["api"]
    for s in api:
        for a in s["actions"]:
            assert any(matches(b["actions"], a) for b in boundary if effect(b) == "Allow"), a
