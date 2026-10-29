import { transliterate, type Scheme } from "@vl/engine";

/** Devanagari → IAST, for build-time rendering. */
export const devaToIast = (deva: string): string => transliterate(deva, "deva", "iast");

/** Any scheme → both scripts. */
export function bothScripts(text: string, from: Scheme): { deva: string; iast: string } {
  if (from === "deva") return { deva: text, iast: devaToIast(text) };
  return { deva: transliterate(text, from, "deva"), iast: transliterate(text, from, "iast") };
}

const DEVA_DIGITS = "०१२३४५६७८९";
/** 1.3.3 → १।३।३ */
export const devaNumber = (n: string | number): string =>
  String(n)
    .replace(/\d/g, (d) => DEVA_DIGITS[Number(d)]!)
    .replace(/\./g, "।");
