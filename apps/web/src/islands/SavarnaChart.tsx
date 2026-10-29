/** @jsxImportSource preact */
import { useState } from "preact/hooks";
import { articulation, isConsonant, isSavarna, sharesPlaceAndEffort, transliterate } from "@vl/engine";

const deva = (s: string) => transliterate(s, "slp1", "deva");
const iast = (s: string) => transliterate(s, "slp1", "iast");
const say = (s: string) => (isConsonant(s) ? `${s}a` : s);
const PLACE: Record<string, string> = {
  kantha: "throat", talu: "palate", murdhan: "roof of the mouth", danta: "teeth", ostha: "lips", nasika: "nose",
};

function Sa({ slp }: { slp: string }) {
  return (
    <span class="sa">
      <span class="sa-deva" lang="sa">{deva(slp)}</span>
      <span class="sa-iast" lang="sa-Latn">{iast(slp)}</span>
    </span>
  );
}

/** Rows = place (sthāna); columns = internal effort (ābhyantara prayatna), LSK four-fold model. */
const ROWS: Array<{ key: string; label: string; sa: string; cells: [string, string, string, string] }> = [
  { key: "kantha", label: "throat", sa: "kaRWa", cells: ["kKgGN", "", "h", "aA"] },
  { key: "talu", label: "palate", sa: "tAlu", cells: ["cCjJY", "y", "S", "iI"] },
  { key: "murdhan", label: "roof (retroflex)", sa: "mUrDan", cells: ["wWqQR", "r", "z", "fF"] },
  { key: "danta", label: "teeth", sa: "danta", cells: ["tTdDn", "l", "s", "x"] },
  { key: "ostha", label: "lips", sa: "ozWa", cells: ["pPbBm", "", "", "uU"] },
  { key: "kantha-talu", label: "throat + palate", sa: "kaRWatAlu", cells: ["", "", "", "eE"] },
  { key: "kantha-ostha", label: "throat + lips", sa: "kaRWozWa", cells: ["", "", "", "oO"] },
  { key: "danta-ostha", label: "teeth + lips", sa: "dantozWa", cells: ["", "v", "", ""] },
];
const COLS = [
  { label: "full contact", sa: "spfzwa", note: "stops and nasals" },
  { label: "slight contact", sa: "IzatspfzwA", note: "semivowels" },
  { label: "open", sa: "vivfta", note: "sibilants and h" },
  { label: "open", sa: "vivfta", note: "vowels" },
];

export default function SavarnaChart() {
  const [sel, setSel] = useState<string>("i");

  const status = (s: string): "self" | "savarna" | "blocked" | "" => {
    if (s === sel) return "self";
    if (isSavarna(sel, s)) return "savarna";
    if (sharesPlaceAndEffort(sel, s)) return "blocked";
    return "";
  };

  const a = articulation(sel);
  const all = ROWS.flatMap((r) => r.cells.join("").split(""));
  const savarnas = all.filter((s) => s !== sel && isSavarna(sel, s));
  const blocked = all.filter((s) => s !== sel && !isSavarna(sel, s) && sharesPlaceAndEffort(sel, s));

  return (
    <section class="savarna" aria-label="Places and efforts of articulation">
      <div class="table-wrap">
        <table class="savarna-table">
          <caption class="visually-hidden">Sounds by place (rows) and internal effort (columns). Choose a sound to see its savarṇa class.</caption>
          <thead>
            <tr>
              <th scope="col">Place</th>
              {COLS.map((c) => (
                <th scope="col">
                  <Sa slp={c.sa} />
                  <span class="savarna-col-note">{c.note}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr>
                <th scope="row">
                  <Sa slp={r.sa} />
                  <span class="savarna-col-note">{r.label}</span>
                </th>
                {r.cells.map((cell) => (
                  <td>
                    {cell.split("").map((s) => (
                      <button
                        type="button"
                        class={`savarna-sound is-${status(s) || "none"}`}
                        aria-pressed={s === sel}
                        aria-label={`${iast(say(s))}${status(s) === "savarna" ? ", savarṇa" : status(s) === "blocked" ? ", same place and effort but blocked by 1.1.10" : ""}`}
                        onClick={() => setSel(s)}
                      >
                        <Sa slp={say(s)} />
                      </button>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div class="savarna-readout" aria-live="polite">
        <p>
          <strong><Sa slp={say(sel)} /></strong> is made at the <em>{a.sthana.map((p) => PLACE[p]).join(" and ")}</em> with{" "}
          <em>{a.abhyantara === "sprsta" ? "full contact" : a.abhyantara === "isatsprsta" ? "slight contact" : "an open"}</em> effort.
        </p>
        <p class="savarna-legend">
          <span class="savarna-key is-savarna" aria-hidden="true"></span>
          Savarṇa ({savarnas.length}):{" "}
          {savarnas.length ? savarnas.map((s, i) => <>{i > 0 && ", "}<Sa slp={say(s)} /></>) : "none besides itself"}
        </p>
        {blocked.length > 0 && (
          <p class="savarna-legend">
            <span class="savarna-key is-blocked" aria-hidden="true"></span>
            Same place and effort, but kept apart by <a href="/sutra/1.1.10/">1.1.10</a> nājjhalau:{" "}
            {blocked.map((s, i) => <>{i > 0 && ", "}<Sa slp={say(s)} /></>)}
          </p>
        )}
      </div>
    </section>
  );
}
