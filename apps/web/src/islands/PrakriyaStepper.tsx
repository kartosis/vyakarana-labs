/** @jsxImportSource preact */
/**
 * Declension table and derivation stepper, driven by vidyut-prakriyā (Ambuda, MIT) compiled to WebAssembly.
 * The WebAssembly is built in CI (scripts/build-vidyut.sh) and served from /vidyut/, with its licence notices.
 * Logic that can be tested without a browser lives in lib/prakriya.ts (apps/web/test/prakriya.test.ts).
 */
import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { detectScheme, fromSlp1, toSlp1, type Scheme } from "@vl/engine";
import {
  charName,
  chunks,
  clean,
  distinctForms,
  nyapApplies,
  nyapDefault,
  ruleView,
  shownSteps,
  stemProblem,
  type WebPrakriya,
} from "../lib/prakriya";

const BASE = "/vidyut/";

interface VidyutApi {
  deriveSubantas(args: unknown): WebPrakriya[];
}
type Engine = { state: "ready"; api: VidyutApi } | { state: "missing" } | { state: "failed" };

let loading: Promise<Engine> | null = null;
let attempt = 0;
/**
 * Load the WebAssembly once per page. "missing": this build does not include it (a local build); "failed": it
 * should be there but could not be loaded (network, server) — not cached, so Retry loads it again.
 */
