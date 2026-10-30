/** @jsxImportSource preact */
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { consonantSandhi, detectScheme, fromSlp1, isVowel, sandhiChecks, toSlp1, vowelSandhi, type CheckStatus } from "@vl/engine";

interface Example {
  a: string;
  b: string;
  pragrhya?: boolean;
  /** what the example shows */
  shows: string;
}

/** Each example makes a different rule win; all are textbook examples (LSK or Kāśikā). */
const EXAMPLES: Example[] = [
  { a: "dadhi", b: "atra", shows: "yaṇ" },
  { a: "hare", b: "iha", shows: "ay, av" },
  { a: "upa", b: "indraḥ", shows: "guṇa" },
  { a: "kṛṣṇa", b: "ṛddhiḥ", shows: "guṇa + r" },
  { a: "gaṅgā", b: "oghaḥ", shows: "vṛddhi" },
  { a: "daitya", b: "ariḥ", shows: "lengthening" },
  { a: "hare", b: "ava", shows: "avagraha" },
  { a: "śivāya", b: "om", shows: "om" },
  { a: "brahma", b: "ṛṣiḥ", shows: "two forms" },
  { a: "harī", b: "etau", pragrhya: true, shows: "no sandhi" },
];

/** Consonant junctions, from Varadarāja's Hal-sandhi examples. */
const HAL_EXAMPLES: Example[] = [
  { a: "sat", b: "cit", shows: "ścutva" },
  { a: "tat", b: "ṭīkā", shows: "ṣṭutva" },
  { a: "vāk", b: "īśaḥ", shows: "jaśtva" },
  { a: "etad", b: "murāriḥ", shows: "nasal" },
  { a: "tad", b: "śivaḥ", shows: "ś → ch" },
  { a: "vāk", b: "hariḥ", shows: "h" },
  { a: "san", b: "śambhuḥ", shows: "four forms" },
  { a: "śiva", b: "chāyā", shows: "tuk" },
];

const STATUS_TEXT: Record<CheckStatus, string> = {
  applies: "applies",
  "set-aside": "set aside",
  no: "does not apply",
};

/** a-final upasargas (1.4.59): before a root, 6.1.89, 6.1.91 and 6.1.94 take over. */
const A_UPASARGA = new Set(["pra", "parA", "apa", "ava", "upa"]);

const slp = (text: string) => {
  const t = text.trim().normalize("NFC");
  return t ? toSlp1(t, detectScheme(t)) : "";
};

/** Sanskrit in both scripts; the site-wide script switch decides which one shows. */
function Sa({ s, block = false }: { s: string; block?: boolean }) {
  return (
    <span class={block ? "sa-block" : "sa"}>
      <span class="sa-deva" lang="sa">{fromSlp1(s, "deva")}</span>
      <span class="sa-iast" lang="sa-Latn">{fromSlp1(s, "iast")}</span>
    </span>
  );
}

function SutraLink({ id }: { id: string }) {
  return <a class="sandhi-sutra" href={`/sutra/${id}/`}>{id}</a>;
}

interface Props {
  level?: 2 | 3;
  /** keep the words in the address bar so a result can be shared (tool page only) */
  syncUrl?: boolean;
  initialA?: string;
  initialB?: string;
  initialPragrhya?: boolean;
  initialCompound?: boolean;
  /** hide the example buttons (lessons supply their own context) */
  showExamples?: boolean;
  /** which example set to offer: vowel junctions, consonant junctions, or both */
  exampleSet?: "vowel" | "consonant" | "both";
  initialSuffix?: boolean;
}

