/** @jsxImportSource preact */
import { useId, useState } from "preact/hooks";
import { detectScheme, toSlp1, fromSlp1, type Scheme } from "@vl/engine";

const SCHEMES: Array<{ value: Scheme | "auto"; label: string }> = [
  { value: "auto", label: "Detect automatically" },
  { value: "hk", label: "Harvard-Kyoto (keyboard)" },
  { value: "iast", label: "IAST (with diacritics)" },
  { value: "slp1", label: "SLP1" },
  { value: "deva", label: "Devanagari" },
];

export default function LipiPad({ initial = "vRddhir Adaic" }: { initial?: string }) {
  const id = useId();
  const [text, setText] = useState(initial);
  const [scheme, setScheme] = useState<Scheme | "auto">("auto");
  const from: Scheme = scheme === "auto" ? detectScheme(text) : scheme;
  const slp = toSlp1(text, from);

  return (
    <section class="lipi" aria-label="Transliteration pad">
      <div class="lipi-inputs">
        <label for={`${id}-in`}>Type Sanskrit</label>
        <textarea id={`${id}-in`} rows={2} value={text} spellcheck={false} autocapitalize="off"
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
        <label for={`${id}-scheme`}>Input scheme</label>
        <select id={`${id}-scheme`} value={scheme} onChange={(e) => setScheme((e.target as HTMLSelectElement).value as Scheme | "auto")}>
          {SCHEMES.map((s) => <option value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <dl class="lipi-out" aria-live="polite">
        <div><dt>Devanagari</dt><dd lang="sa" class="lipi-deva">{fromSlp1(slp, "deva")}</dd></div>
        <div><dt>IAST</dt><dd lang="sa-Latn" class="iast">{fromSlp1(slp, "iast")}</dd></div>
        <div><dt>Harvard-Kyoto</dt><dd>{fromSlp1(slp, "hk")}</dd></div>
        <div><dt>SLP1</dt><dd>{slp}</dd></div>
      </dl>
      <p class="lipi-help">
        Reading as <strong>{SCHEMES.find((s) => s.value === from)?.label}</strong>. In Harvard-Kyoto, capitals mark length and
        retroflexion: <kbd>A</kbd> ā, <kbd>R</kbd> ṛ, <kbd>T</kbd> ṭ, <kbd>N</kbd> ṇ, <kbd>z</kbd> ś, <kbd>S</kbd> ṣ, <kbd>M</kbd> ṃ, <kbd>H</kbd> ḥ.
      </p>
    </section>
  );
}
