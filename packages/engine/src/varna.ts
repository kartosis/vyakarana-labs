/**
 * varṇa — Pāṇini's sound system.
 *
 * Covers the 14 Māheśvara/Śiva sūtras, it-markers (1.3.3 hal antyam),
 * pratyāhāra formation (1.1.71 ādir antyena sahetā), savarṇa (1.1.9–1.1.10),
 * guṇa/vṛddhi (1.1.1–1.1.3, 1.1.51) and the articulation tables quoted in the
 * Siddhāntakaumudī / Laghusiddhāntakaumudī under 1.1.9.
 * All sounds are SLP1.
 */

import { isConsonant, isVowel } from "./lipi.js";

export interface ShivaSutra {
  /** 1-based position among the 14 sūtras. */
  readonly n: number;
  /** Sounds taught in this sūtra (SLP1). Consonants are pronounced with "a", which is not part of the list. */
  readonly sounds: readonly string[];
  /** The final it-marker (anubandha) — a consonant, SLP1. */
  readonly it: string;
}

export const SHIVA_SUTRAS: readonly ShivaSutra[] = [
  { n: 1, sounds: ["a", "i", "u"], it: "R" },
  { n: 2, sounds: ["f", "x"], it: "k" },
  { n: 3, sounds: ["e", "o"], it: "N" },
  { n: 4, sounds: ["E", "O"], it: "c" },
  { n: 5, sounds: ["h", "y", "v", "r"], it: "w" },
  { n: 6, sounds: ["l"], it: "R" },
  { n: 7, sounds: ["Y", "m", "N", "R", "n"], it: "m" },
  { n: 8, sounds: ["J", "B"], it: "Y" },
  { n: 9, sounds: ["G", "Q", "D"], it: "z" },
  { n: 10, sounds: ["j", "b", "g", "q", "d"], it: "S" },
  { n: 11, sounds: ["K", "P", "C", "W", "T", "c", "w", "t"], it: "v" },
  { n: 12, sounds: ["k", "p"], it: "y" },
  { n: 13, sounds: ["S", "z", "s"], it: "r" },
  { n: 14, sounds: ["h"], it: "l" },
];

/** One position in the flattened Śivasūtra sequence. */
export interface Slot {
  readonly sound: string;
  readonly sutra: number;
  readonly isIt: boolean;
  /** Index in the flattened sequence. */
  readonly index: number;
}

export const SLOTS: readonly Slot[] = (() => {
  const out: Slot[] = [];
  for (const s of SHIVA_SUTRAS) {
    for (const sound of s.sounds) out.push({ sound, sutra: s.n, isIt: false, index: out.length });
    out.push({ sound: s.it, sutra: s.n, isIt: true, index: out.length });
  }
  return out;
})();

/** The sūtra-text form of a Śivasūtra, e.g. "aiuR", "hayavaraw" (SLP1). */
export function shivaSutraText(s: ShivaSutra): string {
  return s.sounds.map((x) => (isConsonant(x) ? `${x}a` : x)).join("") + s.it;
}

/** Name of a pratyāhāra: first sound (+ "a" if a consonant) + it-marker, e.g. "ac", "hal", "Jaz". */
export function pratyaharaName(first: string, it: string): string {
  return (isConsonant(first) ? `${first}a` : first) + it;
}

export interface Pratyahara {
  readonly name: string;
  readonly first: string;
  readonly it: string;
  /** Which occurrence of the it-marker closes the range (only matters for "R"/ṇ, which ends sūtras 1 and 6). */
  readonly itSutra: number;
  /** Member sounds in Śivasūtra order, it-markers excluded, duplicates (h) kept once. */
  readonly sounds: readonly string[];
}

/**
 * ādir antyena sahetā (1.1.71): an initial sound together with a final it-marker
 * denotes itself and every sound in between (it-markers excluded).
 *
 * @param first  first member sound (SLP1)
 * @param it     closing it-marker (SLP1)
 * @param itSutra optional sūtra number of the closing it-marker; defaults to the first one after `first`.
 */
export function expandPratyahara(first: string, it: string, itSutra?: number): Pratyahara {
  const start = SLOTS.find((s) => !s.isIt && s.sound === first);
  if (!start) throw new Error(`"${first}" is not taught in the Śivasūtras`);
  const end = SLOTS.find(
    (s) => s.isIt && s.sound === it && s.index > start.index && (itSutra === undefined || s.sutra === itSutra),
  );
  if (!end) throw new Error(`No it-marker "${it}" after "${first}"`);
  const sounds: string[] = [];
  for (let i = start.index; i < end.index; i++) {
    const slot = SLOTS[i]!;
    if (!slot.isIt && !sounds.includes(slot.sound)) sounds.push(slot.sound);
  }
  return { name: pratyaharaName(first, it), first, it, itSutra: end.sutra, sounds };
}

