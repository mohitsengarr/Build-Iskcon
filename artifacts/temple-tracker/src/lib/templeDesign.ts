// A temple design, part by part — and the 108 named styles built from them.
//
// A temple is seven choices: what it stands on, its walls, its porch, the tower
// or dome that crowns it, what stands at the corners of its roof, what tops the
// crown, and what it is built of (with a finish for the crown, which can differ
// — a gilded shikhara over sandstone walls, a cobalt dome over marble).
//
// The 108 styles are twelve architectural families, each in nine stones and
// finishes. Every one of them is only a starting point: any part can be changed
// in the builder, and the design that is saved is whatever the devotee made.
//
// Pure data, no three.js, so the builder page can import it without pulling in
// the 3D bundle, and the rules can be tested.

import type { TempleStyle } from "./communityTemples";

export const BASES = ["stepped", "high"] as const;
export const BODIES = ["hall", "sanctum", "pillared"] as const;
export const PORCHES = ["portico", "mandapa", "pidha", "flat", "none"] as const;
export const CROWNS = [
  "planetarium-dome", "onion-dome", "faceted-dome", "shikhara", "rekha",
  "triple-shikhara", "pancharatna", "gopuram", "vimana", "pyramid",
] as const;
export const CORNERS = ["chhatris", "spires", "finials", "none"] as const;
export const FINIALS = ["kalash", "kalash-flag", "chakra-flag"] as const;
export const STONES = [
  "white-marble", "buff-sandstone", "pink-sandstone", "red-sandstone", "granite", "basalt", "terracotta",
] as const;
export const FINISHES = ["stone", "cobalt", "turquoise", "gold", "white", "saffron", "copper"] as const;

export type BaseKind = (typeof BASES)[number];
export type BodyKind = (typeof BODIES)[number];
export type PorchKind = (typeof PORCHES)[number];
export type CrownKind = (typeof CROWNS)[number];
export type CornerKind = (typeof CORNERS)[number];
export type FinialKind = (typeof FINIALS)[number];
export type StoneKind = (typeof STONES)[number];
export type FinishKind = (typeof FINISHES)[number];

export interface TempleDesign {
  v: 1;
  base: BaseKind;
  body: BodyKind;
  porch: PorchKind;
  crown: CrownKind;
  corners: CornerKind;
  finial: FinialKind;
  stone: StoneKind;
  finish: FinishKind;
  /** The named style it started from, if any — kept for its label. */
  preset?: string;
}

/** The parts a devotee can change, in the order the builder shows them. */
export type PartKey = "base" | "body" | "porch" | "crown" | "corners" | "finial" | "stone" | "finish";

export const PART_LABELS: Record<PartKey, string> = {
  crown: "Tower or dome",
  body: "Walls",
  porch: "Entrance porch",
  corners: "Roof corners",
  finial: "Pinnacle",
  base: "Base",
  stone: "Built of",
  finish: "Crown finish",
};

export const OPTION_LABELS: {
  base: Record<BaseKind, string>; body: Record<BodyKind, string>; porch: Record<PorchKind, string>;
  crown: Record<CrownKind, string>; corners: Record<CornerKind, string>; finial: Record<FinialKind, string>;
  stone: Record<StoneKind, string>; finish: Record<FinishKind, string>;
} = {
  base: { stepped: "Stepped plinth", high: "High jagati" },
  body: { hall: "Marble hall, arched windows", sanctum: "Sanctum with niches", pillared: "Pillared Dravida walls" },
  porch: { portico: "Columned portico", mandapa: "Stepped-roof mandapa", pidha: "Pidha (tiered roof)", flat: "Flat-roof mandapa", none: "No porch" },
  crown: {
    "planetarium-dome": "Planetarium dome", "onion-dome": "Onion dome", "faceted-dome": "Faceted dome",
    shikhara: "Nagara shikhara", rekha: "Rekha deul", "triple-shikhara": "Three shikharas",
    pancharatna: "Pancharatna (five towers)", gopuram: "Gopuram", vimana: "Vimana", pyramid: "Pyramid roof",
  },
  corners: { chhatris: "Chhatris", spires: "Small spires", finials: "Kalash finials", none: "Plain" },
  finial: { kalash: "Kalash", "kalash-flag": "Kalash and flag", "chakra-flag": "Sudarshana chakra and flag" },
  stone: {
    "white-marble": "White marble", "buff-sandstone": "Buff sandstone", "pink-sandstone": "Pink sandstone",
    "red-sandstone": "Red sandstone", granite: "Granite", basalt: "Black stone", terracotta: "Terracotta brick",
  },
  finish: {
    stone: "Same stone", cobalt: "Cobalt tile", turquoise: "Turquoise tile", gold: "Gold",
    white: "Polished white", saffron: "Saffron", copper: "Copper",
  },
};

