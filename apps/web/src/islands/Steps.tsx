/** @jsxImportSource preact */
import { useState } from "preact/hooks";
import { transliterate } from "@vl/engine";

type Kind = "it" | "gone" | "new" | "mark";
export interface Step {
  /** sūtra applied at this step (a.p.s), omitted for the starting form */
  sutra?: string;
  /** short label for the step track when no sūtra applies */
  label?: string;
  /** form as SLP1 segments; kind styles a segment */
  parts: Array<[string, Kind?]>;
  note: string;
}

const deva = (s: string) => transliterate(s, "slp1", "deva");
const iast = (s: string) => transliterate(s, "slp1", "iast");

const SLP1_CONS = "kKgGNcCjJYwWqQRtTdDnpPbBmyrlvSzshL";
/**
 * Devanagari can only be split into styled spans at akṣara boundaries: if any segment but the last
 * ends in a consonant, the following segment would join it in a conjunct, and a segment that starts
 * with anusvāra, visarga or candrabindu would stand alone as a combining sign, so render it whole.
 */
const SLP1_SIGNS = "MH~";
const splittable = (parts: Step["parts"]) =>
  parts.slice(0, -1).every(([t]) => !SLP1_CONS.includes(t.at(-1) ?? "")) &&
  parts.slice(1).every(([t]) => !SLP1_SIGNS.includes(t[0] ?? ""));

function Form({ parts }: { parts: Step["parts"] }) {
  const whole = parts.map(([t]) => t).join("");
  return (
    <span class="steps-form sa-block">
      <span class="sa-deva" lang="sa">
        {splittable(parts)
          ? parts.map(([t, k]) => <span class={k ? `seg seg--${k}` : "seg"}>{deva(t)}</span>)
          : deva(whole)}
      </span>
      <span class="sa-iast" lang="sa-Latn">
        {parts.map(([t, k]) => <span class={k ? `seg seg--${k}` : "seg"}>{iast(t)}</span>)}
      </span>
    </span>
  );
}

export default function Steps({ steps, label }: { steps: Step[]; label: string }) {
  const [i, setI] = useState(0);
  const step = steps[i]!;
  return (
    <section class="steps" aria-label={label}>
      <ol class="steps-track" aria-label="Steps">
        {steps.map((s, k) => (
          <li>
            <button type="button" aria-current={k === i ? "step" : undefined} onClick={() => setI(k)}>
              {s.sutra ?? s.label ?? (k === 0 ? "start" : k === steps.length - 1 ? "result" : `step ${k + 1}`)}
            </button>
          </li>
        ))}
      </ol>
      <div class="steps-stage" aria-live="polite">
        <Form parts={step.parts} />
        <p class="steps-note">
          {step.sutra && (
            <>
              <a class="steps-sutra" href={`/sutra/${step.sutra}/`}>{step.sutra}</a>{" "}
            </>
          )}
          {step.note}
        </p>
      </div>
      <div class="steps-nav">
        <button type="button" class="btn btn--quiet" disabled={i === 0} onClick={() => setI(i - 1)}>Previous step</button>
        <span class="steps-count">{i + 1} of {steps.length}</span>
        <button type="button" class="btn" disabled={i === steps.length - 1} onClick={() => setI(i + 1)}>Next step</button>
      </div>
    </section>
  );
}
