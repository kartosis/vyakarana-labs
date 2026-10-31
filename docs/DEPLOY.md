# Deploying Vyākaraṇa Labs

Everything runs on AWS free-tier services and is created by Terraform. You do steps 1–5 **once**
(about 30 minutes). After that, every push to `main` builds and deploys automatically.

Commands are for **Windows PowerShell**. Run them from the repository folder.

---

## 1. Tools (once per PC)

```powershell
winget install -e --id Amazon.AWSCLI
winget install -e --id Hashicorp.Terraform
winget install -e --id GitHub.cli
winget install -e --id Git.Git
# open a new PowerShell window, then check:
aws --version; terraform version; gh --version
```

## 2. AWS account (once)

1. Sign in to the AWS console as the root user. Turn on **MFA** for root (Account → Security credentials).
2. Open **IAM Identity Center** → Enable → create a user for yourself → assign the
   **AdministratorAccess** permission set on your account. Use this user from now on, not root.
3. Region: **US East (N. Virginia) us-east-1**. CloudFront certificates must live there, so the whole stack does.
4. Billing → **Cost Explorer** → Enable (free). The stack adds its own $0.01 budget alert.

Configure the CLI with that user:

```powershell
aws configure sso          # SSO start URL is on the Identity Center dashboard; profile name: vl-admin
$env:AWS_PROFILE = "vl-admin"
aws sso login
aws sts get-caller-identity   # shows your account id → you are connected
```

## 3. Bootstrap (once)

Creates the Terraform state bucket, GitHub's OIDC identity provider, the two roles GitHub Actions
uses and the permissions boundary for app roles. No AWS keys are ever stored in GitHub.

What the two roles may do (checked in CI by `infra/terraform/tests/test_iam_policies.py`):
- **`vl-github-plan`** (pull requests): AWS read-only, and the state bucket read-only — it can never write
  or delete state.
- **`vl-github-deploy`** (only jobs in the GitHub environment `prod`): the project's services; in IAM only
  roles named `vl-app-*`, created and edited only with the `vl-app-boundary` permissions boundary (which
  grants nothing in IAM or STS) and passed only to Lambda. It cannot change itself, the plan role or the
  boundary.

Because the bootstrap uses your own credentials and local state, the pipeline can never change these roles;
to change them, edit `bootstrap/main.tf` and run `terraform apply` there again.

```powershell
cd infra\terraform\bootstrap
terraform init
terraform apply            # review, type yes
terraform output next_steps
cd ..\..\..
terraform fmt -recursive infra/terraform   # normalise formatting; commit if anything changed
```

## 4. GitHub settings (once)

Use the values printed by `next_steps`:

```powershell
$R = "kartosis/vyakarana-labs"
gh auth login
gh variable set AWS_REGION      -R $R --body "us-east-1"
gh variable set TF_STATE_BUCKET -R $R --body "<state_bucket output>"
gh variable set AWS_PLAN_ROLE   -R $R --body "<plan_role_arn output>"
gh variable set AWS_DEPLOY_ROLE -R $R --body "<deploy_role_arn output>"
gh variable set ALERT_EMAIL     -R $R --body "<email for budget and alarm mail>"
gh api -X PUT "repos/$R/environments/prod"   # the deploy role only trusts this environment
```

Optional: in **Settings → Environments → prod**, add yourself as a required reviewer so each deploy waits for your click.

## 5. First deploy

```powershell
gh workflow run deploy -R kartosis/vyakarana-labs
gh run watch -R kartosis/vyakarana-labs
```

The run summary shows the site URL (`https://dxxxx.cloudfront.net/`). AWS also emails you twice:
**confirm the SNS subscription** (alarms). The budget emails need no confirmation.

## 6. Custom domain on identifyragas.com (Cloudflare DNS)

Two short phases, because the DNS lives in Cloudflare rather than AWS.

**Phase A — request the certificate.** In `infra/terraform/envs/prod/terraform.tfvars` set

```hcl
domain_name   = "sanskrit.identifyragas.com"
acm_validated = false
```

Commit and push. Then read the validation record:

```powershell
cd infra\terraform\envs\prod
terraform init -backend-config="bucket=<state bucket>"
terraform output acm_validation_records
```

In **Cloudflare → identifyragas.com → DNS → Add record**: type **CNAME**, the `name` and `value` from
that output, **Proxy status: DNS only (grey cloud)**. ACM validates within minutes.

**Phase B — attach the domain.** Set `acm_validated = true`, commit, push. When the deploy finishes, add:

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `sanskrit` | `cname_target` from the run summary (`dxxxx.cloudfront.net`) | **DNS only** |

Then set the repository variable `SITE_URL` to `https://sanskrit.identifyragas.com`.

> Keep both records **DNS only**. Proxying through Cloudflare would put a second CDN in front of CloudFront
> and break certificate validation.

## 7. Turn on accounts (sign-in, practice, reviews, leaderboard)

Accounts need a verified email sender (Amazon SES) because sign-in codes are emailed.

**Step 1 — email identity.** In `infra/terraform/envs/prod/terraform.tfvars` set
`ses_domain = "sanskrit.identifyragas.com"`, commit, push. Then:

```powershell
cd infra\terraform\envs\prod
terraform init -backend-config="bucket=<state bucket>"
terraform output ses_dkim_records
```

Add the **three CNAME records** in Cloudflare (DNS only). In a few minutes
`terraform output ses_verified` shows `true` (or check SES → Identities in the console).

**Step 2 — production access.** New AWS accounts start in the SES *sandbox*, where mail only goes to
verified addresses. In the console: **SES → Account dashboard → Request production access**.
Use case: *Transactional — one-time sign-in codes for a free Sanskrit course; expected volume under
1,000 emails a day; no marketing mail.* Approval usually takes about a day. While you wait, you can test
by verifying your own email address under SES → Identities.

**Step 3 — switch on.** Set `accounts_enabled = true`, commit, push. The deploy creates Cognito,
DynamoDB and the API, routes `/api/*` through CloudFront, and writes `/config.json` so the site shows
the sign-in form.

**Step 4 — make yourself an admin** (after your first sign-in on the site):

```powershell
$pool = terraform output -json web_config | ConvertFrom-Json | Select-Object -ExpandProperty userPoolId
aws cognito-idp admin-add-user-to-group --user-pool-id $pool --username <your email> --group-name admin
```

## 8. Later

| When | What you do |
|---|---|
| Analytics | Cloudflare → Web Analytics → Add site → copy the token into the repository variable `CF_BEACON_TOKEN`. |

## What it costs

| Service | Free allowance used | Expected |
|---|---|---|
| CloudFront | 1 TB + 10 M requests / month, always free | $0 |
| S3 | ~30 MB of site files | < $0.01 |
| Lambda, DynamoDB (from M3) | always-free tiers, provisioned capacity ≤ 25 units | $0 |
| Cognito Essentials (from M3) | 10,000 monthly active users, does not expire | $0 |
| SES (from M3) | sign-in codes, about $0.10 per 1,000 emails | cents |
| Budgets, SNS | 2 budgets, 1,000 emails | $0 |

The budget alarm emails you at the first cent of actual spend.

## Rolling back

Every deploy is a git commit. Revert the commit and push; the pipeline redeploys the previous site.
Terraform state is versioned in S3 (30 days of history).