/** Swatch colours for the builder's buttons (sRGB hex), close to the rendered look. */
export const STONE_SWATCH: Record<StoneKind, string> = {
  "white-marble": "#f3f0ea", "buff-sandstone": "#d9bc96", "pink-sandstone": "#dfa48f",
  "red-sandstone": "#b8634a", granite: "#a8a39b", basalt: "#5d5955", terracotta: "#c0683e",
};
export const FINISH_SWATCH: Record<FinishKind, string | null> = {
  stone: null, cobalt: "#1f4a96", turquoise: "#2f9d97", gold: "#e8b04a",
  white: "#fbf9f5", saffron: "#e8762a", copper: "#c37a4c",
};

// ── The twelve families ───────────────────────────────────────────────────────

export interface Family {
  key: string;
  name: string;
  blurb: string;
  parts: Omit<TempleDesign, "v" | "preset" | "stone" | "finish">;
  stone: StoneKind;
  finish: FinishKind;
  /** The old four-style key this family is closest to, for the style column. */
  legacy: TempleStyle;
}

export const FAMILIES: readonly Family[] = [
  { key: "planetarium", name: "Vedic Planetarium", blurb: "A grand dome on a windowed drum, after the TOVP in Mayapur",
    parts: { base: "stepped", body: "hall", porch: "portico", crown: "planetarium-dome", corners: "chhatris", finial: "kalash" },
    stone: "white-marble", finish: "cobalt", legacy: "tovp-dome" },
  { key: "nagara", name: "Nagara Shikhara", blurb: "A curving tower clustered with smaller ones, as across North India",
    parts: { base: "stepped", body: "sanctum", porch: "mandapa", crown: "shikhara", corners: "spires", finial: "kalash-flag" },
    stone: "buff-sandstone", finish: "stone", legacy: "north-shikhara" },
  { key: "gopuram", name: "Dravida Gopuram", blurb: "Storeys of miniature shrines under a barrel vault, as in Tamil Nadu",
    parts: { base: "stepped", body: "pillared", porch: "flat", crown: "gopuram", corners: "none", finial: "kalash" },
    stone: "granite", finish: "stone", legacy: "south-gopuram" },
  { key: "modern", name: "Modern Vedic", blurb: "A clean faceted dome with gilded edges",
    parts: { base: "stepped", body: "hall", porch: "portico", crown: "faceted-dome", corners: "chhatris", finial: "kalash" },
    stone: "white-marble", finish: "white", legacy: "modern-vedic" },
  { key: "kalinga", name: "Kalinga Rekha Deul", blurb: "A tall ribbed tower and a tiered porch, as at Puri and Bhubaneswar",
    parts: { base: "high", body: "sanctum", porch: "pidha", crown: "rekha", corners: "none", finial: "chakra-flag" },
    stone: "buff-sandstone", finish: "stone", legacy: "north-shikhara" },
  { key: "vimana", name: "Dravida Vimana", blurb: "A square tiered tower under a domed stupi, after Thanjavur",
    parts: { base: "high", body: "pillared", porch: "flat", crown: "vimana", corners: "none", finial: "kalash" },
    stone: "granite", finish: "stone", legacy: "south-gopuram" },
  { key: "rajasthani", name: "Rajasthani Onion Dome", blurb: "A swelling onion dome and chhatris in pink stone",
    parts: { base: "stepped", body: "hall", porch: "portico", crown: "onion-dome", corners: "chhatris", finial: "kalash-flag" },
    stone: "pink-sandstone", finish: "white", legacy: "tovp-dome" },
  { key: "vrindavan", name: "Three Shikharas", blurb: "Three marble towers over one hall, as in Vrindavan",
    parts: { base: "stepped", body: "hall", porch: "portico", crown: "triple-shikhara", corners: "none", finial: "kalash-flag" },
    stone: "white-marble", finish: "white", legacy: "north-shikhara" },
  { key: "pancharatna", name: "Bengal Pancharatna", blurb: "Five towers over a brick sanctum, as in Bishnupur",
    parts: { base: "high", body: "sanctum", porch: "none", crown: "pancharatna", corners: "none", finial: "chakra-flag" },
    stone: "terracotta", finish: "stone", legacy: "north-shikhara" },
  { key: "himalayan", name: "Himalayan Stone", blurb: "Dark stone and a stepped pyramid roof, as in the high mountains",
    parts: { base: "high", body: "sanctum", porch: "flat", crown: "pyramid", corners: "finials", finial: "kalash" },
    stone: "basalt", finish: "stone", legacy: "north-shikhara" },
  { key: "kerala", name: "Kerala Srikovil", blurb: "A copper pyramid roof over a laterite sanctum",
    parts: { base: "stepped", body: "pillared", porch: "flat", crown: "pyramid", corners: "none", finial: "kalash" },
    stone: "terracotta", finish: "copper", legacy: "south-gopuram" },
  { key: "solanki", name: "Solanki Nagara", blurb: "A shikhara over a high carved plinth and a domed porch, after Somnath",
    parts: { base: "high", body: "sanctum", porch: "portico", crown: "shikhara", corners: "spires", finial: "kalash-flag" },
    stone: "buff-sandstone", finish: "stone", legacy: "north-shikhara" },
];

