// Browser test of account flows against stubbed Cognito and API, with the production CSP enforced.
// Usage: node e2e/accounts.cjs <csp.json>   (site served at BASE_URL, default http://localhost:4321)
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:4321';
const crypto = require('crypto');
const fs = require('fs');
const h = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const csp = ["default-src 'self'", ["script-src 'self' 'wasm-unsafe-eval'", ...h.csp_script_hashes].join(' '),
  ["style-src 'self'", ...h.csp_style_hashes].join(' '), "img-src 'self' data:", "font-src 'self'",
  "connect-src 'self' https://cognito-idp.us-east-1.amazonaws.com", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"].join('; ');
const sha = (s) => crypto.createHash('sha256').update(s || '').digest('hex');
const log = [];
const check = (name, ok, extra = '') => { log.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  const calls = [];
  const cspErrors = [];
  await ctx.route('**/*', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (url.hostname === 'cognito-idp.us-east-1.amazonaws.com') {
      const target = req.headers()['x-amz-target'].split('.').pop(); const body = JSON.parse(req.postData());
      calls.push(['cognito', target, body]);
      const map = { SignUp: {}, ConfirmSignUp: { Session: 'sess-1' },
        InitiateAuth: { AuthenticationResult: { AccessToken: 'acc.tok.en', RefreshToken: 'r'.repeat(40), ExpiresIn: 3600 } } };
      return route.fulfill({ status: 200, contentType: 'application/x-amz-json-1.1', body: JSON.stringify(map[target] ?? {}) });
    }
    if (url.pathname === '/config.json') return route.fulfill({ json: { accounts: true, region: 'us-east-1', userPoolId: 'us-east-1_X', clientId: 'cid' } });
    if (url.pathname.startsWith('/api/v1/')) {
      const body = req.postData() || '';
      calls.push(['api', req.method() + ' ' + url.pathname, body ? JSON.parse(body) : null, req.headers()]);
      const hdr = req.headers();
      if (req.method() !== 'GET' && hdr['x-amz-content-sha256'] !== sha(body)) check('payload hash for ' + url.pathname, false);
      const p = url.pathname;
      const json =
        p === '/api/v1/me' && req.method() === 'GET' ? { pseudonym: 'śiṣya-1234', settings: { script: 'deva', dailyGoal: 10, lbOptIn: true }, admin: false } :
        p === '/api/v1/progress' ? { lessons: { 'samjna/pratyahara': { status: 'completed', bestScore: 90 } }, streak: { current: 3, longest: 5 }, today: { items: 4 }, due: 2 } :
        p === '/api/v1/sessions' ? { score: 80, best: 80, status: 'completed', firstCompletion: true, cardsAdded: 9, streak: { current: 1, longest: 1 }, points: 18 } :
        p === '/api/v1/reviews/due' ? { cards: [{ cardId: 'prat.ac', lesson: 'samjna/pratyahara' }, { cardId: 'prat.hal', lesson: 'samjna/pratyahara' }] } :
        p === '/api/v1/reviews' ? { reviewed: 2, correct: 1 } :
        p.startsWith('/api/v1/leaderboard') ? { week: '2026-W44', rows: [{ rank: 1, pseudonym: 'śiṣya-1234', score: 42 }] } : { ok: true };
      return route.fulfill({ json });
    }
    const resp = await route.fetch();
    return route.fulfill({ response: resp, headers: { ...resp.headers(), 'content-security-policy': csp } });
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (/Content Security Policy|Refused/i.test(m.text())) cspErrors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => cspErrors.push('pageerror: ' + e.message));

  // 1. Sign-in (new account): SignUp → ConfirmSignUp → InitiateAuth(Session) → /auth/session → merge → /me/
  await page.goto(BASE + '/course/varnamala/sounds/');
  await page.click('[data-mark-read]');
  await page.goto(BASE + '/signin/');
  await page.fill('input[type=email]', 'Learner@Example.com');
  await page.click('button[type=submit]');
  await page.waitForSelector('input[autocomplete=one-time-code]');
  await page.fill('input[autocomplete=one-time-code]', '123456');
  await Promise.all([page.waitForURL('**/me/'), page.click('button[type=submit]')]);
  const seq = calls.filter((c) => c[0] === 'cognito').map((c) => c[1]).join(' → ');
  check('Cognito sequence', seq === 'SignUp → ConfirmSignUp → InitiateAuth', seq);
  const init = calls.find((c) => c[1] === 'InitiateAuth')[2];
  check('InitiateAuth uses USER_AUTH + session', init.AuthFlow === 'USER_AUTH' && init.Session === 'sess-1' && init.AuthParameters.USERNAME === 'learner@example.com');
  const sess = calls.find((c) => c[1] === 'POST /api/v1/auth/session');
  check('refresh token handed to API cookie endpoint', !!sess && sess[2].refreshToken.length === 40 && sess[3]['x-vl-auth'] === 'Bearer acc.tok.en');
  const merge = calls.find((c) => c[1] === 'POST /api/v1/progress/merge');
  check('guest progress merged', !!merge && merge[2].read.includes('varnamala/sounds'), JSON.stringify(merge && merge[2]));
  await page.waitForSelector('.dash-stats');
  check('dashboard renders streak', (await page.textContent('.dash-stats')).includes('3'));
  check('header shows Your progress', (await page.textContent('[data-account-link]')).trim() === 'Your progress');

  // 2. Practice on the pratyāhāra lesson
  await page.goto(BASE + '/course/samjna/pratyahara/');
  await page.locator('#practice-h').scrollIntoViewIfNeeded();
  await page.click('text=Start practice');
  for (let q = 0; q < 10; q++) {
    await page.waitForTimeout(30);
    if (await page.$('.practice-text input')) { await page.fill('.practice-text input', q % 2 ? 'ac' : 'yaN'); await page.click('.practice-text button[type=submit]'); }
    else await page.click('.practice-option >> nth=0');
    await page.click('.practice-feedback .btn');
  }
  await page.waitForSelector('.practice-summary');
  const post = calls.find((c) => c[1] === 'POST /api/v1/sessions');
  check('session payload', post && post[2].lessonId === 'samjna/pratyahara' && post[2].attempts.length === 10 && typeof post[2].tz === 'string',
        post && `${post[2].attempts.filter(a=>a.correct).length}/10 correct, completed=${post[2].completed}, cards=${post[2].newCards.length}`);
  check('summary shown', (await page.textContent('.practice-summary')).includes('9 cards added'));

  // 3. Reviews
  await page.goto(BASE + '/review/');
  for (const r of ['Good', 'Again']) { await page.click('text=Show answer'); await page.click(`.review-rate >> text=${r}`); }
  await page.waitForSelector('text=2 reviewed');
  const rv = calls.find((c) => c[1] === 'POST /api/v1/reviews');
  check('reviews payload', rv && rv[2].items.map((i) => i.rating).join(',') === '3,1', JSON.stringify(rv && rv[2].items.map(i=>[i.cardId,i.rating])));

  // 4. Leaderboard
  await page.goto(BASE + '/leaderboard/');
  await page.waitForSelector('.lb-table');
  const lb = calls.find((c) => c[1] === 'GET /api/v1/leaderboard/current');
  check('leaderboard is public (no auth header)', lb && !lb[3]['x-vl-auth']);

  check('no CSP violations / page errors', cspErrors.length === 0, cspErrors.join(' | '));
  console.log(log.join('\n'));
  await b.close();
  if (log.some((l) => l.startsWith('FAIL'))) process.exit(1);
})().catch((e) => { console.log(log.join('\n')); console.error('E2E ERROR', e.message); process.exit(1); });
