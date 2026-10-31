// Browser tests for saving practice, reviews and read marks safely (external review #1 client half, #7, #9).
// Every save carries a request id that is kept, with the exact body, in a per-tab outbox until the server
// confirms it; retries (button, reload) resend the same id, so the server can count it once.
// Stubbed Cognito and API, production CSP enforced. Usage: node e2e/integrity.cjs <csp.json>
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
  if (!ok && process.env.GITHUB_ACTIONS) console.log(`::error title=integrity::${name}${extra ? ' (got: ' + String(extra).slice(0, 160) + ')' : ''}`);
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ME = { pseudonym: 'śiṣya-1234', settings: { script: 'deva', dailyGoal: 10, lbOptIn: true }, admin: false };
const PROGRESS = { lessons: {}, streak: { current: 3, longest: 5 }, today: { items: 4 }, due: 0 };
const SESSION_OK = { score: 80, best: 80, status: 'completed', firstCompletion: true, cardsAdded: 9, streak: { current: 1, longest: 1 }, points: 18 };
const DUE = [{ cardId: 'prat.ac', lesson: 'samjna/pratyahara' }, { cardId: 'prat.hal', lesson: 'samjna/pratyahara' }, { cardId: 'prat.al', lesson: 'samjna/pratyahara' }];
const signedIn = () => {
  localStorage.setItem('vl:signedIn', '1');
  sessionStorage.setItem('vl:session', JSON.stringify({ accessToken: 'acc.tok.en', expiresAt: Date.now() + 3600e3 }));
};

/** A context whose API answers come from `api(method, path, body, n)` (n = how many times that route was hit). */
async function context(b, api, init = signedIn) {
  const ctx = await b.newContext();
  const posts = [];
  const hits = {};
  await ctx.addInitScript(init);
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== new URL(BASE).origin) return route.fulfill({ status: 200, body: '' });
    if (url.pathname === '/config.json') return route.fulfill({ json: { accounts: true, region: 'us-east-1', userPoolId: 'us-east-1_X', clientId: 'cid' } });
    if (url.pathname.startsWith('/api/v1/')) {
      const k = `${req.method()} ${url.pathname}`;
      hits[k] = (hits[k] ?? 0) + 1;
      const body = req.postData() ? JSON.parse(req.postData()) : null;
      if (req.method() === 'POST') posts.push([url.pathname, body]);
      const out = api(req.method(), url.pathname, body, hits[k]);
      if (out === 'abort') return route.abort('connectionreset');
      return route.fulfill({ status: out[0], json: out[1] });
    }
    const resp = await route.fetch();
    return route.fulfill({ response: resp, headers: { ...resp.headers(), 'content-security-policy': csp } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (/Content Security Policy|Refused/i.test(m.text())) errors.push(m.text().slice(0, 160)); });
  return { ctx, page, posts, errors };
}
const base = (m, p) =>
  p === '/api/v1/me' ? [200, ME] : p === '/api/v1/progress' ? [200, PROGRESS] : p === '/api/v1/auth/logout' ? [200, { ok: true }] : [200, { ok: true }];
const outbox = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('vl:outbox') || '[]'));
const close = async (ctx) => { await ctx.unrouteAll({ behavior: 'ignoreErrors' }); await ctx.close(); };

async function practise(page) {
  await page.goto(BASE + '/course/samjna/pratyahara/');
  await page.locator('#practice-h').scrollIntoViewIfNeeded();
  await page.click('text=Start practice');
  for (let q = 0; q < 10; q++) {
    await page.waitForTimeout(30);
    if (await page.$('.practice-text input')) { await page.fill('.practice-text input', q % 2 ? 'ac' : 'yaN'); await page.click('.practice-text button[type=submit]'); }
    else await page.click('.practice-option >> nth=0');
    await page.click('.practice-feedback .btn');
  }
}
const sessionPosts = (posts) => posts.filter((p) => p[0] === '/api/v1/sessions').map((p) => p[1]);
const reviewPosts = (posts) => posts.filter((p) => p[0] === '/api/v1/reviews').map((p) => p[1]);

