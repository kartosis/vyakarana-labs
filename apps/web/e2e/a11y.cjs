// axe-core audit (WCAG 2.2 A/AA rules) of every page type, light and dark. Exits 1 on violations.
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const BASE = process.env.BASE_URL || 'http://localhost:4321';
const urls = [
  '/', '/course/', '/course/varnamala/sounds/', '/course/varnamala/script/', '/course/varnamala/reading-sutras/',
  '/course/samjna/shiva-sutras/', '/course/samjna/savarna/', '/course/samjna/pratyahara/', '/sutra/1.1.71/', '/sutras/',
  '/tools/', '/tools/lipi/', '/tools/savarna/', '/tools/pratyahara/', '/signin/', '/me/', '/review/', '/leaderboard/',
  '/sources/', '/about/', '/privacy/', '/does-not-exist/',
  '/course/samjna/samyoga-pada/', '/course/ac-sandhi/yan/', '/course/ac-sandhi/ayadi/', '/course/ac-sandhi/guna/',
  '/course/ac-sandhi/vrddhi/', '/course/ac-sandhi/dirgha/', '/course/ac-sandhi/pragrhya/', '/tools/sandhi/',
  '/tools/sandhi/?a=pra&b=ejate', '/sutra/1.1.9/', '/sutra/6.1.125/',
  '/course/hal-sandhi/scutva/', '/course/hal-sandhi/jastva/', '/course/hal-sandhi/anusvara/',
  '/course/hal-sandhi/augments/', '/course/hal-sandhi/ru/', '/tools/sandhi/?a=san&b=%C5%9Bambhu%E1%B8%A5',
  '/sutra/8.3.37/', '/sutra/8.4.40/',
  '/course/visarga-sandhi/voiceless/', '/course/visarga-sandhi/ru-to-o/', '/course/visarga-sandhi/vanishing/',
  '/tools/sandhi/?a=%C5%9Biva%E1%B8%A5&b=arcya%E1%B8%A5', '/sutra/6.1.113/', '/tools/prakriya/',
];
/** Scroll through the page so every client:visible island hydrates before the audit. */
async function hydrateAll(p) {
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(300);
}
/** In GitHub Actions, also emit an annotation: readable through the check-runs API without downloading logs. */
const annotate = (msg) => { if (process.env.GITHUB_ACTIONS) console.log(`::error title=axe::${msg.replace(/\r?\n/g, ' ')}`); };
(async () => {
  const b = await chromium.launch();
  let violations = 0;
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ colorScheme: scheme });
    for (const u of urls) {
      const p = await ctx.newPage();
      try {
        await p.goto(BASE + u, { waitUntil: 'networkidle' });
        await hydrateAll(p);
        const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        for (const v of r.violations) {
          violations++;
          const targets = v.nodes.slice(0, 3).map((n) => n.target.join(' '));
          console.log(`[${scheme}] ${u} :: ${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}`);
          for (const t of targets) console.log('    ', t);
          annotate(`[${scheme}] ${u} ${v.id} (${v.impact}) x${v.nodes.length}: ${v.help} | ${targets.join(' | ')}`);
        }
      } catch (e) {
        violations++;
        console.log(`[${scheme}] ${u} :: audit failed: ${e.message}`);
        annotate(`[${scheme}] ${u} audit failed: ${String(e.message).slice(0, 300)}`);
      }
      await p.close();
    }
    await ctx.close();
  }
  await b.close();
  console.log(`axe: ${urls.length} pages x 2 themes, ${violations} violations`);
  process.exit(violations ? 1 : 0);
})();
