/** @jsxImportSource preact */
/**
 * Declension table and derivation stepper, driven by vidyut-prakriya (Ambuda, MIT) compiled to WebAssembly.
 * The WebAssembly is built in CI (scripts/build-vidyut.sh) and served from /vidyut/; when it is missing (a local
 * build without it) the island says so instead of failing.
 */
import { useEffect, useId, useMemo, useState } from "preact/hooks";
import { detectScheme, fromSlp1, toSlp1 } from "@vl/engine";
import { pramanaLink } from "../lib/pramana";

const BASE = "/vidyut/";

interface WebTerm { text: string; wasChanged: boolean }
interface WebStep { rule: { source: string; code: string }; result: WebTerm[] }
interface WebPrakriya { text: string; history: WebStep[] }
interface VidyutApi { deriveSubantas(args: unknown): WebPrakriya[] }

let loading: Promise<VidyutApi | null> | null = null;
/** Load the WebAssembly once per page; null when this build does not include it. */
function loadVidyut(): Promise<VidyutApi | null> {
  loading ??= (async () => {
    try {
      const version = await fetch(`${BASE}version.txt`);
      if (!version.ok) return null;
      const v = (await version.text()).trim().slice(0, 12);
      const mod = await import(/* @vite-ignore */ `${BASE}vidyut_prakriya.js?v=${v}`);
      await mod.default({ module_or_path: `${BASE}vidyut_prakriya_bg.wasm?v=${v}` });
      return mod.Vidyut.init() as VidyutApi;
    } catch (e) {
      console.error("[vidyut]", e);
      return null;
    }
  })();
  return loading;
}

const LINGAS = [
  { id: "Pum", name: "puṃliṅga", en: "masculine" },
  { id: "Stri", name: "strīliṅga", en: "feminine" },
  { id: "Napumsaka", name: "napuṃsakaliṅga", en: "neuter" },
] as const;
const VIBHAKTIS = [
  { id: "Prathama", name: "prathamā", en: "nominative" },
  { id: "Dvitiya", name: "dvitīyā", en: "accusative" },
  { id: "Trtiya", name: "tṛtīyā", en: "instrumental" },
  { id: "Caturthi", name: "caturthī", en: "dative" },
  { id: "Panchami", name: "pañcamī", en: "ablative" },
  { id: "Sasthi", name: "ṣaṣṭhī", en: "genitive" },
  { id: "Saptami", name: "saptamī", en: "locative" },
  { id: "Sambodhana", name: "sambodhana", en: "vocative" },
] as const;
const VACANAS = [
  { id: "Eka", name: "ekavacana", en: "singular" },
  { id: "Dvi", name: "dvivacana", en: "dual" },
  { id: "Bahu", name: "bahuvacana", en: "plural" },
] as const;

/** vidyut writes accents (\ ^) and keeps markers; accents are not taught yet, so drop them for display. */
const clean = (s: string) => s.replace(/[\\^]/g, "");

/**
 * A term that is only a sign (visarga, anusvāra, candrabindu) cannot stand alone in Devanagari; join it to the
 * term before it, so the step reads rāmaḥ rather than rāma + ◌ḥ.
 */
function chunks(terms: WebTerm[]): WebTerm[] {
  const out: WebTerm[] = [];
  for (const t of terms) {
    const text = clean(t.text);
    if (!text) continue;
    const prev = out.at(-1);
    if (prev && /^[MH~]/.test(text)) out[out.length - 1] = { text: prev.text + text, wasChanged: prev.wasChanged || t.wasChanged };
    else out.push({ text, wasChanged: t.wasChanged });
  }
  return out;
}

function Sa({ s, block = false }: { s: string; block?: boolean }) {
  const t = clean(s);
  return (
    <span class={block ? "sa-block" : "sa"}>
      <span class="sa-deva" lang="sa">{fromSlp1(t, "deva")}</span>
      <span class="sa-iast" lang="sa-Latn">{fromSlp1(t, "iast")}</span>
    </span>
  );
}

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

