/**
 * Pure helpers of the Derivation tool (islands/PrakriyaStepper.tsx), kept apart so they can be unit-tested
 * (apps/web/test/prakriya.test.ts). Shapes follow vidyut-prakriyā's WebAssembly output (src/wasm.rs at 8da2f90).
 */
import { pramanaLink } from "./pramana";

export interface WebTerm {
  text: string;
  wasChanged: boolean;
}
export interface WebStep {
  rule: { source: string; code: string };
  result: WebTerm[];
}
export interface WebPrakriya {
  text: string;
  history: WebStep[];
}

/** vidyut writes accents (\ ^); accents are not taught yet, so they are dropped for display. */
export const clean = (s: string): string => s.replace(/[\\^]/g, "");

// ---------------------------------------------------------------- the stem (review D1, D4)
const VOWELS = "aAiIuUfFxXeEoO";
/** What vidyut-prakriyā's Slp1String accepts: the letters of the Śivasūtras, anusvāra, visarga; ~ only after a vowel. */
const ACCEPTED = new Set([..."aAiIuUfFxXeEoOkKgGNcCjJYwWqQRtTdDnpPbBmyrlvSzshMH"]);

export type StemProblem =
  | { kind: "empty" }
  | { kind: "space" }
  | { kind: "char"; char: string }
  | { kind: "ending"; bare: string };

/** Why this SLP1 stem cannot be declined as typed, or null when it can. */
export function stemProblem(slp: string): StemProblem | null {
  if (!slp) return { kind: "empty" };
  if (/\s/.test(slp)) return { kind: "space" };
  for (let i = 0; i < slp.length; i++) {
    const c = slp[i]!;
    const ok = c === "~" ? i > 0 && VOWELS.includes(slp[i - 1]!) : ACCEPTED.has(c);
    if (!ok) return { kind: "char", char: c };
  }
  // a finished word typed as a stem (rāmaḥ, not rāma)
  if (slp.length > 1 && /[HM]$/.test(slp)) return { kind: "ending", bare: slp.slice(0, -1) };
  return null;
}

/** How to name a character the engine refuses, for the learner. */
export function charName(c: string): string {
  const names: Record<string, string> = {
    L: "ḻ (the Vedic retroflex l)",
    Z: "ẖ (jihvāmūlīya)",
    V: "ḫ (upadhmānīya)",
    "'": "the avagraha (')",
    "~": "a nasal mark (~) that does not follow a vowel",
  };
  return names[c] ?? `“${c}”`;
}

// ---------------------------------------------------------------- feminine suffix (review D3)
/**
 * ī-stems whose ī is part of the stem, not the suffix ṅīp/ṅīṣ (avī, tantrī, tarī, lakṣmī, hrī, dhī, śrī, bhī):
 * nominative lakṣmīḥ, not *lakṣmī.
 */
const OWN_I = new Set(["avI", "tantrI", "tarI", "lakzmI", "hrI", "DI", "SrI", "BI"]);

/** Whether the "ends in a feminine suffix" box applies at all (a feminine stem in ā or ī). */
export const nyapApplies = (slp: string): boolean => /[AI]$/.test(slp);
/** Its default: ticked for feminine ā/ī stems, except those whose ī belongs to the stem. */
export const nyapDefault = (slp: string): boolean => nyapApplies(slp) && !OWN_I.has(slp);

// ---------------------------------------------------------------- rules (review D2)
const SOURCE_NAME: Record<string, string> = {
  ashtadhyayi: "Aṣṭādhyāyī",
  varttika: "vārttika",
  dhatupatha: "Dhātupāṭha",
  kashika: "Kāśikā",
  linganushasanam: "Liṅgānuśāsana",
  kaumudi: "Siddhāntakaumudī",
  unadi: "Uṇādi",
  phit: "Phiṭsūtra",
  anyatra: "elsewhere",
};

export interface RuleView {
  label: string;
  /** the sūtra the step belongs to, when there is one */
  sutra?: string;
  href?: string;
  external?: boolean;
  title?: string;
}

/**
 * How one rule code is shown. Aṣṭādhyāyī codes link to the sūtra (this site's page when it has one, else
 * Pramāṇa, else Pramāṇa's pāda page: CLAUDE.md citation rule). vidyut also writes sūtras split into parts
 * ("8.4.8.1"), vārttikas and Kāśikā statements under their sūtra ("8.4.29.1"), "label,text,url" for rules from
 * other works, and an empty code for internal steps: those return null and are not shown.
 */
export function ruleView(source: string, code: string, known: ReadonlySet<string>): RuleView | null {
  const c = code.trim();
  if (!c) return null;
  const link = (id: string): Pick<RuleView, "href" | "external" | "title"> => {
    if (known.has(id)) return { href: `/sutra/${id}/` };
    const p = pramanaLink(id);
    return { href: p.href, external: true, title: p.label };
  };
  const m = /^(\d+\.\d+\.\d+)(?:\.(\d+))?$/.exec(c);
  if (m && (source === "ashtadhyayi" || source === "varttika" || source === "kashika")) {
    const id = m[1]!;
    if (source === "ashtadhyayi") {
      const v = { label: id, sutra: id, ...link(id) };
      return m[2] ? { ...v, title: `Part ${m[2]} of sūtra ${id}${v.title ? `; ${v.title}` : ""}` } : v;
    }
    return { label: `${SOURCE_NAME[source]} on ${id}`, sutra: id, ...link(id) };
  }
  if (source === "anyatra") return { label: c.split(",")[0]!.trim() || SOURCE_NAME.anyatra! };
  return { label: `${SOURCE_NAME[source] ?? source} ${c}` };
}

/** Steps worth showing: vidyut's internal steps carry no rule code. */
export const shownSteps = (history: WebStep[]): WebStep[] => history.filter((s) => s.rule.code.trim() !== "");

// ---------------------------------------------------------------- terms and forms (review D9, D10)
export interface Chunk {
  text: string;
  changed: boolean;
  /** the terms joined into this chunk, each with its own change flag */
  parts: WebTerm[];
}

/**
 * A term that is only a sign (visarga, anusvāra, candrabindu) cannot stand alone in Devanagari; join it to the
 * term before it, so the step reads rāmaḥ rather than rāma + ◌ḥ. Each part keeps its own change flag.
 */
export function chunks(terms: WebTerm[]): Chunk[] {
  const out: Chunk[] = [];
  for (const t of terms) {
    const text = clean(t.text);
    if (!text) continue;
    const prev = out.at(-1);
    const part = { text, wasChanged: t.wasChanged };
    if (prev && /^[MH~]/.test(text)) {
      prev.text += text;
      prev.changed ||= t.wasChanged;
      prev.parts.push(part);
    } else out.push({ text, changed: t.wasChanged, parts: [part] });
  }
  return out;
}

/** One derivation per distinct form (vidyut may derive the same form twice, by different routes). */
export function distinctForms(ps: WebPrakriya[]): WebPrakriya[] {
  const seen = new Set<string>();
  return ps.filter((p) => {
    const t = clean(p.text);
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
}
