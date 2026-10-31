// Policy checks for the GitHub Actions workflows (QUALITY.md §3; external review #16, #17 and the deploy-gating P3).
// Usage: node scripts/check-workflows.mjs [repo root]   — exits 1 and prints one line per violation.
//
//   W1  every `run:` step runs under bash with pipefail: workflow/job `defaults.run.shell: bash`, or `shell: bash` on the step
//       (GitHub's implicit shell is `bash -e` WITHOUT pipefail, so `terraform plan | tee plan.txt` can never fail — #16)
//   W2  every workflow declares top-level `permissions` (least privilege by default)
//   W3  the PR plan job builds the Lambda package before `terraform plan` (the plan reads services/api/dist/vl-api.zip — #17)
//   W4  deploy runs only after a green `ci` run on main, only for the current tip of main, and deploys exactly the
//       commit CI tested (a `gate` job decides; the `deploy` job, in the prod environment, follows it)
//   W5  composite actions give every `run:` step `shell: bash`
//   W6  deploy hands the analytics token to both the site build and Terraform from the same variable, so the
//       beacon tag and the CSP that allows it switch together (review #19)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const root = process.argv[2] ?? ".";
const wfDir = join(root, ".github/workflows");
const problems = [];
const fail = (file, msg) => problems.push(`${file}: ${msg}`);
const runSteps = (job) => (job.steps ?? []).filter((s) => typeof s.run === "string");
const stepName = (s, i) => s.name ?? `step ${i + 1} (${s.run.split("\n")[0].slice(0, 50)})`;

const workflows = Object.fromEntries(
  readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)).map((f) => [f, parse(readFileSync(join(wfDir, f), "utf8"))]),
);

for (const [file, wf] of Object.entries(workflows)) {
  if (!wf.permissions) fail(file, "W2 no top-level `permissions:` block");
  for (const [id, job] of Object.entries(wf.jobs ?? {})) {
    const inherited = job.defaults?.run?.shell ?? wf.defaults?.run?.shell;
    runSteps(job).forEach((s, i) => {
      const shell = s.shell ?? inherited;
      if (shell !== "bash") fail(file, `W1 job \`${id}\`, ${stepName(s, i)}: shell is ${shell ? `"${shell}"` : "implicit (no pipefail)"}, want bash`);
    });
  }
}

// W3 — the PR plan job
const plan = workflows["ci.yml"]?.jobs?.plan;
if (!plan) fail("ci.yml", "W3 no `plan` job");
else {
  const steps = plan.steps ?? [];
  const at = (re) => steps.findIndex((s) => typeof s.run === "string" && re.test(s.run));
  const build = at(/build\.sh/);
  const tfplan = at(/terraform\s+plan/);
  if (tfplan < 0) fail("ci.yml", "W3 plan job has no `terraform plan` step");
  else if (build < 0 || build > tfplan) fail("ci.yml", "W3 plan job must build the Lambda package (services/api/build.sh) before `terraform plan`");
}

// W4 — deploy gating: a `gate` job decides (green ci on main, and still the tip of main), `deploy` follows it
const deploy = workflows["deploy.yml"];
if (!deploy) fail("deploy.yml", "W4 missing");
else {
  const on = deploy.on ?? {};
  const wr = on.workflow_run;
  if (on.push) fail("deploy.yml", "W4 triggered by `push` — would deploy before CI has passed");
  if (!wr || !(wr.workflows ?? []).includes("ci") || !(wr.types ?? []).includes("completed") || !(wr.branches ?? []).includes("main"))
    fail("deploy.yml", "W4 must be triggered by `workflow_run` of `ci`, types [completed], branches [main]");
  const gate = deploy.jobs?.gate;
  const job = deploy.jobs?.deploy;
  if (!gate || !job) fail("deploy.yml", "W4 needs two jobs: `gate` (decides) and `deploy` (needs gate)");
  else {
    if (!/github\.event\.workflow_run\.conclusion\s*==\s*'success'/.test(String(gate.if ?? "")))
      fail("deploy.yml", "W4 job `gate` must require `github.event.workflow_run.conclusion == 'success'`");
    const runs = (gate.steps ?? []).map((st) => String(st.run ?? "")).join("\n");
    if (!/gh run list[^\n]*--workflow[= ]ci/.test(runs))
      fail("deploy.yml", "W4 job `gate` must confirm a green `ci` run for the commit (covers manual runs too)");
    if (!/commits\/main/.test(runs) || !/\$SHA/.test(runs))
      fail("deploy.yml", "W4 job `gate` must deploy only the current tip of main (re-running an old ci run must not roll back)");
    if (![].concat(job.needs ?? []).includes("gate") || !/needs\.gate\.outputs\.go\s*==\s*'true'/.test(String(job.if ?? "")))
      fail("deploy.yml", "W4 job `deploy` must need `gate` and run only if `needs.gate.outputs.go == 'true'`");
    const checkout = (job.steps ?? []).find((st) => String(st.uses ?? "").startsWith("actions/checkout@"));
    if (!/needs\.gate\.outputs\.sha/.test(String(checkout?.with?.ref ?? "")))
      fail("deploy.yml", "W4 job `deploy` must check out `needs.gate.outputs.sha` (the commit CI tested)");
  }
}

// W6 — analytics token reaches the build and Terraform together
if (deploy) {
  for (const [id, job] of Object.entries(deploy.jobs ?? {}).filter(([k]) => k === "deploy")) {
    const tf = String(job.env?.TF_VAR_cf_beacon_token ?? "");
    const build = (job.steps ?? []).find((st) => typeof st.run === "string" && /@vl\/web build/.test(st.run));
    const pub = String(build?.env?.PUBLIC_CF_BEACON_TOKEN ?? job.env?.PUBLIC_CF_BEACON_TOKEN ?? "");
    if (!tf || tf !== pub || !/vars\.CF_BEACON_TOKEN/.test(tf))
      fail("deploy.yml", `W6 job \`${id}\`: the site build's PUBLIC_CF_BEACON_TOKEN (${pub || "unset"}) must equal TF_VAR_cf_beacon_token (${tf || "unset"}), both from vars.CF_BEACON_TOKEN`);
  }
}

// W5 — composite actions
const actionsDir = join(root, ".github/actions");
if (existsSync(actionsDir)) {
  for (const name of readdirSync(actionsDir)) {
    const f = join(actionsDir, name, "action.yml");
    if (!existsSync(f)) continue;
    const a = parse(readFileSync(f, "utf8"));
    (a.runs?.steps ?? []).forEach((s, i) => {
      if (typeof s.run === "string" && s.shell !== "bash") fail(`actions/${name}`, `W5 ${stepName(s, i)}: shell must be bash`);
    });
  }
}

if (problems.length) {
  for (const p of problems) {
    console.log(p);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=workflow policy::${p}`);
  }
  process.exit(1);
}
console.log(`workflow policy: ${Object.keys(workflows).length} workflows OK (W1–W6)`);