export default function SandhiPad({
  level = 2,
  syncUrl = false,
  initialA = "upa",
  initialB = "indraḥ",
  initialPragrhya = false,
  initialCompound = false,
  showExamples = true,
  exampleSet = "both",
  initialSuffix = false,
}: Props) {
  const id = useId();
  const H = `h${level}` as "h2" | "h3";
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  const [padanta, setPadanta] = useState(true);
  const [compound, setCompound] = useState(initialCompound);
  const [pragrhya, setPragrhya] = useState(initialPragrhya);
  const [suffix, setSuffix] = useState(initialSuffix);

  // Shareable state on the tool page: ?a=…&b=…&pragrhya=1&padanta=0&compound=1 (written only after the first change).
  const ready = useRef(false);
  useEffect(() => {
    if (!syncUrl) return;
    const q = new URLSearchParams(location.search);
    if (q.has("a")) setA(q.get("a") ?? "");
    if (q.has("b")) setB(q.get("b") ?? "");
    if (q.get("pragrhya") === "1") setPragrhya(true);
    if (q.get("padanta") === "0") setPadanta(false);
    if (q.get("compound") === "1") setCompound(true);
    if (q.get("suffix") === "1") setSuffix(true);
  }, []);
  useEffect(() => {
    if (!syncUrl) return;
    if (!ready.current) {
      ready.current = true;
      return;
    }
    const q = new URLSearchParams({ a, b });
    if (pragrhya) q.set("pragrhya", "1");
    if (!padanta) q.set("padanta", "0");
    if (compound) q.set("compound", "1");
    if (suffix) q.set("suffix", "1");
    history.replaceState(null, "", `${location.pathname}?${q}`);
  }, [a, b, padanta, compound, pragrhya, suffix]);

  const first = slp(a);
  const second = slp(b);
  const last = first.at(-1) ?? "";
  const opts = { padanta, compound, pragrhya };
  // two vowels meet: Ac-sandhi; otherwise the consonant rules of the Hal-sandhi-prakaraṇa
  const vowelMode = isVowel(last) && isVowel(second[0] ?? "");
  const res = !first || !second ? null : vowelMode ? vowelSandhi(first, second, opts) : consonantSandhi(first, second, { suffix });
  const checks = first && second && vowelMode ? sandhiChecks(first, second, opts) : [];
  const halNote = res && !vowelMode && "note" in res ? (res as { note?: string }).note : undefined;
  const upasargaNote = vowelMode && res && !res.untouched && !pragrhya && A_UPASARGA.has(first);
  const goNote = vowelMode && res && !res.untouched && !pragrhya && first === "go" && padanta;

  const pick = (e: Example) => {
    setA(e.a);
    setB(e.b);
    setPragrhya(!!e.pragrhya);
    setPadanta(true);
    setCompound(false);
    setSuffix(false);
  };
  const examples = exampleSet === "vowel" ? EXAMPLES : exampleSet === "consonant" ? HAL_EXAMPLES : [...EXAMPLES, ...HAL_EXAMPLES];

  return (
    <section class="sandhi" aria-label="Sandhi tool">
      <div class="sandhi-in">
        <div class="sandhi-words">
          <div class="sandhi-word">
            <label for={`${id}-a`}>First word</label>
            <input id={`${id}-a`} type="text" value={a} spellcheck={false} autocapitalize="off" autocomplete="off"
              onInput={(e) => setA((e.target as HTMLInputElement).value)} />
          </div>
          <span class="sandhi-plus" aria-hidden="true">+</span>
          <div class="sandhi-word">
            <label for={`${id}-b`}>Second word</label>
            <input id={`${id}-b`} type="text" value={b} spellcheck={false} autocapitalize="off" autocomplete="off"
              onInput={(e) => setB((e.target as HTMLInputElement).value)} />
          </div>
        </div>
        <fieldset class="sandhi-opts">
          <legend class="visually-hidden">About the two words</legend>
          {!vowelMode && first && second ? (
            <p>
              <input id={`${id}-sfx`} type="checkbox" checked={suffix} onChange={(e) => setSuffix((e.target as HTMLInputElement).checked)} />
              <label for={`${id}-sfx`}>The second item is a suffix (pratyaya), as maya in vāṅmaya</label>
            </p>
          ) : (
          <>
          <p>
            <input id={`${id}-pad`} type="checkbox" checked={padanta} onChange={(e) => setPadanta((e.target as HTMLInputElement).checked)} />
            <label for={`${id}-pad`}>The first word is a finished word (padānta), not a stem meeting a suffix</label>
          </p>
          <p>
            <input id={`${id}-cmp`} type="checkbox" checked={compound} disabled={!padanta}
              onChange={(e) => setCompound((e.target as HTMLInputElement).checked)} />
            <label for={`${id}-cmp`}>The two words form a compound (samāsa)</label>
          </p>
          <p>
            <input id={`${id}-pr`} type="checkbox" checked={pragrhya} onChange={(e) => setPragrhya((e.target as HTMLInputElement).checked)} />
            <label for={`${id}-pr`}>
              The first word is pragṛhya: a dual in ī, ū or e (<a href="/sutra/1.1.11/">1.1.11</a>) or a particle such as
              aho (<a href="/sutra/1.1.15/">1.1.15</a>)
            </label>
          </p>
          </>
          )}
        </fieldset>
        <p class="sandhi-hint">Type in Devanagari, IAST, Harvard-Kyoto or SLP1.</p>
      </div>

      {showExamples && (
        <div class="sandhi-examples">
          <p id={`${id}-ex`}>Textbook examples</p>
          <ul class="sandhi-example-list" aria-labelledby={`${id}-ex`}>
            {examples.map((e) => (
              <li>
                <button type="button" class="sandhi-example" onClick={() => pick(e)}
                  aria-pressed={a === e.a && b === e.b && pragrhya === !!e.pragrhya}>
                  <span lang="sa-Latn">{e.a} + {e.b}</span>
                  <span class="sandhi-example-shows">{e.shows}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div class="sandhi-out" aria-live="polite">
        {!res ? (
          <p class="sandhi-empty">Type two words to see what happens where they meet.</p>
        ) : res.untouched ? (
          <>
            <p class="sandhi-result"><Sa s={res.result} block /></p>
            <p class="sandhi-empty">
              The sounds at the junction are <Sa s={last} /> and <Sa s={second[0] ?? ""} />. {halNote ?? "No sandhi rule applies."}
            </p>
          </>
        ) : (
          <>
            {res.junction && (
              <p class="sandhi-junction">
                <Sa s={res.junction.left} /> <span aria-hidden="true">+</span><span class="visually-hidden">plus</span>{" "}
                <Sa s={res.junction.right} /> <span aria-hidden="true">→</span><span class="visually-hidden">becomes</span>{" "}
                <Sa s={res.junction.out} />
              </p>
            )}
            <p class="sandhi-result"><Sa s={res.result} block /></p>
            {res.alternatives.length > 0 && (
              <div class="sandhi-alts">
                <p class="sandhi-alts-h">Also correct</p>
                <ul>
                  {res.alternatives.map((alt) => (
                    <li>
                      <span class="sandhi-alt-form"><Sa s={alt.form} /></span>
                      <span class="sandhi-alt-why">
                        <SutraLink id={alt.sutra} />
                        {alt.varttika && <span class="sandhi-vt"> vārttika</span>} {alt.note}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {(upasargaNote || goNote) && (
        <p class="sandhi-caution" role="note">
          {upasargaNote && (
            <>
              If <Sa s={first} /> is a prefix (upasarga, <SutraLink id="1.4.59" />) on a verb, three rules take over:{" "}
              <SutraLink id="6.1.91" /> before ṛ (pra + ṛcchati → prārcchati), <SutraLink id="6.1.94" /> before e or o
              (pra + ejate → prejate), and <SutraLink id="6.1.89" /> for forms of i "go" and edh "grow"
              (upa + eti → upaiti). The result above treats it as a separate word.
            </>
          )}
          {goNote && (
            <>
              The word go has rules of its own: <SutraLink id="6.1.122" />, <SutraLink id="6.1.123" /> and{" "}
              <SutraLink id="6.1.124" />. Before agram, for example, all of go 'gram, go agram and gavāgram are correct,
              and before indra only gavendraḥ.
            </>
          )}
        </p>
      )}

      {res && !res.untouched && (
        <div class="sandhi-explain">
          {vowelMode && (
          <section aria-labelledby={`${id}-checks`}>
            <H id={`${id}-checks`}>Which rule applies?</H>
            <p class="sandhi-hint">The rules are tested from the most specific down. The first that fits wins; a general rule that also fits is set aside.</p>
            <ol class="sandhi-checks">
              {checks.map((c) => (
                <li data-status={c.status}>
                  <SutraLink id={c.sutra} />
                  <span class="sandhi-check-name">{c.name}</span>
                  <span class="sandhi-status">{STATUS_TEXT[c.status]}</span>
                  <span class="sandhi-reason">{c.reason}</span>
                </li>
              ))}
            </ol>
          </section>
          )}
          <section aria-labelledby={`${id}-steps`}>
            <H id={`${id}-steps`}>Derivation</H>
            {!vowelMode && <p class="sandhi-hint">Consonant rules come from the last three pādas of the grammar (8.2–8.4), so they apply one after another in the order of their numbers (8.2.1).</p>}
            <ol class="sandhi-steps">
              <li>
                <span class="sandhi-step-label">start</span>
                <Sa s={`${first} ${second}`} block />
              </li>
              {res.steps.map((s) => (
                <li>
                  <SutraLink id={s.sutra} />
                  <Sa s={s.form} block />
                  <span class="sandhi-reason">{s.note}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </section>
  );
}
