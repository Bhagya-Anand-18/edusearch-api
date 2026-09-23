/**
 * Turns MCC's institute text ("AIIMS, Jodhpur,BASNI PHASE - II, Jodhpur,
 * Rajasthan, 342005") into a stable identity and a readable name.
 *
 * MCC prints the name and the postal address as one field, and spells the same
 * college differently across years ("GOVT. MEDICAL COLLEGE" vs "Government
 * Medical College"). The first comma-separated segment is the name; the name
 * alone is not unique (13 colleges are called "Government Medical College",
 * 13 are "AIIMS"), and neither is the PIN code (RML and Lady Hardinge share
 * 110001). Together they identify a college.
 */
import { canonicalState } from '../utils/states.js';

export interface MccInstitute {
  /** Name segment as printed, e.g. "AIIMS". */
  name: string;
  /** Segment after the name, usually the city, e.g. "Jodhpur". */
  place: string | null;
  pin: string | null;
  state: string | null;
  /** Spelling-insensitive form of the name, used for identity. */
  nameKey: string;
}

export const medicalNameKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/\bgovt\b\.?/g, 'government')
    .replace(/\bmedcial\b/g, 'medical')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');

export function parseMccInstitute(raw: string): MccInstitute {
  const segments = raw.split(',').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const name = segments[0] ?? raw.trim();
  // The PIN is usually last, but some years embed it mid-address; take the last one present.
  const pins = raw.match(/\b\d{6}\b/g);
  const stateMatch = raw.match(/,\s*([A-Za-z &().]+?)\s*,\s*\d{6}\s*$/);
  return {
    name,
    place: segments[1] ?? null,
    pin: pins ? pins[pins.length - 1] : null,
    state: canonicalState(stateMatch?.[1]),
    nameKey: medicalNameKey(name),
  };
}

/**
 * "GOVERNMENT MEDICAL COLLEGE" -> "Government Medical College", "KOLKATA" ->
 * "Kolkata". Leaves mixed case alone, and single all-caps words of up to five
 * letters, which are acronyms ("AIIMS", "VMMC").
 */
export function tidyName(name: string): string {
  if (name !== name.toUpperCase() || (!/\s/.test(name) && name.length <= 5)) return name;
  return name
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Of|And|The|For)\b/g, (w) => w.toLowerCase());
}

/** Edit distance, for catching MCC's typos ("Guahawti", "Collge") between years. */
function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const sameName = (a: string, b: string) => a === b || levenshtein(a, b) <= 2;
const placeKey = (s: string | null) => (s ?? '').toLowerCase().replace(/[^a-z]/g, '');

export interface Resolution {
  /** Raw institute text -> identity key. */
  keys: Map<string, string>;
  /** Raw strings that could not be tied to a PIN-identified college. */
  unresolved: string[];
  /** Renames merged in pass 3, as [earlier name, later name], for the import report. */
  renames: [string, string][];
  /** Colleges whose PIN changed between years, merged in pass 4, as [name, PINs]. */
  pinChanges: [string, string][];
}

/**
 * Assigns every raw MCC institute string an identity that is stable across years:
 *  1. Strings with a PIN are keyed by name + PIN, and names under the same PIN
 *     that differ only by a typo are merged.
 *  2. Strings without a PIN take the identity of the one college with a matching
 *     name, or, when several share the name, the one in the same city.
 *  3. Two identities under one PIN that never appear in the same year are one
 *     college renamed ("Bahiramjee Jijibhai Medical College" became "B. J.
 *     Government Medical College"), and are merged into the later name.
 *  4. Identities with the same name in the same state that never appear in the
 *     same year are one college whose PIN changed (MCC printed AIIMS Jammu as
 *     18410, 184120 and 181134 in successive years). Names shared by several
 *     colleges in one year ("Government Medical College") never qualify.
 *  Anything still ambiguous keeps an identity of its own and is reported.
 */
