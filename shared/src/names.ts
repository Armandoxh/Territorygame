// Random country-style names for regions. Mix of real-world country names
// and a curated set of nation-style prefixes ("Kingdom", "Republic", …) so
// every district reads as its own little nation on the map.

const COUNTRY_NAMES: readonly string[] = [
  'Albania', 'Andorra', 'Armenia', 'Bahrain', 'Belize', 'Bhutan', 'Bolivia',
  'Botswana', 'Brunei', 'Burundi', 'Cambodia', 'Croatia', 'Cyprus', 'Djibouti',
  'Ecuador', 'Eritrea', 'Estonia', 'Eswatini', 'Fiji', 'Gabon', 'Georgia',
  'Grenada', 'Guinea', 'Guyana', 'Haiti', 'Honduras', 'Iceland', 'Jordan',
  'Kazakhstan', 'Kiribati', 'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia',
  'Lesotho', 'Liberia', 'Liechtenstein', 'Luxembourg', 'Maldives', 'Malta',
  'Mauritius', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Namibia',
  'Nepal', 'Niger', 'Oman', 'Palau', 'Panama', 'Paraguay', 'Qatar',
  'Rwanda', 'Samoa', 'Senegal', 'Serbia', 'Slovakia', 'Slovenia', 'Suriname',
  'Tajikistan', 'Tonga', 'Tunisia', 'Turkmenistan', 'Tuvalu', 'Uruguay',
  'Vanuatu', 'Yemen', 'Zambia', 'Zimbabwe',
  // A pinch of fully-fictional flavour names so we don't run out at high
  // region counts.
  'Vesteria', 'Norvenia', 'Brakelia', 'Marendia', 'Solvania', 'Korthal',
  'Drennor', 'Astovar', 'Pellandia', 'Veshren', 'Tarkovia', 'Lensk',
];

const PREFIXES: readonly string[] = [
  'Kingdom', 'Republic', 'Territory', 'Duchy', 'Province', 'Realm',
  'Federation', 'Sultanate', 'Empire', 'Principality', 'Domain', 'Free State',
  'Confederation', 'Caliphate', 'Khanate', 'Tsardom',
];

/**
 * Returns an array of length `count + 1`. Index 0 is unused (for symmetry
 * with 1-indexed region IDs); indices 1..count carry the generated names.
 * Both prefixes and country names are shuffled so each game gets distinct
 * pairings — "Kingdom of Bhutan" one round, "Khanate of Bhutan" the next.
 */
export function generateRegionNames(count: number): string[] {
  const out: string[] = [''];
  if (count <= 0) return out;
  const c = COUNTRY_NAMES.slice();
  const p = PREFIXES.slice();
  shuffle(c);
  shuffle(p);
  for (let r = 1; r <= count; r++) {
    const country = c[(r - 1) % c.length] ?? 'Albania';
    const prefix  = p[(r - 1) % p.length] ?? 'Kingdom';
    out.push(`${prefix} of ${country}`);
  }
  return out;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}
