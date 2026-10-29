import manifest from "../../../../data/pramana.json";

const BASE = manifest.base;
const counts = manifest.padaCounts as Record<string, number>;

export interface PramanaLink {
  href: string;
  /** true when the link goes to the sūtra itself, false when it falls back to the pāda page */
  exact: boolean;
  label: string;
}

/**
 * Deep link to a sūtra on Pramāṇa (indike.org). Pramāṇa's pāda 1.1 stops at 1.1.45, so for
 * sūtras beyond a pāda's published range we link to the pāda page instead.
 */
export function pramanaLink(id: string): PramanaLink {
  const [a, p, s] = id.split(".");
  const pada = `${a}.${p}`;
  const max = counts[pada];
  const exact = max === undefined || Number(s) <= max;
  return exact
    ? { href: `${BASE}.${id}`, exact, label: `Aṣṭādhyāyī ${id} on Pramāṇa` }
    : { href: `${BASE}.${pada}`, exact, label: `Aṣṭādhyāyī pāda ${pada} on Pramāṇa (this sūtra has no page there yet)` };
}

export const pramanaCommentary = {
  mahabhasya: `${BASE}!mahabhasya`,
  kasika: `${BASE}!kasika`,
  varttika: `${BASE}!varttika`,
  sivasutra: `${BASE}.sivasutra`,
  astadhyayi: BASE,
  vyakarana: "https://indike.org/pramana/in.vedanga.vyakarana",
  darsana: "https://indike.org/pramana/in.vedanga.vyakarana.darsana",
  linganusasana: "https://indike.org/pramana/in.vedanga.vyakarana.linganusasana-hemacandra",
} as const;