// ── Nine variants of each ─────────────────────────────────────────────────────
// Tried in this order; a variant that would repeat one the family already has
// (its own classic stone and finish, say) is skipped for the next.

const VARIANTS: ReadonlyArray<{ key: string; name: string; apply: (f: Family) => { stone: StoneKind; finish: FinishKind } }> = [
  { key: "classic", name: "Classic", apply: (f) => ({ stone: f.stone, finish: f.finish }) },
  { key: "gold", name: "Gold Crown", apply: (f) => ({ stone: f.stone, finish: "gold" }) },
  { key: "saffron", name: "Saffron Crown", apply: (f) => ({ stone: f.stone, finish: "saffron" }) },
  { key: "marble", name: "White Marble", apply: (f) => ({ stone: "white-marble", finish: f.finish === "stone" ? "white" : f.finish }) },
  { key: "pink", name: "Pink Sandstone", apply: (f) => ({ stone: "pink-sandstone", finish: f.finish }) },
  { key: "red", name: "Red Sandstone", apply: (f) => ({ stone: "red-sandstone", finish: f.finish }) },
  { key: "buff", name: "Buff Sandstone", apply: (f) => ({ stone: "buff-sandstone", finish: f.finish }) },
  { key: "granite", name: "Granite", apply: (f) => ({ stone: "granite", finish: f.finish }) },
  { key: "basalt", name: "Black Stone", apply: (f) => ({ stone: "basalt", finish: f.finish }) },
  { key: "cobalt", name: "Cobalt Crown", apply: (f) => ({ stone: f.stone, finish: "cobalt" }) },
  { key: "turquoise", name: "Turquoise Crown", apply: (f) => ({ stone: f.stone, finish: "turquoise" }) },
  { key: "copper", name: "Copper Crown", apply: (f) => ({ stone: f.stone, finish: "copper" }) },
  { key: "ivory", name: "Ivory Crown", apply: (f) => ({ stone: f.stone, finish: "white" }) },
];

export const VARIANTS_PER_FAMILY = 9;

