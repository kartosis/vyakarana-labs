// Cookieless page analytics (Cloudflare Web Analytics), external review #19.
// The repository variable CF_BEACON_TOKEN feeds both the build (PUBLIC_CF_BEACON_TOKEN → the beacon tag) and
// Terraform (the CSP allows the beacon's two hosts), so the tag and the CSP switch together.
//   node e2e/beacon.cjs <dist without token> <dist built with token> <token>
// Checks: no token → no beacon anywhere; token → exactly one beacon per page with that token, and in a browser
// under the production CSP (as Terraform builds it with the switch on) the beacon loads and reports, CSP-clean.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const [plain, withToken, token] = process.argv.slice(2);
const log = [];
const check = (name, ok, extra = '') => {
  log.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok && process.env.GITHUB_ACTIONS) console.log(`::error title=beacon::${name}${extra ? ' (got: ' + String(extra).slice(0, 160) + ')' : ''}`);
};
const pages = (dir) => {
  const out = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) out.push(p);
  });
  walk(dir);
  return out;
};
const BEACON = /<script[^>]*src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js"[^>]*><\/script>/g;

(async () => {
  // 1. without a token
  const leaks = pages(plain).filter((p) => /cloudflareinsights/.test(fs.readFileSync(p, 'utf8')));
  check('no token: no page mentions the beacon', leaks.length === 0, leaks.slice(0, 3).join(', '));

  // 2. with a token
  const all = pages(withToken);
  const bad = all.filter((p) => {
    const tags = fs.readFileSync(p, 'utf8').match(BEACON) ?? [];
    return tags.length !== 1 || !tags[0].includes(`data-cf-beacon="{&quot;token&quot;:&quot;${token}&quot;}"`) || !/\sdefer[\s>]/.test(tags[0]);
  });
  check(`token: every page (${all.length}) has exactly one deferred beacon with the token`, all.length > 100 && bad.length === 0, bad.slice(0, 3).join(', '));

  // 3. in a browser, under the CSP Terraform sets when the switch is on (modules/site, envs/prod)
  const hashesFile = path.join(require('os').tmpdir(), 'csp-beacon.json');
  execFileSync('node', [path.join(__dirname, '../../../scripts/csp-hashes.mjs'), withToken, hashesFile], { stdio: 'ignore' });
  const h = JSON.parse(fs.readFileSync(hashesFile, 'utf8'));
  const csp = ["default-src 'self'", ["script-src 'self' 'wasm-unsafe-eval'", ...h.csp_script_hashes, 'https://static.cloudflareinsights.com'].join(' '),
    ["style-src 'self'", ...h.csp_style_hashes].join(' '), "img-src 'self' data:", "font-src 'self'",
    "connect-src 'self' https://cognito-idp.us-east-1.amazonaws.com https://cloudflareinsights.com",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"].join('; ');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pathname === '/config.json') { // written by deploy.yml from Terraform's web_config output
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ accounts: false }));
    }
    let p = path.join(withToken, pathname);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream', 'content-security-policy': csp });
    fs.createReadStream(p).pipe(res);
  }).listen(4399, '127.0.0.1');
  const b = await chromium.launch();
  const ctx = await b.newContext();
  const reports = [];
  // The real beacon is Cloudflare's; a stand-in that reports the same way proves the CSP lets it load and send.
  await ctx.route('https://static.cloudflareinsights.com/**', (r) => r.fulfill({ contentType: 'text/javascript',
    body: "const t=JSON.parse(document.currentScript.dataset.cfBeacon).token;fetch('https://cloudflareinsights.com/cdn-cgi/rum',{method:'POST',body:JSON.stringify({t}),keepalive:true});" }));
  await ctx.route('https://cloudflareinsights.com/**', (r) => { reports.push(r.request().postData()); return r.fulfill({ status: 204 }); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || /Content Security Policy|Refused/i.test(m.text())) errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  for (const url of ['/', '/course/samjna/pratyahara/']) {
    await page.goto('http://127.0.0.1:4399' + url, { waitUntil: 'networkidle' });
  }
  check('token: the beacon loads and reports under the production CSP', reports.length === 2 && reports.every((r) => r.includes(token)), JSON.stringify(reports));
  check('token: no CSP violations or errors', errors.length === 0, errors.join(' | '));
  await b.close();
  server.close();

  console.log(log.join('\n'));
  if (log.some((l) => l.startsWith('FAIL'))) process.exit(1);
})().catch((e) => { console.log(log.join('\n')); console.error('E2E ERROR', e.message); if (process.env.GITHUB_ACTIONS) console.log(`::error title=beacon::${e.message}`); process.exit(1); });
