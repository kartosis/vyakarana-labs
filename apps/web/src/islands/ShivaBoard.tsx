/** @jsxImportSource preact */
import { useMemo, useState } from "preact/hooks";
import {
  SHIVA_SUTRAS,
  SLOTS,
  STANDARD_PRATYAHARAS,
  expandPratyahara,
  isConsonant,
  transliterate,
  type Slot,
} from "@vl/engine";

const deva = (slp: string) => transliterate(slp, "slp1", "deva");
const iast = (slp: string) => transliterate(slp, "slp1", "iast");
/** How a slot is recited: consonants with "a", markers bare (with virāma). */
const recited = (s: Slot) => (s.isIt ? s.sound : isConsonant(s.sound) ? `${s.sound}a` : s.sound);

function Sa({ slp, cls }: { slp: string; cls?: string }) {
  return (
    <span class={`sa ${cls ?? ""}`}>
      <span class="sa-deva" lang="sa">{deva(slp)}</span>
      <span class="sa-iast" lang="sa-Latn">{iast(slp)}</span>
    </span>
  );
}

interface Props {
  /** SLP1 first sound + it-marker to show on load, e.g. ["a","c"] */
  initial?: [string, string, number?];
  /** show the preset list */
  presets?: boolean;
  label?: string;
}

export default function ShivaBoard({ initial = ["a", "c"], presets = true, label = "The fourteen Śivasūtras" }: Props) {
  const firstIdx = (sound: string) => SLOTS.find((s) => !s.isIt && s.sound === sound)!.index;
  const itIdx = (first: number, it: string, sutra?: number) =>
    SLOTS.find((s) => s.isIt && s.sound === it && s.index > first && (sutra === undefined || s.sutra === sutra))!.index;

  const [start, setStart] = useState<number | null>(() => firstIdx(initial[0]));
  const [end, setEnd] = useState<number | null>(() => itIdx(firstIdx(initial[0]), initial[1], initial[2]));

  const result = useMemo(() => {
    if (start === null || end === null) return null;
    const s = SLOTS[start]!;
    const e = SLOTS[end]!;
    return expandPratyahara(s.sound, e.sound, e.sutra);
  }, [start, end]);

  const choose = (slot: Slot) => {
    if (!slot.isIt) {
      setStart(slot.index);
      setEnd(null);
      return;
    }
    if (start !== null && slot.index > start) setEnd(slot.index);
  };

  const inRange = (i: number) => start !== null && end !== null && i >= start && i < end && !SLOTS[i]!.isIt;
  const ambiguous = result && result.it === "R";

  return (
    <section class="shiva" aria-label={label}>
      <div class="shiva-board">
        {SHIVA_SUTRAS.map((ss) => (
          <div class="shiva-sutra" role="group" aria-label={`Śivasūtra ${ss.n}`}>
            <span class="shiva-n" aria-hidden="true">{ss.n}</span>
            <span class="shiva-sounds">
              {SLOTS.filter((s) => s.sutra === ss.n).map((slot) => {
                const isStart = slot.index === start;
                const isEnd = slot.index === end;
                const disabled = slot.isIt && (start === null || slot.index < start);
                return (
                  <button
                    type="button"
                    class={[
                      "shiva-slot",
                      slot.isIt ? "is-it" : "",
                      inRange(slot.index) ? "in-range" : "",
                      isStart ? "is-start" : "",
                      isEnd ? "is-end" : "",
                    ].join(" ")}
                    aria-pressed={isStart || isEnd}
                    aria-disabled={disabled}
                    aria-label={
                      slot.isIt
                        ? `marker ${iast(slot.sound)}, closes sūtra ${ss.n}`
                        : `${iast(recited(slot))}, sūtra ${ss.n}`
                    }
                    onClick={() => !disabled && choose(slot)}
                  >
                    <Sa slp={recited(slot)} />
                  </button>
                );
              })}
            </span>
          </div>
        ))}
      </div>

      <div class="shiva-result" aria-live="polite">
        {result ? (
          <>
            <p class="shiva-name">
              <Sa slp={result.name} cls="shiva-name-sa" />
              <span class="shiva-count">names {result.sounds.length} sound{result.sounds.length === 1 ? "" : "s"}</span>
            </p>
            <ul class="shiva-members" aria-label="Members">
              {result.sounds.map((s) => (
                <li><Sa slp={isConsonant(s) ? `${s}a` : s} /></li>
              ))}
            </ul>
            {ambiguous && (
              <p class="shiva-note">
                ṇ closes two sūtras (1 and 6). Pāṇini's aṇ normally stops at the first; only in 1.1.69 does it run to the
                second. iṇ and yaṇ always use the second.
              </p>
            )}
            <p class="shiva-rule">
              First sound + closing marker, by <a href="/sutra/1.1.71/">1.1.71</a> ādir antyena sahetā. The markers themselves are not
              members.
            </p>
          </>
        ) : start !== null ? (
          <p class="shiva-hint">
            Starting from <Sa slp={recited(SLOTS[start]!)} />. Now choose a marker (in red) after it.
          </p>
        ) : (
          <p class="shiva-hint">Choose a first sound.</p>
        )}
      </div>

      {presets && (
        <div class="shiva-presets">
          <p class="shiva-presets-label">Classes Pāṇini uses often</p>
          <ul>
            {STANDARD_PRATYAHARAS.filter((p, i, arr) => arr.findIndex((q) => q.first === p.first && q.it === p.it) === i)
              .slice(0, 24)
              .map((p) => {
                const name = `${isConsonant(p.first) ? `${p.first}a` : p.first}${p.it}`;
                return (
                  <li>
                    <button
                      type="button"
                      class="shiva-preset"
                      onClick={() => {
                        const f = firstIdx(p.first);
                        setStart(f);
                        setEnd(itIdx(f, p.it, p.itSutra));
                      }}
                    >
                      <Sa slp={name} />
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </section>
  );
}
