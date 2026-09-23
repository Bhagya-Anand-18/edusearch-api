/** Former and alternate names that sources still use, mapped to the current official name. */
const RENAMED: Record<string, string> = {
  pondicherry: 'Puducherry',
  orissa: 'Odisha',
  uttaranchal: 'Uttarakhand',
};

/**
 * Normalizes a state or union territory name so values from JoSAA, NIRF and API
 * callers compare equal: "Jammu & Kashmir", "jammu and kashmir" and
 * "Jammu And Kashmir" all become "Jammu and Kashmir".
 */
export function canonicalState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/&/g, ' and ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const renamed = RENAMED[cleaned.toLowerCase()];
  if (renamed) return renamed;
  return cleaned
    .toLowerCase()
    .split(' ')
    .map((word) => (word === 'and' ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}
