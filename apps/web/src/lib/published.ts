import { getCollection } from "astro:content";

/**
 * Lessons learners can see: those of modules whose status is "open". Lessons of modules still marked "soon"
 * get no page, no link and no sitemap entry until the module opens (external review #13).
 */
export async function publishedLessons() {
  const open = new Set((await getCollection("modules")).filter((m) => m.data.status === "open").map((m) => m.id));
  return getCollection("lessons", (l) => open.has(l.data.module));
}