export interface Preset {
  id: string;
  name: string;
  family: Family;
  variant: string;
  design: TempleDesign;
}

function buildPresets(): Preset[] {
  const out: Preset[] = [];
  for (const family of FAMILIES) {
    const seen = new Set<string>();
    for (const v of VARIANTS) {
      if (seen.size === VARIANTS_PER_FAMILY) break;
      const { stone, finish } = v.apply(family);
      const look = `${stone}/${finish}`;
      if (seen.has(look)) continue;
      seen.add(look);
      const id = `${family.key}-${v.key}`;
      out.push({
        id,
        name: v.key === "classic" ? family.name : `${family.name} · ${v.name}`,
        family,
        variant: v.name,
        design: { v: 1, ...family.parts, stone, finish, preset: id },
      });
    }
  }
  return out;
}

/** All 108 named styles, family by family. */
export const PRESETS: readonly Preset[] = buildPresets();

const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

export function presetById(id: string | null | undefined): Preset | undefined {
  return id ? PRESET_BY_ID.get(id) : undefined;
}

export const DEFAULT_DESIGN: TempleDesign = PRESETS[0].design;

/** The design a temple saved before designs existed is shown as. */
export function designForStyle(style: TempleStyle | null | undefined): TempleDesign {
  const family = FAMILIES.find((f) => f.key === ({
    "tovp-dome": "planetarium", "north-shikhara": "nagara", "south-gopuram": "gopuram", "modern-vedic": "modern",
  } as Record<string, string>)[style ?? ""]);
  return presetById(`${family?.key ?? "planetarium"}-classic`)!.design;
}

/** The old style column's value for a design: the closest of the four. */
export function legacyStyleOf(design: TempleDesign): TempleStyle {
  const family = presetById(design.preset)?.family ?? FAMILIES.find((f) => f.parts.crown === design.crown);
  return family?.legacy ?? "tovp-dome";
}

function pick<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * A design read back from the database or a link, made safe to build: any part
 * that is missing or not one of the known options falls back to the default's.
 * It came from a browser, so nothing in it is trusted.
 */
export function normalizeDesign(raw: unknown, fallback: TempleDesign = DEFAULT_DESIGN): TempleDesign {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const design: TempleDesign = {
    v: 1,
    base: pick(BASES, r.base, fallback.base),
    body: pick(BODIES, r.body, fallback.body),
    porch: pick(PORCHES, r.porch, fallback.porch),
    crown: pick(CROWNS, r.crown, fallback.crown),
    corners: pick(CORNERS, r.corners, fallback.corners),
    finial: pick(FINIALS, r.finial, fallback.finial),
    stone: pick(STONES, r.stone, fallback.stone),
    finish: pick(FINISHES, r.finish, fallback.finish),
  };
  const preset = typeof r.preset === "string" ? presetById(r.preset) : undefined;
  if (preset && sameParts(preset.design, design)) design.preset = preset.id;
  return design;
}

/** Whether two designs would build the same temple. */
export function sameParts(a: TempleDesign, b: TempleDesign): boolean {
  return a.base === b.base && a.body === b.body && a.porch === b.porch && a.crown === b.crown
    && a.corners === b.corners && a.finial === b.finial && a.stone === b.stone && a.finish === b.finish;
}

/** A design with one part changed. It is no longer the named style it was. */
export function withPart<K extends PartKey>(design: TempleDesign, part: K, value: TempleDesign[K]): TempleDesign {
  const next: TempleDesign = { ...design, [part]: value };
  const preset = presetById(design.preset);
  if (preset && !sameParts(preset.design, next)) next.preset = undefined;
  if (preset && sameParts(preset.design, next)) next.preset = preset.id;
  return next;
}

/** What to call a design: its style's name, or "Custom" with what it began as. */
export function designLabel(design: TempleDesign, basedOn?: string): string {
  const preset = presetById(design.preset);
  if (preset) return preset.name;
  const origin = presetById(basedOn);
  return origin ? `Custom · from ${origin.name}` : "Custom design";
}
