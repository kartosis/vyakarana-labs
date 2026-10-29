/** @jsxImportSource preact */
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { detectScheme, fromSlp1, sandhiChecks, toSlp1, vowelSandhi, type CheckStatus } from "@vl/engine";

interface Example {
  a: string;
  b: string;
  pragrhya?: boolean;
  /** what the example shows */
  shows: string;
}

/** Each example is chosen to make one rule win. */
const EXAMPLES: Example[] = [
  { a: "dadhi", b: "atra", shows: "yaṇ" },
  { a: "deva", b: "indraḥ", shows: "guṇa" },
  { a: "sītā", b: "ṛcchati", shows: "guṇa + r" },
  { a: "sadā", b: "eva", shows: "vṛddhi" },
  { a: "daitya", b: "ariḥ", shows: "lengthening" },
  { a: "hare", b: "iha", shows: "ay, av" },
  { a: "te", b: "atra", shows: "avagraha" },
  { a: "harī", b: "etau", pragrhya: true, shows: "no sandhi" },
];

const STATUS_TEXT: Record<CheckStatus, string> = {
  applies: "applies",
  "set-aside": "set aside",
  no: "does not apply",
};

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

export default function SandhiPad({ level = 2, syncUrl = false }: { level?: 2 | 3; syncUrl?: boolean }) {
  const id = useId();
  const H = `h${level}` as "h2" | "h3";
  const [a, setA] = useState("deva");
  const [b, setB] = useState("indraḥ");
  const [padanta, setPadanta] = useState(true);
  const [pragrhya, setPragrhya] = useState(false);

  // Shareable state on the tool page: ?a=…&b=…&pragrhya=1&padanta=0 (written only after the first change).
  const ready = useRef(false);
  useEffect(() => {
    if (!syncUrl) return;
    const q = new URLSearchParams(location.search);
    if (q.has("a")) setA(q.get("a") ?? "");
    if (q.has("b")) setB(q.get("b") ?? "");
    if (q.get("pragrhya") === "1") setPragrhya(true);
    if (q.get("padanta") === "0") setPadanta(false);
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
    history.replaceState(null, "", `${location.pathname}?${q}`);
  }, [a, b, padanta, pragrhya]);

  const first = slp(a);
  const second = slp(b);
  const last = first.at(-1) ?? "";
  const canBePragrhya = "IUe".includes(last) && last !== "";
  const opts = { padanta, pragrhya: pragrhya && canBePragrhya };
  const res = first && second ? vowelSandhi(first, second, opts) : null;
  const checks = first && second ? sandhiChecks(first, second, opts) : [];

  const pick = (e: Example) => {
    setA(e.a);
    setB(e.b);
    setPragrhya(!!e.pragrhya);
    setPadanta(true);
  };

  return (
    <section class="sandhi" aria-label="Vowel sandhi playground">
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
        <div class="sandhi-opts">
          <p>
            <input id={`${id}-pad`} type="checkbox" checked={padanta} onChange={(e) => setPadanta((e.target as HTMLInputElement).checked)} />
            <label for={`${id}-pad`}>The first word is a complete word (padānta)</label>
          </p>
          <p>
            <input id={`${id}-pr`} type="checkbox" checked={pragrhya && canBePragrhya} disabled={!canBePragrhya}
              aria-describedby={canBePragrhya ? undefined : `${id}-pr-help`} onChange={(e) => setPragrhya((e.target as HTMLInputElement).checked)} />
            <label for={`${id}-pr`}>The first word is a dual form (pragṛhya, <a href="/sutra/1.1.11/">1.1.11</a>)</label>
            {!canBePragrhya && <span id={`${id}-pr-help`} class="sandhi-hint">Only duals ending in ī, ū or e count.</span>}
          </p>
        </div>
        <p class="sandhi-hint">Type in Devanagari, IAST, Harvard-Kyoto or SLP1. Clear the first box to start fresh.</p>
      </div>

      <div class="sandhi-examples">
        <p id={`${id}-ex`}>Examples</p>
        <ul aria-labelledby={`${id}-ex`}>
          {EXAMPLES.map((e) => (
            <li>
              <button type="button" class="sandhi-example" onClick={() => pick(e)}
                aria-pressed={a === e.a && b === e.b}>
                <span lang="sa-Latn">{e.a} + {e.b}</span>
                <span class="sandhi-example-shows">{e.shows}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div class="sandhi-out" aria-live="polite">
        {!res ? (
          <p class="sandhi-empty">Type two words to see what happens where they meet.</p>
        ) : res.untouched ? (
          <p class="sandhi-empty">
            The sounds at the junction are <Sa s={last} /> and <Sa s={second[0] ?? ""} />. At least one is a consonant (or
            visarga), so vowel sandhi has nothing to do. Consonant and visarga sandhi come in the next two modules.
          </p>
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
            {res.alternatives.map((alt) => (
              <p class="sandhi-alt">
                Also correct, by <a href="/sutra/8.3.19/">8.3.19</a>: <Sa s={alt} />
              </p>
            ))}
          </>
        )}
      </div>

      {res && !res.untouched && (
        <div class="sandhi-explain">
          <section aria-labelledby={`${id}-checks`}>
            <H id={`${id}-checks`}>Which rule applies?</H>
            <p class="sandhi-hint">The rules are tried from the most specific down. The first that fits wins.</p>
            <ol class="sandhi-checks">
              {checks.map((c) => (
                <li data-status={c.status}>
                  <a class="sandhi-sutra" href={`/sutra/${c.sutra}/`}>{c.sutra}</a>
                  <span class="sandhi-check-name">{c.name}</span>
                  <span class="sandhi-status">{STATUS_TEXT[c.status]}</span>
                  <span class="sandhi-reason">{c.reason}</span>
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby={`${id}-steps`}>
            <H id={`${id}-steps`}>Derivation</H>
            <ol class="sandhi-steps">
              <li>
                <span class="sandhi-step-label">start</span>
                <Sa s={`${first} ${second}`} block />
              </li>
              {res.steps.map((s) => (
                <li>
                  <a class="sandhi-sutra" href={`/sutra/${s.sutra}/`}>{s.sutra}</a>
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