/**
 * Pratyāhāras commonly cited from the Aṣṭādhyāyī, in Śivasūtra order of their closing marker.
 * `itSutra` is fixed where ṇ is ambiguous: aṇ normally uses the first ṇ (sūtra 1) — except in
 * 1.1.69 aṇudit savarṇasya cāpratyayaḥ, where it extends to the second; iṇ and yaṇ use the second.
 */
export const STANDARD_PRATYAHARAS: ReadonlyArray<{ first: string; it: string; itSutra?: number; note?: string }> = [
  { first: "a", it: "R", itSutra: 1, note: "In 1.1.69 aṇ runs to the second ṇ (a … l)." },
  { first: "a", it: "k" }, { first: "i", it: "k" }, { first: "u", it: "k" },
  { first: "e", it: "N" },
  { first: "a", it: "c" }, { first: "i", it: "c" }, { first: "e", it: "c" }, { first: "E", it: "c" },
  { first: "a", it: "w" },
  { first: "a", it: "R", itSutra: 6, note: "Only in 1.1.69." },
  { first: "i", it: "R", itSutra: 6 }, { first: "y", it: "R", itSutra: 6 },
  { first: "a", it: "m" }, { first: "y", it: "m" }, { first: "N", it: "m" },
  { first: "y", it: "Y" },
  { first: "J", it: "z" }, { first: "B", it: "z" },
  { first: "a", it: "S" }, { first: "h", it: "S" }, { first: "v", it: "S" }, { first: "J", it: "S" },
  { first: "j", it: "S" }, { first: "b", it: "S" },
  { first: "C", it: "v" },
  { first: "a", it: "y" }, { first: "m", it: "y" }, { first: "J", it: "y" }, { first: "K", it: "y" },
  { first: "c", it: "y" },
  { first: "y", it: "r" }, { first: "J", it: "r" }, { first: "K", it: "r" }, { first: "c", it: "r" },
  { first: "S", it: "r" },
  { first: "a", it: "l" }, { first: "h", it: "l" }, { first: "v", it: "l" }, { first: "r", it: "l" },
  { first: "J", it: "l" }, { first: "S", it: "l" },
];

export const standardPratyaharas = (): Pratyahara[] =>
  STANDARD_PRATYAHARAS.map((p) => expandPratyahara(p.first, p.it, p.itSutra));

/** Look up a pratyāhāra by its SLP1 name (e.g. "ac", "hal", "Jaz"). Ambiguous "aR" resolves to sūtra 1. */
export function pratyahara(name: string): Pratyahara {
  const it = name.slice(-1);
  const body = name.slice(0, -1);
  const first = body.length === 2 && body.endsWith("a") && isConsonant(body[0]!) ? body[0]! : body;
  const known = STANDARD_PRATYAHARAS.find((p) => p.first === first && p.it === it);
  return expandPratyahara(first, it, known?.itSutra);
}

// ---------------------------------------------------------------------------
// it-saṃjñā: which letters of an upadeśa are markers (1.3.2–1.3.8, simplified to the
// two rules taught in the first lessons: 1.3.2 nasal vowels, 1.3.3 final consonant).
// ---------------------------------------------------------------------------

/** 1.3.3 hal antyam — the final consonant of an instructional item is an it. */
export function finalConsonantIt(upadesha: string): string | null {
  const last = upadesha.at(-1);
  return last && isConsonant(last) ? last : null;
}

// ---------------------------------------------------------------------------
// Vowel grades
// ---------------------------------------------------------------------------

export type Grade = "guna" | "vrddhi";

/** 1.1.2 adeṅ guṇaḥ · 1.1.1 vṛddhir ādaic · 1.1.51 uraṇ raparaḥ (ṛ/ḷ take r/l). */
const GRADES: Record<string, { guna: string; vrddhi: string }> = {
  a: { guna: "a", vrddhi: "A" }, A: { guna: "a", vrddhi: "A" },
  i: { guna: "e", vrddhi: "E" }, I: { guna: "e", vrddhi: "E" },
  u: { guna: "o", vrddhi: "O" }, U: { guna: "o", vrddhi: "O" },
  f: { guna: "ar", vrddhi: "Ar" }, F: { guna: "ar", vrddhi: "Ar" },
  x: { guna: "al", vrddhi: "Al" },
};

