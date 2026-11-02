// Browser test of the Derivation tool (vidyut-prakriyā WebAssembly) with the production CSP enforced.
// Usage: node e2e/prakriya.cjs <csp.json>   (site served at BASE_URL; needs apps/web/public/vidyut from CI)
//   VIDYUT_MOCK=<file.js> runs the behaviour checks against a stand-in module instead (local development):
//   checks of vidyut's real output (forms, rule numbers, licence files) then run only in CI.
// Prints the declension of rāma and one derivation as GitHub annotations, so the output can be read from the API.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE_URL || 'http://localhost:4321';
const MOCK = process.env.VIDYUT_MOCK;
const REAL = !MOCK;
const h = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const csp = ["default-src 'self'", ["script-src 'self' 'wasm-unsafe-eval'", ...h.csp_script_hashes].join(' '),
  ["style-src 'self'", ...h.csp_style_hashes].join(' '), "img-src 'self' data:", "font-src 'self'", "connect-src 'self'",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"].join('; ');
const notice = (title, text) => console.log(`::notice title=${title}::${text.replace(/\n/g, '%0A')}`);
const fails = [];
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) fails.push(extra ? `${name} (got: ${String(extra).slice(0, 120)})` : name); };

/** A page under the production CSP; with VIDYUT_MOCK, /vidyut/ is answered by the stand-in. `breakJs` fails the first n module loads. */
async function open(b, { width = 1280, breakJs = 0 } = {}) {
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  let broken = breakJs;
  await ctx.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/vidyut/') && /vidyut_prakriya\.js$/.test(url.pathname) && broken > 0) {
      broken -= 1;
      return route.fulfill({ status: 503, body: 'unavailable' });
    }
    if (MOCK && url.pathname === '/vidyut/version.txt') return route.fulfill({ contentType: 'text/plain', body: 'mock\n', headers: { 'content-security-policy': csp } });
    if (MOCK && url.pathname === '/vidyut/vidyut_prakriya.js') return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(MOCK, 'utf8') });
    if (MOCK && url.pathname === '/vidyut/vidyut_prakriya_bg.wasm') return route.fulfill({ contentType: 'application/wasm', body: '' });
    const resp = await route.fetch();
    return route.fulfill({ response: resp, headers: { ...resp.headers(), 'content-security-policy': csp } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || /Content Security Policy|Refused/i.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(BASE + '/tools/prakriya/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.documentElement.setAttribute('data-script', 'iast'));
  return { ctx, page, errors };
}
const type = async (page, text) => { await page.fill('.prakriya-field input', text); await page.waitForTimeout(450); };
const status = (page) => page.$eval('.prakriya-status[role=status]', (e) => e.textContent.trim());
const reading = (page) => page.$eval('.prakriya-reading', (e) => e.textContent.replace(/\s+/g, ' ').trim());

(async () => {
  const b = await chromium.launch();
  const { ctx, page, errors } = await open(b);
  const ok = await page.waitForSelector('.prakriya-table', { timeout: 20000 }).then(() => true, () => false);
  check('declension table renders (WebAssembly loaded under the production CSP)', ok, errors.join(' | '));
  if (ok) {
    const cellText = (r, c) => page.$eval(`.prakriya-table tbody tr:nth-child(${r}) td:nth-child(${c + 1})`, (td) =>
      [...td.querySelectorAll('.sa-iast')].map((s) => s.textContent.trim()).join(' / '));
    if (REAL) {
      const rows = await page.$$eval('.prakriya-table tbody tr', (trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) =>
        [...td.querySelectorAll('.sa-iast')].map((s) => s.textContent.trim()).join(' / '))));
      notice('rāma (masculine)', rows.map((r) => r.join(' | ')).join('\n'));
      const expect = { '0,0': 'rāmaḥ', '0,1': 'rāmau', '0,2': 'rāmāḥ', '2,0': 'rāmeṇa', '5,2': 'rāmāṇām', '6,0': 'rāme', '7,0': 'rāma' };
      for (const [k, v] of Object.entries(expect)) {
        const [r, c] = k.split(',').map(Number);
        check(`cell ${k} = ${v}`, (rows[r]?.[c] ?? '').split(' / ').includes(v), rows[r]?.[c]);
      }
    }
    check('D1 the reading of the stem is shown', /Declining.*rāma.*\(read as IAST\)/.test(await reading(page)), await reading(page));

    // D5: one tab stop in the table, arrow keys move, Enter/click announces the derivation
    const stops = await page.$$eval('.prakriya-table button', (bs) => bs.filter((x) => x.tabIndex === 0).length);
    check('D5 the table is one tab stop', stops === 1, String(stops));
    await page.focus('.prakriya-table button[tabindex="0"]');
    await page.keyboard.press('ArrowRight');
    const moved = await page.evaluate(() => [document.activeElement?.dataset.r, document.activeElement?.dataset.c].join(','));
    check('D5 ArrowRight moves to the next form', moved === '0,1', moved);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const said = await page.$eval('.prakriya [aria-live="polite"]', (e) => e.textContent);
    check('D5 choosing a form is announced', /Derivation of .+ nominative dual: \d+ steps/.test(said), said);

    await page.click('.prakriya-table tbody tr:nth-child(1) td:nth-child(2) button');
    const steps = await page.$$eval('.prakriya-steps li', (lis) => lis.map((li) =>
      `${li.querySelector('.prakriya-rule')?.textContent.trim()}: ${[...li.querySelectorAll('.prakriya-term .sa-iast')].map((s) => s.textContent.trim()).join(' + ')}`));
    if (REAL) notice('rāmaḥ derivation', steps.join('\n'));
    check('derivation of rāmaḥ has steps', steps.length > 5, String(steps.length));
    check('derivation cites 8.2.66 and 8.3.15', steps.some((s) => s.startsWith('8.2.66')) && steps.some((s) => s.startsWith('8.3.15')));
    check('D2 no step without a rule is shown', steps.every((s) => !/^(undefined|):/.test(s)), steps.find((s) => /^(undefined|):/.test(s)));
    check('D2 rule labels never show raw codes ("8.4.29.1", "label,text,url")', steps.every((s) => !/^\S*\d+\.\d+\.\d+\.\d+|,/.test(s.split(':')[0])), steps.join(' | '));
    if (MOCK) check('D2 a vārttika is labelled by its sūtra and linked', steps.some((s) => s.startsWith('vārttika on 8.2.66')) &&
      (await page.$$eval('.prakriya-steps a.prakriya-rule', (as) => as.some((a) => a.textContent.startsWith('vārttika on 8.2.66') && /8\.2\.66/.test(a.href)))));
    check('D5 changed terms are named for screen readers', (await page.$$eval('.prakriya-steps .visually-hidden', (es) => es.map((e) => e.textContent).join('|'))).includes('changed'));
    check('D12 the steps are announced as a list', (await page.$eval('.prakriya-steps', (e) => e.getAttribute('role'))) === 'list');
    if (MOCK) {
      await page.click('.prakriya-table tbody tr:nth-child(7) td:nth-child(2) button');
      check('D9 a cell lists distinct forms only', /has 2 forms/.test(await page.textContent('.prakriya-variants')), await page.textContent('.prakriya-variants'));
    }

    // D1, D4: what the learner typed, and why it cannot be declined
    await type(page, 'Rama');
    check('D1 a capitalised plain word is read as IAST', /Declining.*rama.*\(read as IAST\)/.test(await reading(page)), await reading(page));
    await page.selectOption('.prakriya-field:nth-of-type(3) select, select[id$="-scheme"]', 'slp1');
    await type(page, 'kfzRa');
    check('D1 the script can be chosen (SLP1)', /Declining.*kṛṣṇa.*\(read as SLP1\)/.test(await reading(page)), await reading(page));
    await page.selectOption('select[id$="-scheme"]', 'auto');
    await type(page, 'iḻā');
    check('D4 a letter the engine cannot read is named', /ḻ/.test(await status(page)) && !(await page.$('.prakriya-table')), await status(page));
    await type(page, 'rāmaḥ');
    check('D4 a finished word is refused with the stem to type', /without its ending: rāma, not rāmaḥ/.test(await status(page)), await status(page));
    await type(page, 'rāma deva');
    check('D4 two words are refused', /one stem/.test(await status(page)), await status(page));
    await type(page, '');
    check('D4 empty input asks for a stem', /Type a stem/.test(await status(page)), await status(page));
    if (MOCK) {
      await type(page, 'paqa');
      check('D4 a stem without forms says so', /No forms for paqa|No forms for paḍa/.test(await status(page)), await status(page));
    }

    // D3: the feminine-suffix box
    await page.selectOption('select[id$="-linga"]', 'Stri');
    await type(page, 'रमा');
    check('D3 ramā: the box is ticked automatically', await page.isChecked('.prakriya-check input'));
    if (REAL) check('ramā: instrumental singular = ramayā', (await cellText(3, 1)) === 'ramayā', await cellText(3, 1));
    await type(page, 'lakṣmī');
    check('D3 lakṣmī: the box is not ticked', !(await page.isChecked('.prakriya-check input')));
    check('lakṣmī: nominative singular = lakṣmīḥ without unticking anything', (await cellText(1, 1)) === 'lakṣmīḥ', await cellText(1, 1));
    await type(page, 'vāc');
    check('D3 vāc: no feminine-suffix box (the stem does not end in ā or ī)', !(await page.$('.prakriya-check')));
    if (REAL) {
      await type(page, 'gaurī');
      check('gaurī (ṅīṣ): nominative singular = gaurī', (await cellText(1, 1)) === 'gaurī', await cellText(1, 1));
    }
  }
  check('no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // D8: on a phone the table scrolls by itself, never the page
  {
    const { ctx: c2, page: p2 } = await open(b, { width: 360 });
    await p2.waitForSelector('.prakriya-table', { timeout: 20000 }).catch(() => {});
    await p2.evaluate(() => document.documentElement.setAttribute('data-script', 'both'));
    await type(p2, 'parameśvara');
    const over = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('D8 no sideways page scroll at 360 px (both scripts)', over <= 0, `${over}px`);
    await c2.close();
  }

  // D4: a failed load says so (not "not part of this build") and can be retried
  {
    const { ctx: c3, page: p3 } = await open(b, { breakJs: 1 });
    await p3.waitForSelector('text=could not be loaded', { timeout: 20000 }).catch(() => {});
    check('D4 a failed load is reported, not called a missing build', /could not be loaded/.test(await status(p3)), await status(p3));
    await p3.click('button:has-text("Try loading again")').catch(() => {});
    const back = await p3.waitForSelector('.prakriya-table', { timeout: 20000 }).then(() => true, () => false);
    check('D4 "Try loading again" loads the engine', back);
    await c3.close();
  }

  // D6: the licence notices travel with the WebAssembly
  if (REAL) {
    const res = await fetch(BASE + '/vidyut/THIRD-PARTY.txt');
    const text = res.ok ? await res.text() : '';
    check('D6 /vidyut/THIRD-PARTY.txt lists vidyut-prakriya (MIT) and wasm-bindgen with licence texts',
      /^vidyut-prakriya .* licence: MIT/m.test(text) && /^wasm-bindgen .* licence:/m.test(text) && /Permission is hereby granted/.test(text), `${res.status} ${text.length} bytes`);
  }

  await b.close();
  if (fails.length) { console.log(`::error title=prakriya::${fails.join('; ')}`); process.exit(1); }
})().catch((e) => { console.error('E2E ERROR', e.message); console.log(`::error title=prakriya::${e.message}`); process.exit(1); });
