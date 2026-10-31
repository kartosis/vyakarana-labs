// Browser tests for the account edge cases found by the external code review (PROGRESS §10):
//   #5 abandoned sign-up can be resumed (also across a reload), #6 no open redirect through ?next=,
//   #18 a refresh outage does not sign the learner out, P3 a failed deletion is reported in the dialog.
// Stubbed Cognito and API, production CSP enforced. Usage: node e2e/accounts-edge.cjs <csp.json>
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE_URL || 'http://localhost:4321';
const h = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const csp = ["default-src 'self'", ["script-src 'self' 'wasm-unsafe-eval'", ...h.csp_script_hashes].join(' '),
  ["style-src 'self'", ...h.csp_style_hashes].join(' '), "img-src 'self' data:", "font-src 'self'",
  "connect-src 'self' https://cognito-idp.us-east-1.amazonaws.com", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"].join('; ');
const log = [];
const check = (name, ok, extra = '') => {
  log.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok && process.env.GITHUB_ACTIONS) console.log(`::error title=accounts-edge::${name}${extra ? ' (got: ' + String(extra).slice(0, 160) + ')' : ''}`);
};
const ME = { pseudonym: 'śiṣya-1234', settings: { script: 'deva', dailyGoal: 10, lbOptIn: true }, admin: false };
const PROGRESS = { lessons: {}, streak: { current: 3, longest: 5 }, today: { items: 4 }, due: 0 };

/** A browser context whose Cognito answers come from `cognito(target, body)` and API answers from `api(method, path)`. */
async function context(b, { cognito, api, init }) {
  const ctx = await b.newContext();
  const calls = [];
  if (init) await ctx.addInitScript(init);
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname === 'cognito-idp.us-east-1.amazonaws.com') {
      const target = req.headers()['x-amz-target'].split('.').pop();
      const body = JSON.parse(req.postData());
      calls.push(['cognito', target, body]);
      const [status, json] = cognito(target, body);
      return route.fulfill({ status, contentType: 'application/x-amz-json-1.1', body: JSON.stringify(json) });
    }
    // any other host (an open redirect would land here): answer locally so the test can see where it went
    if (url.origin !== new URL(BASE).origin) return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>external</title>' });
    if (url.pathname === '/config.json') return route.fulfill({ json: { accounts: true, region: 'us-east-1', userPoolId: 'us-east-1_X', clientId: 'cid' } });
    if (url.pathname.startsWith('/api/v1/')) {
      calls.push(['api', `${req.method()} ${url.pathname}`]);
      const [status, json] = api(req.method(), url.pathname);
      return route.fulfill({ status, json });
    }
    const resp = await route.fetch();
    return route.fulfill({ response: resp, headers: { ...resp.headers(), 'content-security-policy': csp } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (/Content Security Policy|Refused/i.test(m.text())) errors.push(m.text().slice(0, 160)); });
  return { ctx, page, calls, errors };
}
const okApi = (method, path) =>
  path === '/api/v1/me' && method === 'GET' ? [200, ME] : path === '/api/v1/progress' ? [200, PROGRESS] : [200, { ok: true }];
const tokens = { AuthenticationResult: { AccessToken: 'acc.tok.en', RefreshToken: 'r'.repeat(40), ExpiresIn: 3600 } };
const signedIn = () => {
  localStorage.setItem('vl:signedIn', '1');
  sessionStorage.setItem('vl:session', JSON.stringify({ accessToken: 'acc.tok.en', expiresAt: Date.now() + 3600e3 }));
};