export function grade(vowel: string, g: Grade): string {
  const row = GRADES[vowel];
  if (!row) throw new Error(`No ${g} for "${vowel}"`);
  return row[g];
}

export const GUNA_SOUNDS = ["a", "e", "o"] as const; // 1.1.2
export const VRDDHI_SOUNDS = ["A", "E", "O"] as const; // 1.1.1

// ---------------------------------------------------------------------------
// Articulation (sthāna, prayatna) — from the Siddhāntakaumudī under 1.1.9:
// akuhavisarjanīyānāṃ kaṇṭhaḥ · icuyaśānāṃ tālu · ṛṭuraṣāṇāṃ mūrdhā · ḷtulasānāṃ dantāḥ ·
// upūpadhmānīyānām oṣṭhau · ñamaṅaṇanānāṃ nāsikā ca · edaitoḥ kaṇṭhatālu ·
// odautoḥ kaṇṭhoṣṭham · vakārasya dantoṣṭham.
// ---------------------------------------------------------------------------

export type Sthana = "kantha" | "talu" | "murdhan" | "danta" | "ostha" | "nasika";
export type Abhyantara = "sprsta" | "isatsprsta" | "isadvivrta" | "vivrta";

export interface Articulation {
  readonly sthana: readonly Sthana[];
  readonly abhyantara: Abhyantara;
  /** bāhya prayatna, for consonants only */
  readonly ghosa?: boolean;
  readonly mahaprana?: boolean;
}

const VARGA: Record<string, Sthana> = {};
for (const c of "kKgGN") VARGA[c] = "kantha";
for (const c of "cCjJY") VARGA[c] = "talu";
for (const c of "wWqQR") VARGA[c] = "murdhan";
for (const c of "tTdDn") VARGA[c] = "danta";
for (const c of "pPbBm") VARGA[c] = "ostha";

export function articulation(s: string): Articulation {
  if (isVowel(s)) {
    const sthana: Sthana[] =
      "aA".includes(s) ? ["kantha"] :
      "iI".includes(s) ? ["talu"] :
      "uU".includes(s) ? ["ostha"] :
      "fF".includes(s) ? ["murdhan"] :
      "xX".includes(s) ? ["danta"] :
      "eE".includes(s) ? ["kantha", "talu"] :
      ["kantha", "ostha"];
    return { sthana, abhyantara: "vivrta" };
  }
  if (!isConsonant(s)) throw new Error(`Not a sound: "${s}"`);
  const ghosa = "gGNjJYqQRdDnbBmyrlvh".includes(s);
  const mahaprana = "KGCJWQTDPBSzsh".includes(s);
  if (VARGA[s]) {
    const sthana: Sthana[] = "YmNRn".includes(s) ? [VARGA[s]!, "nasika"] : [VARGA[s]!];
    return { sthana, abhyantara: "sprsta", ghosa, mahaprana };
  }
  const table: Record<string, [Sthana[], Abhyantara]> = {
    y: [["talu"], "isatsprsta"], r: [["murdhan"], "isatsprsta"],
    l: [["danta"], "isatsprsta"], v: [["danta", "ostha"], "isatsprsta"],
    S: [["talu"], "isadvivrta"], z: [["murdhan"], "isadvivrta"],
    s: [["danta"], "isadvivrta"], h: [["kantha"], "isadvivrta"],
  };
  const [sthana, abhyantara] = table[s]!;
  return { sthana, abhyantara, ghosa, mahaprana };
}

/**
 * 1.1.9 tulyāsyaprayatnaṃ savarṇam + 1.1.10 nājjhalau.
 * Same place and same internal effort ⇒ savarṇa; a vowel and a consonant never are.
 * Includes the vārttika ṛḷvarṇayor mithaḥ sāvarṇyam (ṛ and ḷ are savarṇa).
 */
export function isSavarna(x: string, y: string): boolean {
  if (isVowel(x) !== isVowel(y)) return false; // 1.1.10
  if (isVowel(x)) {
    const cls = (v: string) =>
      "aA".includes(v) ? "a" : "iI".includes(v) ? "i" : "uU".includes(v) ? "u" : "fFxX".includes(v) ? "f" : v;
    return cls(x) === cls(y);
  }
  // "āsya" covers places inside the mouth only, so nāsikā is ignored (ṅa and ka are savarṇa).
  const oral = (s: string) => articulation(s).sthana.filter((p) => p !== "nasika").join("+");
  return articulation(x).abhyantara === articulation(y).abhyantara && oral(x) === oral(y);
}

export const isHrasva = (v: string): boolean => "aiufx".includes(v);
export const isDirgha = (v: string): boolean => "AIUFXeEoO".includes(v);
