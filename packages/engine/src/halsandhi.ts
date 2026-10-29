/**
 * Hal-sandhi: what happens where two words meet and at least one of the sounds is a consonant
 * (Laghusiddhāntakaumudī 62–102), SLP1 in and out, with a sūtra-by-sūtra trace.
 *
 * Rules apply in the order the grammar requires: the chapter-6 augment tuk (6.1.73, 6.1.76) first, then the
 * rules of the last three quarters (tripādī) in the order of their numbers (8.2.1 pūrvatrāsiddham):
 *   8.2.39 jaśtva → 8.3.7 n → ru → 8.3.23 m → anusvāra (8.3.25–27) → 8.3.28–31 augments → 8.3.32 ṅamuṭ
 *   → 8.4.40 ścutva (8.4.44) → 8.4.41 ṣṭutva (8.4.42–43) → 8.4.45 nasal → 8.4.55 car → 8.4.59 parasavarṇa
 *   → 8.4.60 tor li → 8.4.62 h → 8.4.63 ś → ch → 8.4.65 lopa.
 * Optional rules branch. The main result takes the branch Varadarāja lists first; every other branch is an
 * alternative naming the optional rules it applied or left out.
 * Not modelled: visarga and final s/r (the next prakaraṇa), internal sandhi before suffixes (8.3.24 and the
 * vārttika making 8.4.45 compulsory before a suffix), and 8.4.47 doubling (taught with ac-sandhi).
 */
import { fromSlp1, isConsonant, isVowel } from "./lipi.js";
import { isSavarna } from "./varna.js";
import type { Alternative, SandhiResult, SandhiStep } from "./sandhi.js";

export interface HalSandhiOptions {
  /** the second item is a suffix (pratyaya): the vārttika on 8.4.45 makes the nasal compulsory — vāṅmayam, tanmātram */
  suffix?: boolean;
}

// ---- sound classes (SLP1) -------------------------------------------------------------------------------
const ROWS = ["kKgGN", "cCjJY", "wWqQR", "tTdDn", "pPbBm"] as const;
const rowOf = (c: string) => ROWS.findIndex((r) => r.includes(c));
const STOPS = ROWS.map((r) => r.slice(0, 4)).join(""); // non-nasal stops: jhay
const NASALS = "NYRnm";
const KHAR = "kKcCwWtTpPSzs"; // voiceless consonants
const JHAS = "gGjJqQdDbB"; // voiced stops
const HRASVA = "aiufx";
const AT = "aAiIuUfFxXeEoOhyvr"; // aṭ: vowels, h, y, v, r
const AM = AT + "lYmNRn"; // am: aṭ + l + nasals
const CHAV = "CWTcwt";
const jas = (c: string) => ROWS[rowOf(c)]![2]!; // unaspirated voiced
const car = (c: string) => ROWS[rowOf(c)]![0]!; // unaspirated voiceless
const nasalOf = (c: string) => ROWS[rowOf(c)]![4]!;
const voicedAspirate = (c: string) => ROWS[rowOf(c)]![3]!;
const v = (c: string) => fromSlp1(c, "iast");
const T_ROW = "tTdDn";
const C_ROW = "cCjJY";
const W_ROW = "wWqQR";
/** s and the t-row ("stu") mapped to ś and the c-row ("ścu") / ṣ and the ṭ-row ("ṣṭu") */
const toPalatal = (c: string) => (c === "s" ? "S" : C_ROW[T_ROW.indexOf(c)]!);
const toRetroflex = (c: string) => (c === "s" ? "z" : W_ROW[T_ROW.indexOf(c)]!);
const isStu = (c: string) => c === "s" || T_ROW.includes(c);
const isScu = (c: string) => c === "S" || C_ROW.includes(c);
const isSzu = (c: string) => c === "z" || W_ROW.includes(c);

interface State {
  pre: string;
  post: string;
  /** second item is a suffix */
  suffix?: boolean;
  steps: SandhiStep[];
  /** optional rules met on this path: applied or not */
  choices: Array<{ sutra: string; applied: boolean; varttika?: boolean }>;
}