(async () => {
  const b = await chromium.launch();

  // #6 — existing user signs in with a crafted next=/\evil.example: must stay on this site
  {
    const existing = (t) =>
      t === 'SignUp' ? [400, { __type: 'UsernameExistsException', message: 'exists' }] :
      t === 'InitiateAuth' ? [200, { ChallengeName: 'EMAIL_OTP', Session: 'otp-sess' }] :
      t === 'RespondToAuthChallenge' ? [200, tokens] : [200, {}];
    for (const [next, want] of [['%2F%5Cevil.example', '/me/'], ['%2F%2Fevil.example%2Fx', '/me/'], ['https%3A%2F%2Fevil.example', '/me/'], ['%2Fcourse%2F', '/course/']]) {
      const { ctx, page } = await context(b, { cognito: existing, api: okApi });
      await page.goto(`${BASE}/signin/?next=${next}`);
      await page.fill('input[type=email]', 'learner@example.com');
      await page.click('button[type=submit]');
      await page.fill('input[autocomplete=one-time-code]', '123456');
      await page.click('button[type=submit]');
      await page.waitForURL((u) => u.pathname === want || u.hostname !== new URL(BASE).hostname, { timeout: 10000 }).catch(() => {});
      const u = new URL(page.url());
      check(`#6 next=${decodeURIComponent(next)} lands on ${want}`, u.origin === new URL(BASE).origin && u.pathname === want, page.url());
      await ctx.unrouteAll({ behavior: 'ignoreErrors' }); await ctx.close();
    }
  }

  // #5 — a sign-up abandoned before the code: the same email again resends the confirmation code; a reload resumes
  {
    let confirmed = false;
    const unconfirmed = (t, body) =>
      t === 'SignUp' ? [400, { __type: 'UsernameExistsException', message: 'exists' }] :
      t === 'InitiateAuth' && !body.Session && !confirmed ? [400, { __type: 'UserNotConfirmedException', message: 'not confirmed' }] :
      t === 'ResendConfirmationCode' ? [200, { CodeDeliveryDetails: { DeliveryMedium: 'EMAIL' } }] :
      t === 'ConfirmSignUp' ? ((confirmed = true), [200, { Session: 'sess-2' }]) :
      t === 'InitiateAuth' ? [200, tokens] : [200, {}];
    const { ctx, page, calls } = await context(b, { cognito: unconfirmed, api: okApi });
    await page.goto(`${BASE}/signin/`);
    await page.fill('input[type=email]', 'Half@Example.com');
    await page.click('button[type=submit]');
    const codeStep = await page.waitForSelector('input[autocomplete=one-time-code]', { timeout: 10000 }).then(() => true, () => false);
    check('#5 unconfirmed account: code step reached', codeStep, (await page.textContent('.signin')) ?? '');
    check('#5 confirmation code resent', calls.some((c) => c[1] === 'ResendConfirmationCode' && c[2].Username === 'half@example.com'));
    if (codeStep) {
    await page.reload();
    const resumed = await page.waitForSelector('input[autocomplete=one-time-code]', { timeout: 10000 }).then(() => true, () => false);
    check('#5 reload resumes at the code step', resumed && (await page.textContent('.signin-sent')).includes('half@example.com'));
    await page.fill('input[autocomplete=one-time-code]', '654321');
    await Promise.all([page.waitForURL('**/me/', { timeout: 10000 }).catch(() => {}), page.click('button[type=submit]')]);
    const seq = calls.filter((c) => c[0] === 'cognito').map((c) => c[1]).join(' → ');
    check('#5 finishes as a sign-up', seq === 'SignUp → InitiateAuth → ResendConfirmationCode → ConfirmSignUp → InitiateAuth', seq);
    }
    await ctx.unrouteAll({ behavior: 'ignoreErrors' }); await ctx.close();
  }

  // #18 — refresh answers 503: stay signed in; once it recovers, the dashboard loads
  {
    let outage = true;
    const api = (m, p) => (p === '/api/v1/auth/refresh' ? (outage ? [503, { title: 'unavailable' }] : [200, { accessToken: 'acc.tok.en', expiresIn: 3600 }]) : okApi(m, p));
    const { ctx, page } = await context(b, { cognito: () => [200, {}], api, init: () => localStorage.setItem('vl:signedIn', '1') });
    await page.goto(`${BASE}/me/`);
    await page.waitForTimeout(1500);
    const flag = await page.evaluate(() => localStorage.getItem('vl:signedIn'));
    check('#18 a 503 from refresh keeps the signed-in flag', flag === '1', String(flag));
    outage = false;
    await page.reload();
    const ok = await page.waitForSelector('.dash-stats', { timeout: 10000 }).then(() => true, () => false);
    check('#18 after recovery the dashboard loads', ok);
    await ctx.unrouteAll({ behavior: 'ignoreErrors' }); await ctx.close();
  }
  // …while a rejected refresh (401) does sign out
  {
    const api = (m, p) => (p === '/api/v1/auth/refresh' ? [401, { title: 'expired' }] : okApi(m, p));
    const { ctx, page } = await context(b, { cognito: () => [200, {}], api, init: () => localStorage.setItem('vl:signedIn', '1') });
    await page.goto(`${BASE}/me/`);
    await page.waitForTimeout(1500);
    check('#18 a 401 from refresh signs out', (await page.evaluate(() => localStorage.getItem('vl:signedIn'))) === null);
    await ctx.unrouteAll({ behavior: 'ignoreErrors' }); await ctx.close();
  }

  // P3 — deleting the account fails: the dialog says so and nothing else happens
  {
    const api = (m, p) => (p === '/api/v1/me' && m === 'DELETE' ? [503, { title: 'unavailable' }] : okApi(m, p));
    const { ctx, page, errors } = await context(b, { cognito: () => [200, {}], api, init: signedIn });
    await page.goto(`${BASE}/me/`);
    await page.waitForSelector('.dash-stats');
    await page.click('text=Delete account');
    await page.click('text=Delete everything');
    const shown = await page.waitForSelector('.dash-dialog .dash-error', { timeout: 5000 }).then(() => true, () => false);
    check('P3 failed deletion is reported in the dialog', shown);
    check('P3 still on the dashboard, still signed in', new URL(page.url()).pathname === '/me/' && (await page.evaluate(() => localStorage.getItem('vl:signedIn'))) === '1');
    check('no CSP violations', errors.length === 0, errors.join(' | '));
    await ctx.unrouteAll({ behavior: 'ignoreErrors' }); await ctx.close();
  }

  console.log(log.join('\n'));
  await b.close();
  if (log.some((l) => l.startsWith('FAIL'))) process.exit(1);
})().catch((e) => { console.log(log.join('\n')); console.error('E2E ERROR', e.message); if (process.env.GITHUB_ACTIONS) console.log(`::error title=accounts-edge::${e.message}`); process.exit(1); });