function RuleRef({ source, code, known }: { source: string; code: string; known: Set<string> }) {
  if (source === "ashtadhyayi" && /^\d+\.\d+\.\d+$/.test(code)) {
    if (known.has(code)) return <a class="prakriya-rule" href={`/sutra/${code}/`}>{code}</a>;
    const p = pramanaLink(code);
    return <a class="prakriya-rule" href={p.href} title={p.label} rel="external">{code}</a>;
  }
  return <span class="prakriya-rule prakriya-rule--other">{SOURCE_NAME[source] ?? source} {code}</span>;
}

interface Props {
  /** sūtras that have a page on this site; others link to Pramāṇa */
  known: string[];
  initialStem?: string;
  initialLinga?: "Pum" | "Stri" | "Napumsaka";
  level?: 2 | 3;
}

export default function PrakriyaStepper({ known, initialStem = "rāma", initialLinga = "Pum", level = 2 }: Props) {
  const id = useId();
  const H = `h${level}` as "h2" | "h3";
  const knownSet = useMemo(() => new Set(known), [known]);
  const [api, setApi] = useState<VidyutApi | null | undefined>(undefined);
  const [stem, setStem] = useState(initialStem);
  const [linga, setLinga] = useState<string>(initialLinga);
  /** null: decide from the stem (feminine ā / ī usually carry ṭāp, ṅīp or ṅīṣ); true / false: the learner's choice */
  const [nyapChoice, setNyapChoice] = useState<boolean | null>(null);
  const [cell, setCell] = useState<[number, number]>([0, 0]);
  const [variant, setVariant] = useState(0);

  useEffect(() => {
    loadVidyut().then(setApi);
  }, []);

  const slp = useMemo(() => {
    const t = stem.trim().normalize("NFC");
    return t ? toSlp1(t, detectScheme(t)) : "";
  }, [stem]);

  // A feminine stem in ā or ī usually ends in a feminine suffix (ṭāp: ramā; ṅīp / ṅīṣ: nadī, gaurī), which changes
  // its declension (nominative gaurī, not *gaurīḥ). lakṣmī and śrī do not, so the learner can switch it off.
  const nyapAuto = linga === "Stri" && /[AI]$/.test(slp);
  const nyap = linga === "Stri" && (nyapChoice ?? nyapAuto);
  const table = useMemo(() => {
    if (!api || !slp || !/^[a-zA-Z~']+$/.test(slp)) return null;
    try {
      return VIBHAKTIS.map((vi) =>
        VACANAS.map((va) => api.deriveSubantas({ pratipadika: nyap ? { nyap: slp } : { basic: slp }, linga, vibhakti: vi.id, vacana: va.id }) ?? []),
      );
    } catch (e) {
      console.error("[vidyut]", e);
      return null;
    }
  }, [api, slp, linga, nyap]);

  const selected = table?.[cell[0]]?.[cell[1]] ?? [];
  const prakriya = selected[Math.min(variant, selected.length - 1)];
  const pick = (r: number, c: number) => {
    setCell([r, c]);
    setVariant(0);
  };

  return (
    <section class="prakriya" aria-label="Declension and derivation">
      <div class="prakriya-in">
        <p class="prakriya-field">
          <label for={`${id}-stem`}>Stem (prātipadika)</label>
          <input id={`${id}-stem`} type="text" value={stem} spellcheck={false} autocapitalize="off" autocomplete="off"
            onInput={(e) => { setStem((e.target as HTMLInputElement).value); setNyapChoice(null); }} />
        </p>
        <p class="prakriya-field">
          <label for={`${id}-linga`}>Gender (liṅga)</label>
          <select id={`${id}-linga`} value={linga} onChange={(e) => { setLinga((e.target as HTMLSelectElement).value); setNyapChoice(null); }}>
            {LINGAS.map((l) => <option value={l.id}>{l.en}, {l.name}</option>)}
          </select>
        </p>
        {linga === "Stri" && (
          <p class="prakriya-check">
            <input id={`${id}-nyap`} type="checkbox" checked={nyap} onChange={(e) => setNyapChoice((e.target as HTMLInputElement).checked)} />
            <label for={`${id}-nyap`}>The stem ends in a feminine suffix, ā (ṭāp) or ī (ṅīp, ṅīṣ), as ramā, nadī, gaurī. Not lakṣmī or śrī.</label>
          </p>
        )}
        <p class="prakriya-hint">Type in Devanagari, IAST, Harvard-Kyoto or SLP1. The stem is declined as given; choose the gender it takes.</p>
      </div>

      {api === undefined ? (
        <p class="prakriya-status" role="status">Loading the derivation engine…</p>
      ) : api === null ? (
        <p class="prakriya-status" role="status">
          The derivation engine (vidyut-prakriyā, compiled to WebAssembly) is not part of this build. It is built
          when the site is deployed.
        </p>
      ) : !table ? (
        <p class="prakriya-status" role="status">Type a stem to decline it.</p>
      ) : (
        <>
          <div class="table-wrap">
            <table class="prakriya-table">
              <caption class="visually-hidden">Declension of {stem}, {LINGAS.find((l) => l.id === linga)?.en}. Choose a form to see its derivation.</caption>
              <thead>
                <tr>
                  <td></td>
                  {VACANAS.map((va) => <th scope="col">{va.en}<span class="prakriya-th-sa">{va.name}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {VIBHAKTIS.map((vi, r) => (
                  <tr>
                    <th scope="row">{vi.en}<span class="prakriya-th-sa">{vi.name}</span></th>
                    {VACANAS.map((va, c) => {
                      const forms = [...new Set((table[r]?.[c] ?? []).map((p) => clean(p.text)))];
                      const on = cell[0] === r && cell[1] === c;
                      return (
                        <td>
                          {forms.length ? (
                            <button type="button" class="prakriya-cell" aria-pressed={on}
                              aria-label={`${vi.en} ${va.en}: ${forms.map((f) => fromSlp1(f, "iast")).join(" or ")}. Show the derivation.`}
                              onClick={() => pick(r, c)}>
                              {forms.map((f, i) => <>{i > 0 && <span class="prakriya-or"> / </span>}<Sa s={f} /></>)}
                            </button>
                          ) : (
                            <span class="prakriya-none">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {prakriya && (
            <section class="prakriya-steps-wrap" aria-labelledby={`${id}-steps`}>
              <H id={`${id}-steps`}>
                Derivation of <Sa s={prakriya.text} />
                <span class="prakriya-steps-sub"> {VIBHAKTIS[cell[0]]!.en} {VACANAS[cell[1]]!.en}, {prakriya.history.length} steps</span>
              </H>
              {selected.length > 1 && (
                <p class="prakriya-variants">
                  This cell has {selected.length} correct forms:{" "}
                  {selected.map((p, i) => (
                    <button type="button" class="prakriya-variant" aria-pressed={i === variant} onClick={() => setVariant(i)}>
                      <Sa s={p.text} />
                    </button>
                  ))}
                </p>
              )}
              <ol class="prakriya-steps">
                {prakriya.history.map((s) => (
                  <li>
                    <RuleRef source={s.rule.source} code={s.rule.code} known={knownSet} />
                    <span class="prakriya-terms">
                      {chunks(s.result).map((t, i) => (
                        <>
                          {i > 0 && <span class="prakriya-plus" aria-hidden="true"> + </span>}
                          <span class={t.wasChanged ? "prakriya-term is-changed" : "prakriya-term"}><Sa s={t.text} /></span>
                        </>
                      ))}
                    </span>
                  </li>
                ))}
              </ol>
              <p class="prakriya-hint">
                Highlighted parts changed at that step. Markers (it), such as the nasalised u of su, are shown until the
                rule that removes them. Derivation by <a href="https://github.com/ambuda-org/vidyut" rel="external">vidyut-prakriyā</a> (Ambuda, MIT licence).
              </p>
            </section>
          )}
        </>
      )}
    </section>
  );
}
