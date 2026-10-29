// axe-core audit (WCAG 2.2 A/AA rules) of every page type, light and dark. Exits 1 on violations.
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const BASE = process.env.BASE_URL || 'http://localhost:4321';
const urls = [
  '/', '/course/', '/course/varnamala/sounds/', '/course/varnamala/script/', '/course/varnamala/reading-sutras/',
  '/course/samjna/shiva-sutras/', '/course/samjna/savarna/', '/course/samjna/pratyahara/', '/sutra/1.1.71/', '/sutras/',
  '/tools/', '/tools/lipi/', '/tools/savarna/', '/tools/pratyahara/', '/signin/', '/me/', '/review/', '/leaderboard/',
  '/sources/', '/about/', '/privacy/', '/does-not-exist/',
];
(async () => {
  const b = await chromium.launch();
  let violations = 0;
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ colorScheme: scheme });
    for (const u of urls) {
      const p = await ctx.newPage();
      await p.goto(BASE + u, { waitUntil: 'networkidle' });
      const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      for (const v of r.violations) {
        violations++;
        console.log(`[${scheme}] ${u} :: ${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}`);
        for (const n of v.nodes.slice(0, 3)) console.log('    ', n.target.join(' '));
      }
      await p.close();
    }
    await ctx.close();
  }
  await b.close();
  console.log(`axe: ${urls.length} pages x 2 themes, ${violations} violations`);
  process.exit(violations ? 1 : 0);
})();
