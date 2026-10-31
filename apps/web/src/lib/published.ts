import { getCollection } from "astro:content";

/**
 * Lessons learners can see: those of modules whose status is "open". Lessons of modules still marked "soon"
 * get no page, no link and no sitemap entry until the module opens (external review #13).
 */
async function openModules(): Promise<Set<string>> {
  return new Set((await getCollection("modules")).filter((m) => m.data.status === "open").map((m) => m.id));
}

export async function publishedLessons() {
  const open = await openModules();
  return getCollection("lessons", (l) => open.has(l.data.module));
}

/** Practice and review cards of open modules only (ids are "module/lesson"; P1 exit review X14). */
export async function publishedExercises() {
  const open = await openModules();
  return getCollection("exercises", (e) => open.has(e.id.split("/")[0]!));
}