/** Display: a word ending in a consonant is written together with the next word, as in Varadarāja's text. */
export const joinWords = (pre: string, post: string) =>
  pre && isConsonant(pre.at(-1)!) && !(STOPS.includes(pre.at(-1)!) && post[0] === "h") ? pre + post : `${pre} ${post}`;

type Shape = Omit<State, "steps" | "choices">;
type Rule = (s: State) => { obligatory: Shape; note: string } | { optional: Shape; note: string; skipNote?: string; byDefault: boolean } | null;

interface RuleDef {
  sutra: string;
  /** the rule is a vārttika cited under this sūtra */
  varttika?: boolean;
  run: Rule;
}

const RULES: RuleDef[] = [
  {
    // 6.1.73 che ca / 6.1.76 padāntād vā: augment t after a vowel before ch
    sutra: "6.1.73",
    run: ({ pre, post }) => {
      const x = pre.at(-1)!;
      if (post[0] !== "C" || !isVowel(x)) return null;
      if (HRASVA.includes(x)) return { obligatory: { pre: pre + "t", post }, note: "A short vowel before ch takes the augment t (tuk)." };
      return null;
    },
  },
  {
    sutra: "6.1.76",
    run: ({ pre, post }) => {
      const x = pre.at(-1)!;
      if (post[0] !== "C" || !isVowel(x) || HRASVA.includes(x)) return null;
      return { optional: { pre: pre + "t", post }, note: "A long vowel at the end of a word may take the augment t before ch.", skipNote: "without the optional t (6.1.76)", byDefault: true };
    },
  },
  {
    // 8.2.39 jhalāṃ jaśo 'nte: word-final stop → unaspirated voiced
    sutra: "8.2.39",
    run: ({ pre, post }) => {
      const x = pre.at(-1)!;
      if (!STOPS.includes(x) || jas(x) === x) return null;
      return { obligatory: { pre: pre.slice(0, -1) + jas(x), post }, note: `At the end of a word, ${x === jas(x) ? x : "the stop"} becomes the unaspirated voiced stop of its row.` };
    },
  },
  {
    // 8.3.7 naś chavy apraśān (+ 8.3.2/8.3.4, 8.3.15, 8.3.34): n before c ch ṭ ṭh t th + am → s, with a nasal before it
    sutra: "8.3.7",
    run: ({ pre, post }) => {
      if (pre.at(-1) !== "n" || !CHAV.includes(post[0]!) || !AM.includes(post[1] ?? "") || pre === "praSAn") return null;
      return { obligatory: { pre: pre.slice(0, -1) + "~r", post }, note: "A word-final n before c, ch, ṭ, ṭh, t or th (followed by a vowel, semivowel, h or nasal) becomes ru, written r here. By 8.3.2 the vowel before it is nasalised." };
    },
  },
  {
    // 8.3.4: instead of nasalising the vowel, add anusvāra (an equal option to 8.3.2)
    sutra: "8.3.4",
    run: ({ pre, post }) => {
      if (!pre.endsWith("~r")) return null;
      return { optional: { pre: pre.slice(0, -2) + "Mr", post }, note: "Or, instead of nasalising the vowel, an anusvāra is added after it.", byDefault: false };
    },
  },
  {
    sutra: "8.3.15",
    run: ({ pre, post }) => {
      if (!/[~M]r$/.test(pre) || !KHAR.includes(post[0]!)) return null;
      return { obligatory: { pre: pre.slice(0, -1) + "H", post }, note: "A word-final r before a voiceless consonant becomes visarga." };
    },
  },
  {
    sutra: "8.3.34",
    run: ({ pre, post }) => {
      if (!/[~M]H$/.test(pre) || !KHAR.includes(post[0]!)) return null;
      return { obligatory: { pre: pre.slice(0, -1) + "s", post }, note: "Visarga before a voiceless consonant becomes s." };
    },
  },
  {
    // 8.3.23 mo 'nusvāraḥ, with 8.3.26 / 8.3.27 options before h + m / n
    sutra: "8.3.23",
    run: ({ pre, post }) => {
      if (pre.at(-1) !== "m" || !isConsonant(post[0]!)) return null;
      if (pre === "sam" && /^rA[jw]/.test(post)) return null; // 8.3.25 samrāṭ
      return { obligatory: { pre: pre.slice(0, -1) + "M", post }, note: "A word-final m before a consonant becomes anusvāra." };
    },
  },
  {
    sutra: "8.3.26",
    run: ({ pre, post }) => {
      if (!pre.endsWith("M") || post[0] !== "h" || post[1] !== "m") return null;
      return { optional: { pre: pre.slice(0, -1) + "m", post }, note: "Before h followed by m, the m may stay m.", byDefault: false };
    },
  },
  {
    // vārttika on 8.3.26: yavalapare yavalā vā
    sutra: "8.3.26",
    varttika: true,
    run: ({ pre, post }) => {
      if (!pre.endsWith("M") || post[0] !== "h" || !"yvl".includes(post[1] ?? "")) return null;
      return { optional: { pre: pre.slice(0, -1) + post[1] + "~", post }, note: `A vārttika: before h followed by ${post[1]}, the m may become a nasalised ${post[1]}.`, byDefault: true };
    },
  },
  {
    sutra: "8.3.27",
    run: ({ pre, post }) => {
      if (!pre.endsWith("M") || post[0] !== "h" || post[1] !== "n") return null;
      return { optional: { pre: pre.slice(0, -1) + "n", post }, note: "Before h followed by n, the m may become n.", byDefault: false };
    },
  },
  {
    // 8.3.28 ṅṇoḥ kukṭuk śari (+ vārttika: the k/ṭ may be aspirated)
    sutra: "8.3.28",
    run: ({ pre, post }) => {
      const x = pre.at(-1)!;
      if (!(x === "N" || x === "R") || !"Szs".includes(post[0]!)) return null;
      return { optional: { pre: pre + (x === "N" ? "k" : "w"), post }, note: `After word-final ${x === "N" ? "ṅ" : "ṇ"}, before a sibilant, the augment ${x === "N" ? "k" : "ṭ"} may be added.`, byDefault: true };
    },
  },
  {
    sutra: "8.3.29",
    run: ({ pre, post }) => {
      if (pre.at(-1) !== "q" || post[0] !== "s") return null;
      return { optional: { pre, post: "D" + post }, note: "After ḍ, an s may take the augment dh (dhuṭ).", byDefault: true };
    },
  },
  {
    sutra: "8.3.30",
    run: ({ pre, post }) => {
      if (pre.at(-1) !== "n" || post[0] !== "s") return null;
      return { optional: { pre, post: "D" + post }, note: "After n, an s may take the augment dh (dhuṭ).", byDefault: true };
    },
  },
  {
    sutra: "8.3.31",
    run: ({ pre, post }) => {
      if (pre.at(-1) !== "n" || post[0] !== "S") return null;
      return { optional: { pre: pre + "t", post }, note: "A word-final n before ś may take the augment t (tuk).", byDefault: true };
    },
  },
  {
    // 8.3.32 ṅamo hrasvād aci ṅamuṇ nityam: ṅ ṇ n after a short vowel, before a vowel → doubled
    sutra: "8.3.32",
    run: ({ pre, post }) => {
      const x = pre.at(-1)!;
      if (!"NRn".includes(x) || !HRASVA.includes(pre.at(-2) ?? "") || !isVowel(post[0]!)) return null;
      return { obligatory: { pre, post: x + post }, note: `After a short vowel, word-final ${x === "N" ? "ṅ" : x === "R" ? "ṇ" : "n"} gives the following vowel the same nasal as an augment (ṅamuṭ).` };
    },
  },
  {
    // 8.4.40 stoḥ ścunā ścuḥ (8.4.44 śāt): s / t-row next to ś / c-row → ś / c-row; spreads leftwards
    sutra: "8.4.40",
    run: ({ pre, post }) => {
      let p = pre;
      let q = post;
      let changed = false;
      // leftwards from the junction: each stu before a ścu becomes ścu
      for (let i = p.length - 1; i >= 0; i--) {
        const next = i === p.length - 1 ? q[0]! : p[i + 1]!;
        if (isStu(p[i]!) && isScu(next)) {
          p = p.slice(0, i) + toPalatal(p[i]!) + p.slice(i + 1);
          changed = true;
        } else break;
      }
      // rightwards: a stu after a ścu (not after ś: 8.4.44)
      const last = p.at(-1)!;
      if (isScu(last) && last !== "S" && isStu(q[0]!)) {
        q = toPalatal(q[0]!) + q.slice(1);
        changed = true;
      }
      return changed ? { obligatory: { pre: p, post: q }, note: "s or a dental next to ś or a palatal becomes ś or the palatal of its row (ścutva)." } : null;
    },
  },
  {
    // 8.4.41 ṣṭunā ṣṭuḥ, with 8.4.42 (not after a word-final ṭ-row, except nām, navati, nagarī) and 8.4.43 (t-row before ṣ)
    sutra: "8.4.41",
    run: ({ pre, post }) => {
      let p = pre;
      let q = post;
      let changed = false;
      for (let i = p.length - 1; i >= 0; i--) {
        const next = i === p.length - 1 ? q[0]! : p[i + 1]!;
        if (isStu(p[i]!) && isSzu(next) && !(T_ROW.includes(p[i]!) && next === "z")) {
          p = p.slice(0, i) + toRetroflex(p[i]!) + p.slice(i + 1);
          changed = true;
        } else break;
      }
      const last = p.at(-1)!;
      const exception = /^(nAm|navat|nagar)/.test(q);
      if (isSzu(last) && isStu(q[0]!) && (!W_ROW.includes(last) || exception)) {
        q = toRetroflex(q[0]!) + q.slice(1);
        changed = true;
      }
      return changed ? { obligatory: { pre: p, post: q }, note: "s or a dental next to ṣ or a retroflex becomes ṣ or the retroflex of its row (ṣṭutva)." } : null;
    },
  },
  {
    // 8.4.45 yaro 'nunāsike 'nunāsiko vā
    sutra: "8.4.45",
    run: ({ pre, post, suffix }) => {
      const x = pre.at(-1)!;
      if (!STOPS.includes(x) || !NASALS.includes(post[0]!)) return null;
      const out = { pre: pre.slice(0, -1) + nasalOf(x), post, suffix };
      // vārttika "pratyaye bhāṣāyāṃ nityam": before a suffix (the genitive plural nām is one) the nasal is compulsory
      if (suffix || /^[nR]Am/.test(post)) return { obligatory: out, note: "A word-final consonant before a nasal becomes the nasal of its row; before a suffix this is compulsory (vārttika)." };
      return { optional: out, note: "A word-final consonant before a nasal may become the nasal of its row.", byDefault: true };
    },
  },
  {
    // 8.4.55 khari ca: stop before a voiceless consonant → unaspirated voiceless (inside the junction cluster)
    sutra: "8.4.55",
    run: ({ pre, post }) => {
      const s = pre + "|" + post;
      let out = s;
      // right to left, so that a change spreads back through a cluster (ḍ + dh + s → ṭ + t + s)
      for (let i = out.length - 2; i >= 0; i--) {
        const a = out[i]!;
        const b = out[i + 1] === "|" ? out[i + 2] ?? "" : out[i + 1]!;
        if (STOPS.includes(a) && KHAR.includes(b) && car(a) !== a) out = out.slice(0, i) + car(a) + out.slice(i + 1);
      }
      if (out === s) return null;
      const [p, q] = out.split("|") as [string, string];
      return { obligatory: { pre: p, post: q }, note: "A stop before a voiceless consonant becomes the unaspirated voiceless stop of its row." };
    },
  },
  {
    // vārttika on 8.4.48 (cayo dvitīyāḥ śari pauṣkarasādeḥ), cited by Varadarāja under 8.3.28: the k or ṭ
    // augment may be aspirated before a sibilant. It works on the voiceless stops that 8.4.55 produces.
    sutra: "8.4.48",
    varttika: true,
    run: ({ pre, post }) => {
      // only before ṣ or s: before ś the next rule (8.4.63) may turn the ś into ch, and the Kāśikā gives prāṅk chete
      if (!/(Nk|Rw)$/.test(pre) || !"zs".includes(post[0]!)) return null;
      return { optional: { pre: pre.slice(0, -1) + (pre.endsWith("k") ? "K" : "W"), post }, note: "A vārttika (Pauṣkarasādi's view): before a sibilant, the k or ṭ may become aspirated.", byDefault: true };
    },
  },
  {
    // 8.4.58 / 8.4.59: anusvāra before a stop → that stop's nasal; optional at word end
    sutra: "8.4.59",
    run: ({ pre, post }) => {
      if (!pre.endsWith("M") || !(STOPS + NASALS).includes(post[0]!)) return null;
      return { optional: { pre: pre.slice(0, -1) + nasalOf(post[0]!), post }, note: "Anusvāra before a stop becomes that stop's nasal (8.4.58); at the end of a word this is optional.", byDefault: false };
    },
  },
  {
    // 8.4.60 tor li: t-row before l → l (n → nasal l)
    sutra: "8.4.60",
    run: ({ pre, post }) => {
      const x = pre.at(-1)!;
      if (!T_ROW.includes(x) || post[0] !== "l") return null;
      return { obligatory: { pre: pre.slice(0, -1) + (x === "n" ? "~l" : "l"), post }, note: x === "n" ? "n before l becomes a nasalised l (written with a candrabindu)." : "A dental before l becomes l." };
    },
  },
  {
    // 8.4.62 jhayo ho 'nyatarasyām
    sutra: "8.4.62",
    run: ({ pre, post }) => {
      const x = pre.at(-1)!;
      if (!STOPS.includes(x) || post[0] !== "h") return null;
      return { optional: { pre, post: voicedAspirate(x) + post.slice(1) }, note: `After ${v(x)}, h may become ${v(voicedAspirate(x))}, the voiced aspirate of its row.`, byDefault: true };
    },
  },
  {
    // 8.4.63 śaś cho 'ṭi (+ vārttika: before am)
    sutra: "8.4.63",
    run: ({ pre, post }) => {
      const x = pre.at(-1)!;
      if (!STOPS.includes(x) || post[0] !== "S" || !AM.includes(post[1] ?? "")) return null;
      return { optional: { pre, post: "C" + post.slice(1) }, note: "After a stop, ś before a vowel, semivowel, h or nasal may become ch.", byDefault: true };
    },
  },
  {
    // 8.4.65 jharo jhari savarṇe: after a consonant, a stop or sibilant may drop before a like one
    sutra: "8.4.65",
    run: ({ pre, post }) => {
      const x = pre.at(-1)!;
      const before = pre.at(-2) ?? "";
      const y = post[0]!;
      if (!isConsonant(before) || !(STOPS + "Szs").includes(x) || !(STOPS + "Szs").includes(y) || !isSavarna(x, y)) return null;
      return { optional: { pre: pre.slice(0, -1), post }, note: `After a consonant, ${v(x)} may be dropped before the like sound ${v(y)}.`, byDefault: true };
    },
  },
];

