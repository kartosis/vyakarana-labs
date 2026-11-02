# What the owner does (Kartik) — step by step

Everything here needs your accounts or your decision; Claude cannot do it from its sandbox (the GitHub proxy
blocks repository-settings APIs, and AWS needs your credentials). Commands are **Windows PowerShell**.
Tick items off in `docs/PROGRESS.md` §7 (U-numbers) or tell Claude and it will.

| Part | When | Time | Unblocks |
|---|---|---|---|
| **A. Decisions** (reply to Claude) | now | 5 min | LICENSE, SECURITY.md, ROADMAP P2 |
| **B. GitHub security settings** | now | 10 min | P2 exit (Dependabot, CodeQL, secret scanning, private reports) |
| **C. Branch protection (ruleset)** | now, after B | 10 min | every later change goes through a pull request with green CI |
| **D. AWS account** | before the first deploy | 30 min | P4 staging / P6 production |
| **E. Bootstrap + GitHub variables + `prod` environment** | after D | 20 min | the deploy pipeline |
| **F. First deploy, domain, accounts, analytics** | after E | 1 h + waiting (DNS, SES approval) | the live site |

---

## A. Decisions — reply to Claude with one line

**A1 · Licences (U7)** — pick one for code and one for lesson content:

| | Option | What it means |
|---|---|---|
| Code | **MIT** *(recommended)* | Anyone may reuse with attribution; same licence as vidyut-prakriyā |
| Code | Apache-2.0 | Like MIT plus an explicit patent grant; longer notice file |
| Content (lessons, exercises, translations) | **CC BY-SA 4.0** *(recommended)* | Reuse with credit; derivatives must stay open under the same licence |
| Content | CC BY-NC-SA 4.0 | As above, but no commercial reuse |
| Content | All rights reserved | Nobody may republish the lessons |

Third-party notices (vidyut MIT, ashtadhyayi.com data credit, fonts OFL) are added whichever you choose.

**A2 · Security contact (U10)** — *(recommended)* **GitHub private vulnerability reporting only**, no public email.
Alternative: also publish an address (e.g. a `security@identifyragas.com` alias) — it will be public in `SECURITY.md`
and `/.well-known/security.txt`.

> Example reply: **"Code MIT, content CC BY-SA 4.0, security contact: GitHub private reporting only."**

---

## B. GitHub security settings (U9) — about 10 minutes, browser

Repository → **Settings** → sidebar section **Security and quality** → **Advanced Security**. On that page:

1. **Private vulnerability reporting** → **Enable**. (The issue form's "Report a security problem privately" link needs it.)
2. **Dependabot alerts** → **Enable**. Then **Dependabot security updates** → **Enable**.
   (Weekly *version* updates are already configured in `.github/dependabot.yml`; they start on their own.)
3. **Secret Protection** → **Enable** (if not already on) → then **Push protection** → **Enable**.
4. **Code Security → CodeQL analysis** → **Set up** → **Default** → review → **Enable CodeQL**.
   It detects JavaScript/TypeScript, Python and GitHub Actions and scans every push and pull request.

Check: the **Security** tab of the repository now shows *Code scanning*, *Secret scanning* and *Dependabot*.

---

## C. Branch protection with a ruleset (U8) — about 10 minutes, browser

**Why these settings:** GitHub does not let you approve your own pull request, and Claude's commits go out under
your account. So *required approvals* and *code-owner review* would block every change. The protection that
matters for a solo project is: **changes reach `main` only through a pull request whose CI is green**.

1. Repository → **Settings** → sidebar **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**.
2. **Ruleset name:** `main`. **Enforcement status:** **Active**.
3. **Bypass list** → **Add bypass** → **Repository admin** (you), mode **For pull requests only** if offered —
   your emergency door; leave Claude/apps off it.
4. **Target branches** → **Add a target** → **Include default branch**.
5. **Branch rules** — tick exactly these:

   | Rule | Setting |
   |---|---|
   | **Restrict deletions** | on |
   | **Require linear history** | on (merges are squash or rebase) |
   | **Require a pull request before merging** | on · **Required approvals: 0** · *Require review from Code Owners*: **off** · *Require conversation resolution*: on |
   | **Require status checks to pass** | on · *Require branches to be up to date*: on · add the checks below |
   | **Block force pushes** | on |

   Status checks to add (type each name, click **+**; they appear in the list once CI has run on a PR):
   - `Engine tests and site build`
   - `Browser tests (accessibility, CSP, account flows)`
   - `API lint, types and tests (ubuntu-latest)`
   - `API lint, types and tests (windows-latest)`
   - `Terraform validate`

   Do **not** add `Terraform plan (pull requests)` — it is skipped until AWS is set up.
6. **Create**.

Then tell Claude **"ruleset is on"**: it switches from pushing to `main` to opening pull requests that merge
themselves when CI is green (`gh pr merge --auto --squash`).

---

## D. AWS account (U2) — about 30 minutes, browser + PowerShell

1. **Account plan — important.** Accounts created since July 2025 start on the **Free plan**, which ends after
   **6 months** (or when the $100–200 credits run out); AWS then **closes the account and deletes everything after
   90 days**. A production site needs the **Paid plan**: console → **Billing and Cost Management** → **Upgrade plan**
   → **Upgrade account**. You keep the credits and every *always free* allowance (CloudFront, Lambda, DynamoDB,
   Cognito's 10,000 monthly users); the stack's **$0.01 budget alert** emails you at the first cent of real spend.
   *(Enabling IAM Identity Center in step 3 also upgrades the plan automatically.)*
2. Sign in as **root** → account menu → **Security credentials** → **Assign MFA device** (authenticator app).
3. **IAM Identity Center** → **Enable** → **Users** → **Add user** (you) → **AWS accounts** → your account →
   **Assign users** → permission set **AdministratorAccess**. From now on use this user, not root.
4. Region **US East (N. Virginia) `us-east-1`** (CloudFront certificates must live there).
5. **Billing → Cost Explorer → Enable** (free).
6. Tools and CLI login:

   ```powershell
   winget install -e --id Amazon.AWSCLI
   winget install -e --id Hashicorp.Terraform
   winget install -e --id GitHub.cli
   winget install -e --id Git.Git
   # new PowerShell window:
   aws configure sso            # start URL: Identity Center dashboard; region us-east-1; profile name: vl-admin
   $env:AWS_PROFILE = "vl-admin"
   aws sso login
   aws sts get-caller-identity  # shows your account id → connected
   ```

---

## E. Bootstrap, GitHub variables, `prod` environment (U3, U6, U6b) — about 20 minutes

```powershell
git clone https://github.com/kartosis/vyakarana-labs.git
cd vyakarana-labs\infra\terraform\bootstrap
terraform init
terraform apply                 # read the plan; type yes
terraform output next_steps     # prints the four values used below
cd ..\..\..

$R = "kartosis/vyakarana-labs"
gh auth login
gh variable set AWS_REGION      -R $R --body "us-east-1"
gh variable set TF_STATE_BUCKET -R $R --body "<state_bucket from next_steps>"
gh variable set AWS_PLAN_ROLE   -R $R --body "<plan_role_arn>"
gh variable set AWS_DEPLOY_ROLE -R $R --body "<deploy_role_arn>"
gh variable set ALERT_EMAIL     -R $R --body "<email for budget and alarm mail>"

# The deploy role trusts jobs in the "prod" environment, so only main may use it (U6b — do not skip):
'{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' |
  gh api -X PUT "repos/$R/environments/prod" --input -
gh api -X POST "repos/$R/environments/prod/deployment-branch-policies" -f name=main -f type=branch
gh api "repos/$R/environments/prod" --jq .deployment_branch_policy   # expect custom_branch_policies: true
```

Optional: **Settings → Environments → prod → Required reviewers** → add yourself, so each deploy waits for a click.

---

## F. Go live (U4, U5) — details and troubleshooting in `docs/DEPLOY.md` §5–8

1. **First deploy:** `gh workflow run deploy -R kartosis/vyakarana-labs` then `gh run watch -R kartosis/vyakarana-labs`.
   The summary shows the site URL (`https://dxxxx.cloudfront.net/`). Confirm the **SNS subscription** email.
2. **Domain** (Cloudflare, `identifyragas.com`) — DEPLOY.md §6: set `domain_name` + `acm_validated = false` →
   add the validation CNAME (**DNS only, grey cloud**) → set `acm_validated = true` → add `sanskrit` CNAME →
   set the variable `SITE_URL`. *(Claude can make the `terraform.tfvars` commits; you add the DNS records.)*
3. **Accounts** — DEPLOY.md §7: `ses_domain` → 3 DKIM CNAMEs in Cloudflare → **SES → Request production access**
   (about a day) → `accounts_enabled = true` → after your first sign-in, add yourself to the `admin` group.
4. **Analytics (optional)** — Cloudflare → Web Analytics → add site → put the token in the variable `CF_BEACON_TOKEN`.
