// Policy checks for the GitHub Actions workflows (QUALITY.md §3; external review #16, #17 and the deploy-gating P3).
// Usage: node scripts/check-workflows.mjs [repo root]   — exits 1 and prints one line per violation.
//
//   W1  every `run:` step runs under bash with pipefail: workflow/job `defaults.run.shell: bash`, or `shell: bash` on the step
//       (GitHub's implicit shell is `bash -e` WITHOUT pipefail, so `terraform plan | tee plan.txt` can never fail — #16)
//   W2  every workflow declares top-level `permissions` (least privilege by default)
//   W3  the PR plan job builds the Lambda package before `terraform plan` (the plan reads services/api/dist/vl-api.zip — #17)
//   W4  deploy runs only after a green `ci` run on main, and deploys exactly the commit CI tested
//   W5  composite actions give every `run:` step `shell: bash`
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

// W4 — deploy gating
const deploy = workflows["deploy.yml"];
if (!deploy) fail("deploy.yml", "W4 missing");
else {
  const on = deploy.on ?? {};
  const wr = on.workflow_run;
  if (on.push) fail("deploy.yml", "W4 triggered by `push` — would deploy before CI has passed");
  if (!wr || !(wr.workflows ?? []).includes("ci") || !(wr.types ?? []).includes("completed") || !(wr.branches ?? []).includes("main"))
    fail("deploy.yml", "W4 must be triggered by `workflow_run` of `ci`, types [completed], branches [main]");
  for (const [id, job] of Object.entries(deploy.jobs ?? {})) {
    const cond = String(job.if ?? "");
    if (!/github\.event\.workflow_run\.conclusion\s*==\s*'success'/.test(cond))
      fail("deploy.yml", `W4 job \`${id}\` does not require \`github.event.workflow_run.conclusion == 'success'\``);
    const checkout = (job.steps ?? []).find((s) => String(s.uses ?? "").startsWith("actions/checkout@"));
    if (!/workflow_run\.head_sha/.test(String(checkout?.with?.ref ?? "")))
      fail("deploy.yml", `W4 job \`${id}\` must check out \`github.event.workflow_run.head_sha\` (the commit CI tested)`);
    const gate = (job.steps ?? []).some((s) => typeof s.run === "string" && /gh run list[^\n]*--workflow[= ]ci/.test(s.run));
    if (!gate) fail("deploy.yml", `W4 job \`${id}\` has no step confirming a green \`ci\` run for the commit (covers manual runs too)`);
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
console.log(`workflow policy: ${Object.keys(workflows).length} workflows OK (W1–W5)`);