export interface HalSandhiResult extends SandhiResult {
  /** why nothing happened, when untouched */
  note?: string;
}

const notApplicable = (first: string, second: string, why: string): HalSandhiResult => ({
  result: `${first} ${second}`,
  junction: null,
  alternatives: [],
  steps: [],
  untouched: true,
  note: why,
});

export function consonantSandhi(first: string, second: string, opts: HalSandhiOptions = {}): HalSandhiResult {
  const x = first.at(-1) ?? "";
  const y = second[0] ?? "";
  if (!x || !y) return notApplicable(first, second, "Two words are needed.");
  if ("Hsrz".includes(x)) return notApplicable(first, second, "A word ending in visarga, s or r is the subject of the next prakaraṇa, visarga sandhi.");
  if ("Sh".includes(x)) return notApplicable(first, second, "Words ending in ś or h change by rules taught with declension.");
  if ("cCjJY".includes(x)) return notApplicable(first, second, "No word ends in a palatal: by 8.2.30 a word-final palatal becomes a velar (vāc → vāk). Type the word as it ends.");

  // Walk every branch of the rule sequence.
  let states: State[] = [{ pre: first, post: second, suffix: !!opts.suffix, steps: [], choices: [] }];
  for (const rule of RULES) {
    const next: State[] = [];
    for (const s of states) {
      const r = rule.run(s);
      if (!r) {
        next.push(s);
      } else if ("obligatory" in r) {
        next.push({ ...r.obligatory, suffix: s.suffix, steps: [...s.steps, { sutra: rule.sutra, form: joinWords(r.obligatory.pre, r.obligatory.post), note: r.note }], choices: s.choices });
      } else {
        const v = rule.varttika ? { varttika: true } : {};
        const applied: State = { ...r.optional, suffix: s.suffix, steps: [...s.steps, { sutra: rule.sutra, form: joinWords(r.optional.pre, r.optional.post), note: r.note }], choices: [...s.choices, { sutra: rule.sutra, applied: true, ...v }] };
        const skipped: State = { ...s, choices: [...s.choices, { sutra: rule.sutra, applied: false, ...v }] };
        next.push(...(r.byDefault ? [applied, skipped] : [skipped, applied]));
      }
    }
    states = next;
  }
  const isDefault = (s: State) => s.choices.every((c) => c.applied === defaultOf(c.sutra));
  const main = states.find(isDefault) ?? states[0]!;
  const form = (s: State) => joinWords(s.pre, s.post);
  const seen = new Set([form(main)]);
  const alternatives: Alternative[] = [];
  for (const s of states) {
    const f = form(s);
    if (seen.has(f)) continue;
    seen.add(f);
    const diff = s.choices.filter((c) => c.applied !== defaultOf(c.sutra));
    const label = (c: { sutra: string; varttika?: boolean }) =>
      c.varttika ? (c.sutra === "8.3.26" ? "the nasal y, v or l (vārttika)" : "the aspirated k or ṭ (vārttika)") : OPTIONAL_NAME[c.sutra] ?? `rule ${c.sutra}`;
    const text = diff.map((c) => `${c.applied ? "with" : "without"} ${label(c)}${c.sutra !== diff[0]!.sutra ? ` (${c.sutra})` : ""}`).join(", and ");
    alternatives.push({
      form: f,
      sutra: diff[0]?.sutra ?? s.steps.at(-1)?.sutra ?? "",
      ...(diff[0]?.varttika ? { varttika: true } : {}),
      note: `${text.charAt(0).toUpperCase()}${text.slice(1)}, which is optional.`,
    });
  }
  if (!main.steps.length) {
    return { result: form(main), junction: null, alternatives, steps: [], untouched: true, note: "No consonant-sandhi rule applies: the words are simply written side by side." };
  }
  const result = form(main);
  const compact = result.replace(" ", "");
  // When the change reaches back to the vowel before the final (a nasalised vowel or anusvāra), show that vowel too.
  const reach = /^(.)(\1)?[~M]/.test(compact.slice(first.length - 1)) ? 1 : 0;
  const nasalBefore = compact.length > first.length - 1 && /[~M]/.test(compact.slice(first.length - 1, first.length + 1)) ? 1 : 0;
  const k = Math.max(reach, nasalBefore);
  const head = first.slice(0, first.length - 1 - k);
  const tail = second.slice(1);
  const junction =
    compact.startsWith(head) && compact.endsWith(tail) && compact.length >= head.length + tail.length
      ? { left: first.slice(head.length), right: y, out: compact.slice(head.length, compact.length - tail.length) }
      : null;
  return { result, junction, alternatives, steps: main.steps, untouched: false };
}

/** Short names of the optional rules, for the notes on alternative forms. */
const OPTIONAL_NAME: Record<string, string> = {"6.1.76": "the t before ch", "8.3.4": "anusvāra instead of a nasal vowel", "8.3.27": "n before h + n", "8.3.28": "the k or ṭ augment", "8.3.29": "the dh augment", "8.3.30": "the dh augment", "8.3.31": "the t augment", "8.4.45": "the nasal", "8.4.48": "aspirating the k or ṭ", "8.4.59": "the nasal for anusvāra", "8.4.62": "h → voiced aspirate", "8.4.63": "ś → ch", "8.4.65": "dropping the like stop"};

/**
 * Which branch the main result takes. Varadarāja lists the form with the optional rule applied first
 * (etan murāriḥ, vāgghariḥ, tacchivaḥ, tvaṅkaroṣi, sañchambhuḥ); for ru he gives the nasalised vowel (8.3.2)
 * before the anusvāra (8.3.4).
 */
function defaultOf(sutra: string): boolean {
  return sutra !== "8.3.4";
}
