// Browser test of the Derivation tool (vidyut-prakriyā WebAssembly) with the production CSP enforced.
// Usage: node e2e/prakriya.cjs <csp.json>   (site served at BASE_URL; needs apps/web/public/vidyut from CI)
// Prints the declension of rāma and one derivation as GitHub annotations, so the output can be read from the API.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE_URL || 'http://localhost:4321';
const h = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const csp = ["default-src 'self'", ["script-src 'self' 'wasm-unsafe-eval'", ...h.csp_script_hashes].join(' '),
  ["style-src 'self'", ...h.csp_style_hashes].join(' '), "img-src 'self' data:", "font-src 'self'", "connect-src 'self'",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"].join('; ');
const notice = (title, text) => console.log(`::notice title=${title}::${text.replace(/\n/g, '%0A')}`);
const fails = [];
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) fails.push(name); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.route('**/*', async (route) => {
    const resp = await route.fetch();
    return route.fulfill({ response: resp, headers: { ...resp.headers(), 'content-security-policy': csp } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || /Content Security Policy|Refused/i.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(BASE + '/tools/prakriya/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.documentElement.setAttribute('data-script', 'iast'));
  const ok = await page.waitForSelector('.prakriya-table', { timeout: 20000 }).then(() => true, () => false);
  check('declension table renders (WebAssembly loaded under the production CSP)', ok, errors.join(' | '));
  if (ok) {
    const rows = await page.$$eval('.prakriya-table tbody tr', (trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) =>
      [...td.querySelectorAll('.sa-iast')].map((s) => s.textContent.trim()).join(' / '))));
    notice('rāma (masculine)', rows.map((r) => r.join(' | ')).join('\n'));
    const expect = { '0,0': 'rāmaḥ', '0,1': 'rāmau', '0,2': 'rāmāḥ', '2,0': 'rāmeṇa', '5,2': 'rāmāṇām', '6,0': 'rāme', '7,0': 'rāma' };
    for (const [k, v] of Object.entries(expect)) {
      const [r, c] = k.split(',').map(Number);
      check(`cell ${k} = ${v}`, (rows[r]?.[c] ?? '').split(' / ').includes(v), rows[r]?.[c]);
    }
    await page.click('.prakriya-table tbody tr:nth-child(1) td:nth-child(2) button');
    const steps = await page.$$eval('.prakriya-steps li', (lis) => lis.map((li) =>
      `${li.querySelector('.prakriya-rule')?.textContent.trim()}: ${[...li.querySelectorAll('.prakriya-term .sa-iast')].map((s) => s.textContent.trim()).join(' + ')}`));
    notice('rāmaḥ derivation', steps.join('\n'));
    check('derivation of rāmaḥ has steps', steps.length > 5, String(steps.length));
    check('derivation cites 8.2.66 and 8.3.15', steps.some((s) => s.startsWith('8.2.66')) && steps.some((s) => s.startsWith('8.3.15')));
    // a feminine stem and an IAST/Devanagari round trip
    await page.fill('.prakriya-field input', 'रमा');
    await page.selectOption('.prakriya-field select', 'Stri');
    await page.waitForTimeout(300);
    const fem = await page.$eval('.prakriya-table tbody tr:nth-child(3) td:nth-child(2)', (td) => td.textContent);
    check('ramā, feminine, instrumental singular = ramayā', /ramayā/.test(fem), fem);
  }
  check('no console errors', errors.length === 0, errors.join(' | '));
  await b.close();
  if (fails.length) { console.log(`::error title=prakriya::${fails.join('; ')}`); process.exit(1); }
})();