(async () => {
  const b = await chromium.launch();

  // A — practice save answered 503, then "Try saving again": same request id, same body
  {
    const api = (m, p, body, n) => (p === '/api/v1/sessions' ? (n === 1 ? [503, { title: 'unavailable' }] : [200, SESSION_OK]) : base(m, p));
    const { ctx, page, posts, errors } = await context(b, api);
    await practise(page);
    const retry = await page.waitForSelector('button:text-is("Try saving again")', { timeout: 10000 }).then(() => true, () => false);
    check('A practice: failed save offers a retry', retry);
    if (retry) await page.click('button:text-is("Try saving again")');
    await page.waitForSelector('.practice-summary', { timeout: 10000 }).catch(() => {});
    const s = sessionPosts(posts);
    check('A practice: two attempts with one request id', s.length === 2 && UUID.test(s[0].requestId ?? '') && JSON.stringify(s[0]) === JSON.stringify(s[1]),
      s.map((x) => x.requestId).join(' , '));
    check('A practice: outbox empty after success', (await outbox(page)).length === 0);
    check('A no CSP violations', errors.length === 0, errors.join(' | '));
    await close(ctx);
  }

  // B — the connection drops while saving; reloading the lesson resends the same save
  {
    const api = (m, p, body, n) => (p === '/api/v1/sessions' ? (n === 1 ? 'abort' : [200, SESSION_OK]) : base(m, p));
    const { ctx, page, posts } = await context(b, api);
    await practise(page);
    await page.waitForSelector('text=Try saving again', { timeout: 10000 }).catch(() => {});
    const kept = await outbox(page);
    check('B practice: unsent save kept in the outbox', kept.length === 1 && kept[0].path === '/api/v1/sessions', JSON.stringify(kept).slice(0, 120));
    await page.reload();
    await page.waitForTimeout(1500);
    const s = sessionPosts(posts);
    check('B practice: reload resends it with the same request id', s.length === 2 && s[1].requestId === s[0].requestId, s.map((x) => x.requestId).join(' , '));
    check('B practice: outbox empty once saved', (await outbox(page)).length === 0);
    await close(ctx);
  }

  // C — reviews: two of three cards rated, then the tab reloads: the two ratings are saved, not lost
  {
    let saved = false;
    const api = (m, p, body) =>
      p === '/api/v1/reviews/due' ? [200, { cards: saved ? DUE.slice(2) : DUE }] :
      p === '/api/v1/reviews' ? ((saved = true), [200, { reviewed: body.items.length, correct: body.items.length, skipped: 0 }]) : base(m, p);
    const { ctx, page, posts } = await context(b, api);
    await page.goto(BASE + '/review/');
    for (const r of ['Good', 'Easy']) { await page.click('text=Show answer'); await page.click(`.review-rate >> text=${r}`); }
    check('C reviews: nothing sent before the end', reviewPosts(posts).length === 0);
    await page.reload();
    await page.waitForSelector('text=Show answer', { timeout: 10000 }).catch(() => {});
    const r = reviewPosts(posts);
    check('C reviews: ratings made before a reload are saved on the next load', r.length === 1 && UUID.test(r[0].requestId ?? '') &&
      r[0].items.map((i) => `${i.cardId}:${i.rating}`).join(',') === 'prat.ac:3,prat.hal:4', JSON.stringify(r.map((x) => x.items)));
    check('C reviews: the remaining card is offered', (await page.textContent('.review-count')).includes('of 1'));
    await close(ctx);
  }

  // D — reviews: final save answered 503; "Try again" resends the same request
  {
    const api = (m, p, body, n) =>
      p === '/api/v1/reviews/due' ? [200, { cards: DUE.slice(0, 2) }] :
      p === '/api/v1/reviews' ? (n === 1 ? [503, { title: 'unavailable' }] : [200, { reviewed: 2, correct: 1, skipped: 0 }]) : base(m, p);
    const { ctx, page, posts } = await context(b, api);
    await page.goto(BASE + '/review/');
    for (const r of ['Good', 'Again']) { await page.click('text=Show answer'); await page.click(`.review-rate >> text=${r}`); }
    const retry = await page.waitForSelector('.review-note button:text-is("Try again")', { timeout: 10000 }).then(() => true, () => false);
    check('D reviews: failed save offers "Try again"', retry, (await page.textContent('.review-note').catch(() => '')) ?? '');
    if (retry) await page.click('.review-note button:text-is("Try again")');
    const done = await page.waitForSelector('text=2 reviewed', { timeout: 10000 }).then(() => true, () => false);
    const r = reviewPosts(posts);
    check('D reviews: retried with the same request id and body', done && r.length === 2 && JSON.stringify(r[0]) === JSON.stringify(r[1]), r.map((x) => x.requestId).join(' , '));
    await close(ctx);
  }

  // E — stale or refused entries are dropped, never retried forever; signing out empties the outbox
  {
    const old = [{ id: '00000000-0000-4000-8000-000000000001', path: '/api/v1/reviews', at: Date.now() - 2 * 864e5,
      body: { items: [{ cardId: 'prat.ac', rating: 3, ms: 1000 }], tz: 'UTC', requestId: '00000000-0000-4000-8000-000000000001' } }];
    const refused = [{ id: '00000000-0000-4000-8000-000000000002', path: '/api/v1/reviews', at: Date.now(),
      body: { items: [{ cardId: 'prat.hal', rating: 3, ms: 1000 }], tz: 'UTC', requestId: '00000000-0000-4000-8000-000000000002' } }];
    for (const [label, entries, wantPosts] of [['older than a day', old, 0], ['refused with 409', refused, 1]]) {
      const api = (m, p) => (p === '/api/v1/reviews/due' ? [200, { cards: [] }] : p === '/api/v1/reviews' ? [409, { title: 'Request id already used' }] : base(m, p));
      const init = new Function(`(${signedIn.toString()})(); if (!sessionStorage.getItem('vl:seeded')) { sessionStorage.setItem('vl:seeded', '1'); sessionStorage.setItem('vl:outbox', ${JSON.stringify(JSON.stringify(entries))}); }`);
      const { ctx, page, posts } = await context(b, api, init);
      await page.goto(BASE + '/review/');
      await page.waitForSelector('text=Nothing is due', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(500);
      check(`E entry ${label}: sent ${wantPosts} time(s), then dropped`, reviewPosts(posts).length === wantPosts && (await outbox(page)).length === 0,
        `${reviewPosts(posts).length} posts, ${(await outbox(page)).length} left`);
      await close(ctx);
    }
    const api = (m, p) => (p === '/api/v1/sessions' ? 'abort' : base(m, p));
    const { ctx, page } = await context(b, api);
    await practise(page);
    await page.waitForSelector('text=Try saving again', { timeout: 10000 }).catch(() => {});
    const before = (await outbox(page)).length;
    await page.goto(BASE + '/me/');
    await page.waitForSelector('.dash-stats', { timeout: 10000 }).catch(() => {});
    await page.click('button:has-text("Sign out")');
    await page.waitForTimeout(800);
    check('E signing out empties the outbox', before === 1 && (await outbox(page)).length === 0, `${before} before`);
    await close(ctx);
  }

  // F — review #7: signed in, "Mark as read" is saved to the account and shows on another device
  {
    const server = { 'samjna/pratyahara': 'completed' }; // one account, two browsers
    const api = (m, p, body) => {
      if (p === '/api/v1/progress/lessons') return [200, { lessons: { ...server } }];
      if (p === '/api/v1/progress/read') {
        const cur = server[body.lessonId];
        if (body.read && !cur) server[body.lessonId] = 'read';
        if (!body.read && cur === 'read') delete server[body.lessonId];
        return [200, { lessonId: body.lessonId, status: server[body.lessonId] ?? 'none' }];
      }
      return base(m, p);
    };
    const button = (page) => page.$eval('[data-mark-read]', (el) => [el.getAttribute('aria-pressed'), el.textContent.trim(), el.disabled]);
    const railRead = (page, key) => page.$eval(`.rail-lessons a[href$="/course/${key}/"]`, (a) => a.classList.contains('is-read')).catch(() => null);
    const A = await context(b, api);
    const B = await context(b, api);
    await A.page.goto(BASE + '/course/varnamala/sounds/');
    await A.page.waitForTimeout(800);
    await A.page.click('[data-mark-read]');
    await A.page.waitForTimeout(800);
    const sent = A.posts.filter((p) => p[0] === '/api/v1/progress/read').map((p) => p[1]);
    check('F device A: mark is sent to the account', sent.length === 1 && sent[0].lessonId === 'varnamala/sounds' && sent[0].read === true && server['varnamala/sounds'] === 'read',
      JSON.stringify(sent));
    await B.page.goto(BASE + '/course/varnamala/sounds/');
    await B.page.waitForTimeout(1200);
    check('F device B: the lesson shows as read', JSON.stringify(await button(B.page)) === JSON.stringify(['true', 'Marked as read', false]), JSON.stringify(await button(B.page)));
    check('F device B: the course rail shows it too', (await railRead(B.page, 'varnamala/sounds')) === true);
    check('F device B: a completed lesson counts as read in the rail', (await railRead(B.page, 'samjna/pratyahara')) === true);
    await B.page.click('[data-mark-read]');
    await B.page.waitForTimeout(800);
    await A.page.reload();
    await A.page.waitForTimeout(1200);
    check('F unmark on B shows on A', JSON.stringify(await button(A.page)) === JSON.stringify(['false', 'Mark as read', false]) && !('varnamala/sounds' in server),
      JSON.stringify(await button(A.page)));
    await A.page.goto(BASE + '/course/samjna/pratyahara/');
    await A.page.waitForTimeout(1200);
    check('F a practised/completed lesson stays marked (button disabled)', JSON.stringify(await button(A.page)) === JSON.stringify(['true', 'Marked as read', true]), JSON.stringify(await button(A.page)));
    await close(A.ctx); await close(B.ctx);

    // guests: unchanged, this browser only
    const G = await context(b, api, () => {});
    await G.page.goto(BASE + '/course/varnamala/script/');
    await G.page.waitForTimeout(500);
    await G.page.click('[data-mark-read]');
    const local = await G.page.evaluate(() => JSON.parse(localStorage.getItem('vl:read') || '[]'));
    check('F guest: kept in this browser, nothing sent', local.includes('varnamala/script') && G.posts.length === 0, JSON.stringify(local));
    await close(G.ctx);
  }

  console.log(log.join('\n'));
  await b.close();
  if (log.some((l) => l.startsWith('FAIL'))) process.exit(1);
})().catch((e) => { console.log(log.join('\n')); console.error('E2E ERROR', e.message); if (process.env.GITHUB_ACTIONS) console.log(`::error title=integrity::${e.message}`); process.exit(1); });
