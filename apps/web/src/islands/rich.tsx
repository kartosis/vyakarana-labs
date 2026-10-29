/** @jsxImportSource preact */
import { transliterate } from "@vl/engine";

/** Render text where ‹…› marks Sanskrit written in IAST; the visible script follows the site switch. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(‹[^›]*›)/g).filter(Boolean);
  return (
    <>
      {parts.map((p) =>
        p.startsWith("‹") ? (
          <span class="sa">
            <span class="sa-deva" lang="sa">{transliterate(p.slice(1, -1), "iast", "deva")}</span>
            <span class="sa-iast" lang="sa-Latn">{p.slice(1, -1)}</span>
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}

/** Plain-text version for aria-labels and announcements. */
export const plain = (text: string) => text.replace(/[‹›]/g, "");
