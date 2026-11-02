import { describe, expect, it } from "vitest";
import { charName, chunks, distinctForms, nyapApplies, nyapDefault, ruleView, shownSteps, stemProblem } from "../src/lib/prakriya";

describe("stem checks (Derivation tool review D4)", () => {
  it.each(["rAma", "ramA", "nadI", "vAc", "BagavatM~"])("accepts what vidyut accepts: %s", (s) => {
    const p = stemProblem(s);
    if (s === "BagavatM~") expect(p).toEqual({ kind: "char", char: "~" }); // ~ after M, not after a vowel
    else expect(p).toBeNull();
  });
  it("names the problem", () => {
    expect(stemProblem("")).toEqual({ kind: "empty" });
    expect(stemProblem("rAma deva")).toEqual({ kind: "space" });
    expect(stemProblem("iLA")).toEqual({ kind: "char", char: "L" });
    expect(stemProblem("ramA1")).toEqual({ kind: "char", char: "1" });
    expect(stemProblem("so'yam")).toEqual({ kind: "char", char: "'" });
    expect(stemProblem("rAmaH")).toEqual({ kind: "ending", bare: "rAma" });
    expect(stemProblem("phalaM")).toEqual({ kind: "ending", bare: "phala" }); // SLP1 p + h: letters, but a finished form
  });
  it("names refused characters for learners", () => {
    expect(charName("L")).toContain("ḻ");
    expect(charName("'")).toContain("avagraha");
    expect(charName("1")).toBe("“1”");
  });
});

describe("feminine suffix box (review D3)", () => {
  it.each([["ramA", true], ["nadI", true], ["gOrI", true], ["lakzmI", false], ["SrI", false], ["DI", false], ["BI", false], ["avI", false], ["tantrI", false], ["tarI", false], ["hrI", false]])(
    "%s: ticked by default = %s",
    (s, want) => expect(nyapDefault(s)).toBe(want),
  );
  it("is offered only for stems in ā or ī", () => {
    expect(nyapApplies("vAc")).toBe(false);
    expect(nyapApplies("mati")).toBe(false);
    expect(nyapApplies("lakzmI")).toBe(true);
  });
});

describe("rule codes (review D2)", () => {
  const known = new Set(["8.3.15"]);
  it("links sūtras: own page, else Pramāṇa, else the pāda page", () => {
    expect(ruleView("ashtadhyayi", "8.3.15", known)).toMatchObject({ label: "8.3.15", href: "/sutra/8.3.15/" });
    expect(ruleView("ashtadhyayi", "8.2.66", known)).toMatchObject({ label: "8.2.66", external: true });
    expect(ruleView("ashtadhyayi", "8.2.66", known)!.href).toMatch(/astadhyayi\.8\.2\.66$/);
    expect(ruleView("ashtadhyayi", "1.1.60", known)!.href).toMatch(/astadhyayi\.1\.1$/); // Pramāṇa lacks 1.1.46–75
  });
  it("shows a part of a sūtra as that sūtra", () => {
    const v = ruleView("ashtadhyayi", "8.4.8.1", known)!;
    expect(v.label).toBe("8.4.8");
    expect(v.title).toContain("Part 1 of sūtra 8.4.8");
  });
  it("labels vārttikas and Kāśikā statements by their sūtra and links it", () => {
    expect(ruleView("varttika", "8.4.29.1", known)).toMatchObject({ label: "vārttika on 8.4.29", sutra: "8.4.29" });
    expect(ruleView("kashika", "8.3.15.1", known)).toMatchObject({ label: "Kāśikā on 8.3.15", href: "/sutra/8.3.15/" });
  });
  it("shows only the name of a rule from another work; hides internal steps", () => {
    expect(ruleView("anyatra", "Śabdenduśekhara,saMjYA,https://example.org", known)).toEqual({ label: "Śabdenduśekhara" });
    expect(ruleView("unadi", "1.1", known)).toEqual({ label: "Uṇādi 1.1" });
    expect(ruleView("ashtadhyayi", "  ", known)).toBeNull();
    const steps = [
      { rule: { source: "ashtadhyayi", code: "" }, result: [] },
      { rule: { source: "ashtadhyayi", code: "1.2.45" }, result: [] },
    ];
    expect(shownSteps(steps)).toHaveLength(1);
  });
});

describe("terms and forms (review D9, D10)", () => {
  it("joins a lone visarga to the term before it, keeping each part's change", () => {
    const c = chunks([{ text: "rAma", wasChanged: false }, { text: "H", wasChanged: true }, { text: "", wasChanged: false }]);
    expect(c).toEqual([{ text: "rAmaH", changed: true, parts: [{ text: "rAma", wasChanged: false }, { text: "H", wasChanged: true }] }]);
  });
  it("drops accents", () => {
    expect(chunks([{ text: "rA\\ma^", wasChanged: false }])[0]!.text).toBe("rAma");
  });
  it("counts forms, not derivations", () => {
    const p = (text: string) => ({ text, history: [] });
    expect(distinctForms([p("rAmaH"), p("rAmaH"), p("rAmo")]).map((x) => x.text)).toEqual(["rAmaH", "rAmo"]);
  });
});
