// Turning a device's IANA timezone into somewhere a reader recognises.
//
// The app reports its own zone — "Asia/Kolkata" — and nothing else: no IP, no
// lookup service. That makes this a coarse and slightly fallible answer, which
// the page says out loud: a devotee on a VPN, or travelling, reports wherever
// their phone thinks it is.
//
// There is no browser API that maps a zone to a country, so the common zones
// are listed here. Anything not listed still has a usable name — the zone's own
// city — so an unexpected zone appears as "Tashkent" rather than being dropped
// or guessed at.

/** The country each zone sits in. Not exhaustive; see describeZone for the rest. */
const COUNTRY_BY_ZONE: Readonly<Record<string, string>> = {
  // South Asia
  "Asia/Kolkata": "India", "Asia/Calcutta": "India",
  "Asia/Kathmandu": "Nepal", "Asia/Katmandu": "Nepal",
  "Asia/Colombo": "Sri Lanka", "Asia/Dhaka": "Bangladesh",
  "Asia/Karachi": "Pakistan", "Asia/Thimphu": "Bhutan", "Indian/Maldives": "Maldives",
  // The Gulf
  "Asia/Dubai": "United Arab Emirates", "Asia/Riyadh": "Saudi Arabia",
  "Asia/Qatar": "Qatar", "Asia/Kuwait": "Kuwait", "Asia/Bahrain": "Bahrain",
  "Asia/Muscat": "Oman", "Asia/Baghdad": "Iraq", "Asia/Tehran": "Iran",
  "Asia/Jerusalem": "Israel", "Asia/Amman": "Jordan", "Asia/Beirut": "Lebanon",
  // East and South-East Asia
  "Asia/Singapore": "Singapore", "Asia/Kuala_Lumpur": "Malaysia",
  "Asia/Jakarta": "Indonesia", "Asia/Bangkok": "Thailand",
  "Asia/Manila": "Philippines", "Asia/Ho_Chi_Minh": "Vietnam", "Asia/Saigon": "Vietnam",
  "Asia/Yangon": "Myanmar", "Asia/Rangoon": "Myanmar",
  "Asia/Tokyo": "Japan", "Asia/Seoul": "South Korea",
  "Asia/Shanghai": "China", "Asia/Hong_Kong": "Hong Kong", "Asia/Taipei": "Taiwan",
  "Asia/Tashkent": "Uzbekistan", "Asia/Almaty": "Kazakhstan", "Asia/Kabul": "Afghanistan",
  // Europe
  "Europe/London": "United Kingdom", "Europe/Dublin": "Ireland",
  "Europe/Lisbon": "Portugal", "Europe/Madrid": "Spain", "Europe/Paris": "France",
  "Europe/Brussels": "Belgium", "Europe/Amsterdam": "Netherlands",
  "Europe/Berlin": "Germany", "Europe/Zurich": "Switzerland", "Europe/Vienna": "Austria",
  "Europe/Rome": "Italy", "Europe/Athens": "Greece", "Europe/Stockholm": "Sweden",
  "Europe/Oslo": "Norway", "Europe/Copenhagen": "Denmark", "Europe/Helsinki": "Finland",
  "Europe/Warsaw": "Poland", "Europe/Prague": "Czechia", "Europe/Budapest": "Hungary",
  "Europe/Bucharest": "Romania", "Europe/Kyiv": "Ukraine", "Europe/Kiev": "Ukraine",
  "Europe/Moscow": "Russia", "Europe/Istanbul": "Turkey",
  // Africa
  "Africa/Johannesburg": "South Africa", "Africa/Nairobi": "Kenya",
  "Africa/Lagos": "Nigeria", "Africa/Accra": "Ghana", "Africa/Cairo": "Egypt",
  "Africa/Dar_es_Salaam": "Tanzania", "Africa/Kampala": "Uganda",
  "Africa/Lusaka": "Zambia", "Africa/Harare": "Zimbabwe",
  "Indian/Mauritius": "Mauritius", "Indian/Reunion": "Réunion",
  // The Americas
  "America/New_York": "United States", "America/Chicago": "United States",
  "America/Denver": "United States", "America/Phoenix": "United States",
  "America/Los_Angeles": "United States", "America/Anchorage": "United States",
  "America/Detroit": "United States", "America/Indiana/Indianapolis": "United States",
  "Pacific/Honolulu": "United States",
  "America/Toronto": "Canada", "America/Vancouver": "Canada",
  "America/Edmonton": "Canada", "America/Winnipeg": "Canada", "America/Halifax": "Canada",
  "America/Mexico_City": "Mexico", "America/Bogota": "Colombia", "America/Lima": "Peru",
  "America/Santiago": "Chile", "America/Sao_Paulo": "Brazil",
  "America/Argentina/Buenos_Aires": "Argentina", "America/Buenos_Aires": "Argentina",
  "America/Port_of_Spain": "Trinidad and Tobago", "America/Guyana": "Guyana",
  "America/Paramaribo": "Suriname", "America/Panama": "Panama", "America/Jamaica": "Jamaica",
  // Oceania
  "Australia/Sydney": "Australia", "Australia/Melbourne": "Australia",
  "Australia/Brisbane": "Australia", "Australia/Perth": "Australia",
  "Australia/Adelaide": "Australia", "Australia/Darwin": "Australia",
  "Australia/Hobart": "Australia",
  "Pacific/Auckland": "New Zealand", "Pacific/Fiji": "Fiji",
};

export interface ZonePlace {
  /** The city the zone is named after, spaced out: "Ho Chi Minh". */
  city: string;
  /** The country, when the zone is one we know. */
  country: string | null;
}

/** The city a zone is named after. "America/Indiana/Indianapolis" → "Indianapolis". */
export function cityFromZone(zone: unknown): string {
  const z = typeof zone === "string" ? zone.trim() : "";
  if (!z) return "";
  const last = z.split("/").pop() || "";
  return last.replace(/_/g, " ").trim();
}

/** Where a zone is, as far as we can tell from the zone alone. */
export function describeZone(zone: unknown): ZonePlace {
  const z = typeof zone === "string" ? zone.trim() : "";
  return { city: cityFromZone(z), country: COUNTRY_BY_ZONE[z] ?? null };
}

export interface ZoneCount { timezone: string; joined: number }
export interface PlaceCount {
  /** What to print: the country where we know it, otherwise the city. */
  label: string;
  joined: number;
  /** True when the label is a city standing in for a country we do not know. */
  approximate: boolean;
}

/**
 * Roll zone counts up into places, busiest first. Zones of one country — the
 * six Australian ones, the seven American — add together, so a reader sees
 * "Australia 4" rather than four rows of one.
 */
export function placesFromZones(rows: readonly ZoneCount[]): PlaceCount[] {
  const byLabel = new Map<string, PlaceCount>();
  for (const row of rows) {
    const joined = Number(row?.joined);
    if (!Number.isFinite(joined) || joined <= 0) continue;
    const { city, country } = describeZone(row?.timezone);
    const label = country ?? city;
    if (!label) continue;
    const existing = byLabel.get(label);
    if (existing) existing.joined += joined;
    else byLabel.set(label, { label, joined, approximate: country === null });
  }
  return [...byLabel.values()].sort((a, b) => b.joined - a.joined || a.label.localeCompare(b.label));
}

export function totalPlaces(places: readonly PlaceCount[]): number {
  return places.reduce((n, p) => n + p.joined, 0);
}
