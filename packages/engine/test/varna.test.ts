import { describe, expect, it } from "vitest";
import {
  SHIVA_SUTRAS,
  articulation,
  expandPratyahara,
  grade,
  isSavarna,
  sharesPlaceAndEffort,
  pratyahara,
  shivaSutraText,
  standardPratyaharas,
} from "../src/varna.js";

const s = (str: string) => str.split(" ");

describe("Śivasūtras", () => {
  it("has 14 sūtras with the traditional text", () => {
    expect(SHIVA_SUTRAS).toHaveLength(14);
    expect(SHIVA_SUTRAS.map(shivaSutraText)).toEqual([
      "aiuR", "fxk", "eoN", "EOc", "hayavaraw", "laR", "YamaNaRanam",
      "JaBaY", "GaQaDaz", "jabagaqadaS", "KaPaCaWaTacawatav", "kapay", "Sazasar", "hal",
    ]);
  });
});

describe("pratyāhāra (1.1.71 ādir antyena sahetā)", () => {
  const golden: Array<[name: string, sounds: string]> = [
    ["ac", "a i u f x e o E O"],
    ["ak", "a i u f x"],
    ["ik", "i u f x"],
    ["eN", "e o"],
    ["ec", "e o E O"],
    ["Ec", "E O"],
    ["aw", "a i u f x e o E O h y v r"],
    ["yaR", "y v r l"],
    ["am", "a i u f x e o E O h y v r l Y m N R n"],
    ["Nam", "N R n"],
    ["yaY", "y v r l Y m N R n J B"],
    ["Jaz", "J B G Q D"],
    ["Baz", "B G Q D"],
    ["jaS", "j b g q d"],
    ["baS", "b g q d"],
    ["Cav", "C W T c w t"],
    ["cay", "c w t k p"],
    ["Kay", "K P C W T c w t k p"],
    ["car", "c w t k p S z s"],
    ["Sar", "S z s"],
    ["Sal", "S z s h"],
    ["hal", "h y v r l Y m N R n J B G Q D j b g q d K P C W T c w t k p S z s"],
  ];

  it.each(golden)("%s", (name, sounds) => {
    expect(pratyahara(name).sounds).toEqual(s(sounds));
  });

  it("al covers every sound exactly once", () => {
    const al = pratyahara("al").sounds;
    expect(al).toHaveLength(9 + 33);
    expect(new Set(al).size).toBe(al.length);
  });

  it("resolves the two ṇ markers", () => {
    expect(expandPratyahara("a", "R", 1).sounds).toEqual(s("a i u"));
    expect(expandPratyahara("a", "R", 6).sounds).toEqual(s("a i u f x e o E O h y v r l"));
    expect(pratyahara("iR").sounds).toEqual(s("i u f x e o E O h y v r l"));
  });

  it("expands every standard pratyāhāra without error", () => {
    expect(standardPratyaharas().every((p) => p.sounds.length > 0)).toBe(true);
  });

  it("rejects impossible ranges", () => {
    expect(() => expandPratyahara("k", "c")).toThrow();
  });
});

describe("guṇa and vṛddhi (1.1.1–1.1.3, 1.1.51)", () => {
  it.each([
    ["i", "guna", "e"], ["I", "vrddhi", "E"], ["u", "guna", "o"], ["U", "vrddhi", "O"],
    ["f", "guna", "ar"], ["f", "vrddhi", "Ar"], ["x", "guna", "al"], ["a", "vrddhi", "A"],
  ] as const)("%s → %s = %s", (v, g, out) => {
    expect(grade(v, g)).toBe(out);
  });
});

describe("savarṇa (1.1.9–1.1.10)", () => {
  it.each([
    ["a", "A", true], ["i", "I", true], ["f", "x", true],
    ["k", "N", true], ["c", "J", true], ["t", "D", true],
    ["v", "l", false], ["i", "y", false], ["k", "h", false], ["S", "c", false], ["e", "E", false],
  ] as const)("%s ~ %s = %s", (x, y, out) => {
    expect(isSavarna(x, y)).toBe(out);
  });

  it("shows why 1.1.10 nājjhalau is needed (Kāśikā: dadhi śītam, daṇḍa-hastaḥ)", () => {
    expect(sharesPlaceAndEffort("i", "S")).toBe(true);
    expect(sharesPlaceAndEffort("a", "h")).toBe(true);
    expect(isSavarna("i", "S")).toBe(false);
    expect(isSavarna("a", "h")).toBe(false);
  });

  it("follows the Siddhāntakaumudī articulation table", () => {
    expect(articulation("v").sthana).toEqual(["danta", "ostha"]);
    expect(articulation("e").sthana).toEqual(["kantha", "talu"]);
    expect(articulation("N").sthana).toEqual(["kantha", "nasika"]);
    expect(articulation("h")).toMatchObject({ abhyantara: "vivrta", ghosa: true, mahaprana: true });
    expect(articulation("k")).toMatchObject({ abhyantara: "sprsta", ghosa: false, mahaprana: false });
  });
});

describe("external review fixes (PROGRESS §10)", () => {
  it("#10: a pratyāhāra starting at the h of the fourteenth sūtra contains only that h", () => {
    expect(expandPratyahara("h", "l", 14, 14).sounds).toEqual(["h"]);
    expect(expandPratyahara("h", "l").sounds.length).toBe(33); // hal, from the h of hayavaraṭ
  });
  it("P3: articulation of ḻ (not in the Śivasūtras) fails with a clear message", () => {
    expect(() => articulation("L")).toThrow(/Śivasūtras/);
  });
});
