/** @jsxImportSource preact */
import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { normalizeAnswer, detectScheme, transliterate } from "@vl/engine";
import { getConfig } from "../lib/config";
import { maybeSignedIn } from "../lib/auth";
import { ApiError, tz } from "../lib/api";
import { enqueue, flush, send, type Entry } from "../lib/outbox";
import { Rich } from "./rich";

type Choice = { id: string; type: "choice"; prompt: string; options: string[]; answer: number; explain?: string };
type Text = { id: string; type: "text"; prompt: string; answers: string[]; explain?: string };
type Item = Choice | Text;
type Attempt = { itemId: string; correct: boolean; ms: number };
interface Result {
  score: number;
  best: number;
  firstCompletion: boolean;
  cardsAdded: number;
  streak: { current: number; longest: number };
  points: number;
}

const PASS = 60; // percent needed to complete a lesson

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Typed answers are compared as phonemes (SLP1), so Devanagari, IAST and Harvard-Kyoto all count. */
const matches = (given: string, answers: string[]) => {
  // spaces and the avagraha are optional in writing: śivo 'rcyaḥ = śivo rcyaḥ = śivorcyaḥ
  const g = normalizeAnswer(given).replace(/[\s']+/g, "");
  return answers.some((a) => normalizeAnswer(a, "iast").replace(/[\s']+/g, "") === g);
};

export default function PracticeSession({ lessonId, items, cards }: { lessonId: string; items: Item[]; cards: string[] }) {
  const uid = useId();
  const [gate, setGate] = useState<"loading" | "closed" | "guest" | "open">("loading");
  const [phase, setPhase] = useState<"intro" | "ask" | "feedback" | "saving" | "done" | "error">("intro");
  const [order, setOrder] = useState<Array<{ item: Item; options?: Array<{ text: string; correct: boolean }> }>>([]);
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef<Entry | null>(null); // this round's save: retried with the same request id
  const started = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    getConfig().then((c) => {
      const open = c.accounts && maybeSignedIn();
      setGate(!c.accounts ? "closed" : open ? "open" : "guest");
      if (open) void flush(); // a save cut off by a reload or lost connection goes now, with its request id
    });
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [i, phase]);

  const current = order[i];
  const correctCount = attempts.filter((a) => a.correct).length;
  const pct = attempts.length ? Math.round((100 * correctCount) / attempts.length) : 0;

  function start() {
    setOrder(
      shuffle(items).map((item) =>
        item.type === "choice"
          ? { item, options: shuffle(item.options.map((text, k) => ({ text, correct: k === item.answer }))) }
          : { item },
      ),
    );
    setI(0);
    setAttempts([]);
    setResult(null);
    saving.current = null;
    setPhase("ask");
    started.current = performance.now();
  }

  function answer(correct: boolean) {
    const ms = Math.round(performance.now() - started.current);
    setAttempts((a) => [...a, { itemId: current!.item.id, correct, ms }]);
    setLastCorrect(correct);
    setPhase("feedback");
  }

  async function next() {
    if (i + 1 < order.length) {
      setI(i + 1);
      setTyped("");
      setPicked(null);
      setPhase("ask");
      started.current = performance.now();
      return;
    }
    setPhase("saving");
    const completed = pct >= PASS;
    saving.current ??= enqueue("/api/v1/sessions", {
      lessonId,
      attempts,
      completed,
      newCards: completed ? cards : [],
      tz: tz(),
    });
    try {
      const r = await send<Result>(saving.current);
      setResult(r);
      setPhase("done");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Your answers could not be saved. Check your connection and try again.");
      setPhase("error");
    }
  }

  const here = typeof location !== "undefined" ? location.pathname : "/";

  if (gate === "loading") return <p class="practice-note">Loading practice…</p>;
  if (gate === "closed")
    return <p class="practice-note">Practice opens when accounts launch. It will be saved to your account so reviews can be scheduled for you.</p>;
  if (gate === "guest")
    return (
      <p class="practice-gate">
        Practice is saved to your account so that reviews can be scheduled for you.
        <a class="btn" href={`/signin/?next=${encodeURIComponent(here + "#practice-h")}`}>Sign in to practise</a>
      </p>
    );

  if (phase === "intro")
    return (
      <div class="practice-start">
        <p>{items.length} questions. Score {PASS}% or more to complete the lesson and add {cards.length} cards to your reviews.</p>
        <button class="btn" type="button" onClick={start}>Start practice</button>
      </div>
    );

  if (phase === "ask" || phase === "feedback") {
    const it = current!.item;
    const done = phase === "feedback";
    return (
      <div class="practice-q" aria-live="polite">
        <p class="practice-progress">
          Question {i + 1} of {order.length}
          <progress max={order.length} value={i + (done ? 1 : 0)} aria-hidden="true" />
        </p>
        <h3 ref={heading} tabIndex={-1} class="practice-prompt"><Rich text={it.prompt} /></h3>
        {it.type === "choice" ? (
          <ul class="practice-options" role="list">
            {current!.options!.map((o, k) => (
              <li>
                <button
                  type="button"
                  class={[
                    "practice-option",
                    done && o.correct ? "is-correct" : "",
                    done && picked === k && !o.correct ? "is-wrong" : "",
                  ].join(" ")}
                  aria-pressed={picked === k}
                  disabled={done}
                  onClick={() => {
                    setPicked(k);
                    answer(o.correct);
                  }}
                >
                  <Rich text={o.text} />
                  {done && o.correct && <span class="practice-mark"> ✓ correct answer</span>}
                  {done && picked === k && !o.correct && <span class="practice-mark"> ✕ your answer</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <form
            class="practice-text"
            onSubmit={(e) => {
              e.preventDefault();
              if (!done && typed.trim()) answer(matches(typed, (it as Text).answers));
            }}
          >
            <label for={`${uid}-a`}>Your answer (Devanagari, IAST or Harvard-Kyoto)</label>
            <input
              id={`${uid}-a`}
              type="text"
              autocomplete="off"
              autocapitalize="off"
              spellcheck={false}
              value={typed}
              disabled={done}
              onInput={(e) => setTyped((e.target as HTMLInputElement).value)}
            />
            {typed && (
              <p class="practice-preview" aria-live="off">
                Reads as <span lang="sa">{transliterate(typed, detectScheme(typed), "deva")}</span>
              </p>
            )}
            {!done && <button class="btn" type="submit">Check</button>}
          </form>
        )}
        {done && (
          <div class={`practice-feedback ${lastCorrect ? "is-correct" : "is-wrong"}`} role="status">
            <p>
              <strong>{lastCorrect ? "Correct." : "Not quite."}</strong>{" "}
              {it.type === "text" && !lastCorrect && (
                <>The answer is <Rich text={`‹${(it as Text).answers[0]}›`} />. </>
              )}
              {it.explain && <Rich text={it.explain} />}
            </p>
            <button class="btn" type="button" onClick={next}>
              {i + 1 < order.length ? "Next question" : "Finish"}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (phase === "saving") return <p class="practice-note" role="status">Saving your answers…</p>;
  if (phase === "error")
    return (
      <div class="practice-feedback is-wrong" role="alert">
        <p>{error}</p>
        <button class="btn" type="button" onClick={() => next()}>Try saving again</button>
      </div>
    );

  return (
    <div class="practice-summary" role="status">
      <h3 ref={heading} tabIndex={-1}>
        {result!.score}% this time{result!.best > result!.score ? `, best ${result!.best}%` : ""}
      </h3>
      <ul>
        <li>{result!.firstCompletion ? "Lesson completed." : pct >= PASS ? "Completed again." : `Score ${PASS}% to complete the lesson.`}</li>
        {result!.cardsAdded > 0 && <li>{result!.cardsAdded} cards added to your reviews.</li>}
        <li>Streak: {result!.streak.current} day{result!.streak.current === 1 ? "" : "s"} (longest {result!.streak.longest}).</li>
        <li>{result!.points} points toward this week's leaderboard.</li>
      </ul>
      <p class="practice-actions">
        <button class="btn btn--quiet" type="button" onClick={start}>Practise again</button>
        <a class="btn" href="/review/">Go to reviews</a>
      </p>
    </div>
  );
}