function loadVidyut(): Promise<Engine> {
  if (loading) return loading;
  attempt += 1;
  const p = (async (): Promise<Engine> => {
    try {
      const version = await fetch(`${BASE}version.txt`, { cache: "no-cache" });
      if (version.status === 404) return { state: "missing" };
      if (!version.ok) return { state: "failed" };
      const v = `${(await version.text()).trim().slice(0, 12)}${attempt > 1 ? `-${attempt}` : ""}`;
      const mod = await import(/* @vite-ignore */ `${BASE}vidyut_prakriya.js?v=${v}`);
      await mod.default({ module_or_path: `${BASE}vidyut_prakriya_bg.wasm?v=${v}` });
      return { state: "ready", api: mod.Vidyut.init() as VidyutApi };
    } catch (e) {
      console.warn("[vidyut]", e);
      return { state: "failed" };
    }
  })();
  loading = p;
  void p.then((r) => {
    if (r.state === "failed") loading = null;
  });
  return p;
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
const SCHEMES: Array<{ value: Scheme | "auto"; label: string }> = [
  { value: "auto", label: "Detect automatically" },
  { value: "iast", label: "IAST" },
  { value: "hk", label: "Harvard-Kyoto" },
  { value: "slp1", label: "SLP1" },
  { value: "deva", label: "Devanagari" },
];
const schemeName = (s: Scheme) => SCHEMES.find((x) => x.value === s)!.label;
const iast = (slp: string) => fromSlp1(clean(slp), "iast");

function Sa({ s }: { s: string }) {
  const t = clean(s);
  return (
    <span class="sa">
      <span class="sa-deva" lang="sa">{fromSlp1(t, "deva")}</span>
      <span class="sa-iast" lang="sa-Latn">{fromSlp1(t, "iast")}</span>
    </span>
  );
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
  const [engine, setEngine] = useState<Engine | undefined>(undefined);
  const [stem, setStem] = useState(initialStem);
  const [query, setQuery] = useState(initialStem); // the stem, 150 ms after typing stops
  const [scheme, setScheme] = useState<Scheme | "auto">("auto");
  const [linga, setLinga] = useState<string>(initialLinga);
  /** null: the default for this stem (lib/prakriya nyapDefault); true / false: the learner's choice */
  const [nyapChoice, setNyapChoice] = useState<boolean | null>(null);
  const [cell, setCell] = useState<[number, number]>([0, 0]);
  const [focus, setFocus] = useState<[number, number]>([0, 0]);
  const [variant, setVariant] = useState(0);
  const [announce, setAnnounce] = useState("");
  const tableRef = useRef<HTMLTableElement>(null);

  const retry = () => {
    setEngine(undefined);
    loadVidyut().then(setEngine);
  };
  useEffect(retry, []);
  useEffect(() => {
    const t = setTimeout(() => setQuery(stem), 150);
    return () => clearTimeout(t);
  }, [stem]);

  const typed = query.trim().normalize("NFC");
  const from: Scheme = scheme === "auto" ? detectScheme(typed) : scheme;
  const slp = typed ? toSlp1(typed, from) : "";
  const problem = stemProblem(slp);
  const offered = linga === "Stri" && !problem && nyapApplies(slp);
  const nyap = offered && (nyapChoice ?? nyapDefault(slp));

  const table = useMemo(() => {
    if (engine?.state !== "ready" || problem) return null;
    try {
      return VIBHAKTIS.map((vi) =>
        VACANAS.map((va) =>
          distinctForms(
            engine.api.deriveSubantas({ pratipadika: nyap ? { nyap: slp } : { basic: slp }, linga, vibhakti: vi.id, vacana: va.id }) ?? [],
          ),
        ),
      );
    } catch (e) {
      console.warn("[vidyut]", e);
      return [];
    }
  }, [engine, slp, linga, nyap, problem]);
  const hasForms = !!table?.some((row) => row.some((c) => c.length));
  const has = (r: number, c: number) => !!table?.[r]?.[c]?.length;
  const firstWithForms = (): [number, number] => {
    for (let r = 0; r < VIBHAKTIS.length; r++) for (let c = 0; c < VACANAS.length; c++) if (has(r, c)) return [r, c];
    return [0, 0];
  };
  const tabCell = has(focus[0], focus[1]) ? focus : firstWithForms();

  const forms = table?.[cell[0]]?.[cell[1]] ?? [];
  const vi = Math.min(variant, Math.max(forms.length - 1, 0));
  const prakriya = forms[vi];
  const steps = prakriya ? shownSteps(prakriya.history) : [];

  const pick = (r: number, c: number) => {
    setCell([r, c]);
    setFocus([r, c]);
    setVariant(0);
    const f = table?.[r]?.[c] ?? [];
    if (f[0]) {
      const n = shownSteps(f[0].history).length;
      setAnnounce(`Derivation of ${iast(f[0].text)}, ${VIBHAKTIS[r]!.en} ${VACANAS[c]!.en}: ${n} steps, after the table.`);
    }
  };

  /** Arrow keys move between forms (one tab stop for the whole table); Enter or Space shows a derivation. */
  const onKey = (e: KeyboardEvent) => {
    const move: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    let [r, c] = tabCell;
    if (e.key in move) {
      const [dr, dc] = move[e.key]!;
      for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < VIBHAKTIS.length && cc >= 0 && cc < VACANAS.length; rr += dr, cc += dc) {
        if (has(rr, cc)) {
          [r, c] = [rr, cc];
          break;
        }
      }
    } else if (e.key === "Home" || e.key === "End") {
      const cols = [0, 1, 2].filter((cc) => has(r, cc));
      if (cols.length) c = e.key === "Home" ? cols[0]! : cols.at(-1)!;
    } else return;
    e.preventDefault();
    setFocus([r, c]);
    tableRef.current?.querySelector<HTMLButtonElement>(`button[data-r="${r}"][data-c="${c}"]`)?.focus();
  };

  const resetFor = () => {
    setNyapChoice(null);
    setCell([0, 0]);
    setFocus([0, 0]);
    setVariant(0);
    setAnnounce("");
  };

  // one status line, always present, whose text changes (review D5)
  const status =
    engine === undefined
      ? "Loading the derivation engine…"
      : engine.state === "missing"
        ? "The derivation engine (vidyut-prakriyā, compiled to WebAssembly) is not part of this build. It is built when the site is deployed."
        : engine.state === "failed"
          ? "The derivation engine could not be loaded. Check your connection and try again."
          : problem?.kind === "empty"
            ? "Type a stem to decline it."
            : problem?.kind === "space"
              ? "Type one stem, without spaces."
              : problem?.kind === "char"
                ? `The engine cannot read ${charName(problem.char)}. Type the stem with the letters of the Śivasūtras only.`
                : problem?.kind === "ending"
                  ? `Type the stem without its ending: ${iast(problem.bare)}, not ${iast(slp)}.`
                  : table && !hasForms
                    ? `No forms for ${iast(slp)} as a ${LINGAS.find((l) => l.id === linga)!.en} stem. Check the spelling, the script and the gender.`
                    : "";

  return (
    <section class="prakriya" aria-label="Declension and derivation">
      <div class="prakriya-in">
        <p class="prakriya-field">
          <label for={`${id}-stem`}>Stem (prātipadika)</label>
          <input
            id={`${id}-stem`}
            type="text"
            value={stem}
            spellcheck={false}
            autocapitalize="off"
            autocomplete="off"
            aria-describedby={`${id}-reading ${id}-hint`}
            onInput={(e) => {
              setStem((e.target as HTMLInputElement).value);
              resetFor();
            }}
          />
        </p>
        <p class="prakriya-field">
          <label for={`${id}-linga`}>Gender (liṅga)</label>
          <select
            id={`${id}-linga`}
            value={linga}
            onChange={(e) => {
              setLinga((e.target as HTMLSelectElement).value);
              resetFor();
            }}
          >
            {LINGAS.map((l) => <option value={l.id}>{l.en}, {l.name}</option>)}
          </select>
        </p>
        <p class="prakriya-field">
          <label for={`${id}-scheme`}>Typed in</label>
          <select id={`${id}-scheme`} value={scheme} onChange={(e) => { setScheme((e.target as HTMLSelectElement).value as Scheme | "auto"); resetFor(); }}>
            {SCHEMES.map((s) => <option value={s.value}>{s.label}</option>)}
          </select>
        </p>
        {offered && (
          <p class="prakriya-check">
            <input id={`${id}-nyap`} type="checkbox" checked={nyap} onChange={(e) => setNyapChoice((e.target as HTMLInputElement).checked)} />
            <label for={`${id}-nyap`}>
              The final <span lang="sa-Latn">{slp.endsWith("A") ? "ā" : "ī"}</span> is a feminine suffix, such as ṭāp (
              <span lang="sa-Latn">ramā</span>) or ṅīp, ṅīṣ (<span lang="sa-Latn">nadī, gaurī</span>). Ticked
              automatically, except for <span lang="sa-Latn">lakṣmī, śrī, dhī</span> and the like, whose ī belongs to the stem.
            </label>
          </p>
        )}
        <p class="prakriya-reading" id={`${id}-reading`}>
          {slp && !problem ? (
            <>
              Declining <Sa s={slp} /> <span class="prakriya-reading-scheme">(read as {schemeName(from)})</span>
            </>
          ) : null}
        </p>
        <p class="prakriya-hint" id={`${id}-hint`}>
          Type in Devanagari, IAST, Harvard-Kyoto or SLP1. If the reading above is not what you meant, choose the script
          you typed in. The stem is declined as given; choose the gender it takes.
        </p>
      </div>

      <p class="prakriya-status" role="status">{status}</p>
      {engine?.state === "failed" && (
        <p>
          <button type="button" class="btn" onClick={retry}>Try loading again</button>
        </p>
      )}
      <p class="visually-hidden" aria-live="polite">{announce}</p>

      {table && hasForms && (
        <>
          <div class="table-wrap">
            <table class="prakriya-table" ref={tableRef} onKeyDown={onKey}>
              <caption class="visually-hidden">
                Declension of {iast(slp)}, {LINGAS.find((l) => l.id === linga)?.en}. Move between forms with the arrow keys;
                Enter shows a form's derivation after the table.
              </caption>
              <thead>
                <tr>
                  <td></td>
                  {VACANAS.map((va, c) => (
                    <th scope="col" id={`${id}-c${c}`}>
                      {va.en}
                      <span class="prakriya-th-sa" lang="sa-Latn">{va.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {VIBHAKTIS.map((vib, r) => (
                  <tr>
                    <th scope="row" id={`${id}-r${r}`}>
                      {vib.en}
                      <span class="prakriya-th-sa" lang="sa-Latn">{vib.name}</span>
                    </th>
                    {VACANAS.map((va, c) => {
                      const texts = (table[r]?.[c] ?? []).map((p) => clean(p.text));
                      const on = cell[0] === r && cell[1] === c;
                      return (
                        <td>
                          {texts.length ? (
                            <button
                              type="button"
                              class="prakriya-cell"
                              data-r={r}
                              data-c={c}
                              tabIndex={tabCell[0] === r && tabCell[1] === c ? 0 : -1}
                              aria-pressed={on}
                              aria-describedby={`${id}-r${r} ${id}-c${c}`}
                              onClick={() => pick(r, c)}
                            >
                              {texts.map((f, i) => (
                                <>
                                  {i > 0 && <span class="prakriya-or"> / </span>}
                                  <Sa s={f} />
                                </>
                              ))}
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
                <span class="prakriya-steps-sub">
                  {" "}
                  {VIBHAKTIS[cell[0]]!.en} {VACANAS[cell[1]]!.en}, {steps.length} steps
                </span>
              </H>
              {forms.length > 1 && (
                <p class="prakriya-variants">
                  This cell has {forms.length} forms:{" "}
                  {forms.map((p, i) => (
                    <button type="button" class="prakriya-variant" aria-pressed={i === vi} onClick={() => setVariant(i)}>
                      <Sa s={p.text} />
                    </button>
                  ))}
                </p>
              )}
              <ol class="prakriya-steps" role="list">
                {steps.map((s) => {
                  const rule = ruleView(s.rule.source, s.rule.code, knownSet);
                  return (
                    <li>
                      {rule?.href ? (
                        <a class="prakriya-rule" href={rule.href} title={rule.title} rel={rule.external ? "external" : undefined}>
                          {rule.label}
                        </a>
                      ) : (
                        <span class="prakriya-rule prakriya-rule--other">{rule?.label}</span>
                      )}
                      <span class="prakriya-terms">
                        {chunks(s.result).map((t, i) => {
                          // a joined chunk (rāma + ḥ) may be only partly changed: IAST marks just that part; Devanagari
                          // cannot be split without breaking the cluster, so it gets a lighter mark on the whole
                          const changed = t.parts.filter((p) => p.wasChanged);
                          const partly = changed.length > 0 && changed.length < t.parts.length;
                          const cls = partly ? "prakriya-term is-partly-changed" : t.changed ? "prakriya-term is-changed" : "prakriya-term";
                          return (
                            <>
                              {i > 0 && <span class="prakriya-plus" aria-hidden="true"> + </span>}
                              <span class={cls}>
                                <span class="sa">
                                  <span class="sa-deva" lang="sa">{fromSlp1(t.text, "deva")}</span>
                                  <span class="sa-iast" lang="sa-Latn">
                                    {t.parts.map((p) => (
                                      <span class={partly && p.wasChanged ? "prakriya-part is-changed" : undefined}>{fromSlp1(p.text, "iast")}</span>
                                    ))}
                                  </span>
                                </span>
                                {t.changed && (
                                  <span class="visually-hidden">
                                    {partly ? ` (changed: ${changed.map((p) => fromSlp1(p.text, "iast")).join(", ")})` : " (changed)"}
                                  </span>
                                )}
                              </span>
                            </>
                          );
                        })}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p class="prakriya-hint">
                Underlined and highlighted parts changed at that step. Markers (it), such as the nasalised u of su, are shown
                until the rule that removes them. Derivation by{" "}
                <a href="https://github.com/ambuda-org/vidyut" rel="external">vidyut-prakriyā</a> (Ambuda, MIT licence;{" "}
                <a href="/vidyut/THIRD-PARTY.txt">licence notices</a>).
              </p>
            </section>
          )}
        </>
      )}
    </section>
  );
}