export function resolveMccIdentities(entries: { raw: string; year: number }[]): Resolution {
  const parsed = new Map(entries.map(({ raw }) => [raw, parseMccInstitute(raw)]));
  type Identity = { key: string; nameKey: string; name: string; pin: string; places: Set<string>; raws: string[]; years: Set<number> };
  const identities: Identity[] = [];

  for (const [raw, p] of parsed) {
    if (!p.pin) continue;
    let id = identities.find((i) => i.pin === p.pin && sameName(i.nameKey, p.nameKey));
    if (!id) {
      id = { key: `${p.nameKey}|${p.pin}`, nameKey: p.nameKey, name: p.name, pin: p.pin, places: new Set(), raws: [], years: new Set() };
      identities.push(id);
    }
    id.places.add(placeKey(p.place));
    id.raws.push(raw.toLowerCase());
  }

  const keys = new Map<string, string>();
  const unresolved: string[] = [];
  for (const [raw, p] of parsed) {
    if (p.pin) {
      keys.set(raw, identities.find((i) => i.pin === p.pin && sameName(i.nameKey, p.nameKey))!.key);
      continue;
    }
    const byName = identities.filter((i) => sameName(i.nameKey, p.nameKey));
    const place = placeKey(p.place);
    const byPlace = byName.filter((i) => place && (i.places.has(place) || i.raws.some((r) => placeKey(r).includes(place))));
    const match = byName.length === 1 ? byName[0] : byPlace.length === 1 ? byPlace[0] : null;
    if (match) {
      keys.set(raw, match.key);
    } else {
      keys.set(raw, `${p.nameKey}|?${place}`);
      unresolved.push(raw);
    }
  }

  // Pass 3: renames under one PIN.
  const byKey = new Map(identities.map((i) => [i.key, i]));
  for (const { raw, year } of entries) byKey.get(keys.get(raw)!)?.years.add(year);
  const redirect = new Map<string, string>();
  const renames: [string, string][] = [];
  const byPin = new Map<string, Identity[]>();
  for (const i of identities) byPin.set(i.pin, [...(byPin.get(i.pin) ?? []), i]);
  for (const group of byPin.values()) {
    if (group.length !== 2) continue; // only the unambiguous case: exactly two names under the PIN
    const [a, b] = group;
    if ([...a.years].some((y) => b.years.has(y))) continue; // coexisted, so two colleges
    const [earlier, later] = Math.max(...a.years) < Math.min(...b.years) ? [a, b] : [b, a];
    redirect.set(earlier.key, later.key);
    renames.push([earlier.name, later.name]);
  }
  for (const [raw, key] of keys) if (redirect.has(key)) keys.set(raw, redirect.get(key)!);

  // Pass 4: PIN changes under one name.
  const facts = new Map<string, { nameKey: string; years: Set<number>; states: Set<string>; pins: Set<string> }>();
  for (const { raw, year } of entries) {
    const key = keys.get(raw)!;
    const p = parsed.get(raw)!;
    const f = facts.get(key) ?? { nameKey: key.split('|')[0], years: new Set(), states: new Set(), pins: new Set() };
    f.years.add(year);
    if (p.state) f.states.add(p.state);
    if (p.pin) f.pins.add(p.pin);
    facts.set(key, f);
  }
  const byName = new Map<string, string[]>();
  for (const [key, f] of facts) byName.set(f.nameKey, [...(byName.get(f.nameKey) ?? []), key]);
  const pinChanges: [string, string][] = [];
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const years = group.flatMap((k) => [...facts.get(k)!.years]);
    if (new Set(years).size !== years.length) continue; // two of them coexisted in some year
    const states = new Set(group.flatMap((k) => [...facts.get(k)!.states]));
    if (states.size > 1) continue;
    const latest = group.reduce((a, b) => (Math.max(...facts.get(a)!.years) > Math.max(...facts.get(b)!.years) ? a : b));
    for (const k of group) if (k !== latest) for (const [raw, key] of keys) if (key === k) keys.set(raw, latest);
    const sample = [...parsed.values()].find((p) => p.nameKey === facts.get(latest)!.nameKey)!;
    pinChanges.push([sample.name, group.flatMap((k) => [...facts.get(k)!.pins]).join(' / ') || 'none']);
  }
  const stillUnresolved = unresolved.filter((raw) => !pinChanges.some(([name]) => parsed.get(raw)!.name === name));

  return { keys, unresolved: stillUnresolved, renames, pinChanges };
}
