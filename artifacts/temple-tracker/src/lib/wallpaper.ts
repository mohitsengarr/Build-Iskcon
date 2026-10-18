// The Krishna wallpaper (wall.bhagwatham.com): which painting and which verse
// are showing, and when they change.
//
// Every screen keeps the same clock. The day is cut into 15-minute slots
// counted from the Unix epoch, and the slot number picks the painting and the
// verse — so a phone, a laptop and a temple-hall TV showing the page all turn
// to the next darshan together, with no server telling them to.

export const SLOT_MS = 15 * 60 * 1000;

/** The 15-minute slot `now` falls in. */
export function slotAt(now: number): number {
  return Math.floor(now / SLOT_MS);
}

/** Milliseconds until the next slot begins — always more than zero. */
export function msUntilNextSlot(now: number): number {
  return SLOT_MS - (((now % SLOT_MS) + SLOT_MS) % SLOT_MS);
}

/** How far through its slot `now` is, from 0 to just under 1. */
export function slotProgress(now: number): number {
  return 1 - msUntilNextSlot(now) / SLOT_MS;
}

/** The item for a slot: walks the list in order and wraps round. */
export function pickForSlot<T>(items: readonly T[], slot: number): T | undefined {
  if (items.length === 0) return undefined;
  const n = items.length;
  return items[((slot % n) + n) % n];
}

export interface QuoteRow { chapter: number; verse: number; text: string; id?: number }
export interface Quote { chapter: number; verse: number; text: string; speaker: string }

/**
 * A logged quote as it should read on the wallpaper. The log keeps the post as
 * it went out: the verse, a blank line, "— Krishna", and on some days a line
 * about the app after it. Only the verse and its speaker belong on a wallpaper.
 */
export function cleanQuote(row: QuoteRow): Quote {
  const match = /\n\s*[—–-]\s*([^\n]+)/.exec(row.text);
  const body = (match ? row.text.slice(0, match.index) : row.text).trim();
  const speaker = match ? match[1].trim() : "Krishna";
  return { chapter: row.chapter, verse: row.verse, text: body.replace(/\s*\n\s*/g, " "), speaker };
}

/**
 * The verses to cycle through: one per chapter and verse — the most recently
 * logged wording wins — in the order of the Gita itself, so through a day the
 * wallpaper walks forward through the book.
 */
export function wallpaperQuotes(rows: readonly QuoteRow[]): Quote[] {
  const latest = new Map<string, QuoteRow>();
  for (const r of rows) {
    if (!r.text?.trim() || !Number.isFinite(r.chapter) || !Number.isFinite(r.verse)) continue;
    const key = `${r.chapter}.${r.verse}`;
    const seen = latest.get(key);
    if (!seen || (r.id ?? 0) >= (seen.id ?? 0)) latest.set(key, r);
  }
  return [...latest.values()]
    .map(cleanQuote)
    .filter((q) => q.text.length > 0)
    .sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);
}

/** Lines of text that fit `maxWidth`, breaking between words. */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const tryLine = line ? `${line} ${word}` : word;
    if (line && measure(tryLine) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = tryLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The largest of `sizes` (tried largest first) at which `text` wraps into
 * `maxWidth` and its lines fit `maxHeight`; failing all, the smallest. Used to
 * set a verse of any length into the fixed space under the painting.
 */
export function fitText(
  text: string,
  { maxWidth, maxHeight, sizes, lineHeight, measureAt }: {
    maxWidth: number; maxHeight: number; sizes: readonly number[]; lineHeight: number;
    measureAt: (size: number, s: string) => number;
  },
): { size: number; lines: string[] } {
  const ordered = [...sizes].sort((a, b) => b - a);
  let last = { size: ordered[ordered.length - 1] ?? 0, lines: [] as string[] };
  for (const size of ordered) {
    const lines = wrapLines(text, maxWidth, (s) => measureAt(size, s));
    last = { size, lines };
    if (lines.length * size * lineHeight <= maxHeight) return last;
  }
  return last;
}

/**
 * The part of a w×h image to draw so it covers a target of the given aspect
 * (width / height), centred as near `focusX` (0-1 across the image) as the
 * edges allow. What object-fit: cover with an object-position does, for canvas.
 */
export function coverCrop(
  w: number, h: number, targetAspect: number, focusX = 0.5,
): { sx: number; sy: number; sw: number; sh: number } {
  if (w / h > targetAspect) {
    const sw = h * targetAspect;
    const sx = Math.min(w - sw, Math.max(0, focusX * w - sw / 2));
    return { sx, sy: 0, sw, sh: h };
  }
  const sh = w / targetAspect;
  return { sx: 0, sy: (h - sh) / 2, sw: w, sh };
}

/**
 * The CSS object-position that puts a focus point (fx, fy, as fractions of the
 * image) in the middle of a box of `boxAspect` under object-fit: cover — or as
 * near the middle as the image's edges allow. A plain percentage does not do
 * this: "30%" lines up the image's 30% point with the box's 30% point, which
 * leaves a face a third of the way in, not centred.
 *
 * Also returns where the focus then sits in the box, for a zoom to grow from.
 */
export function coverPosition(
  fx: number, fy: number, imageAspect: number, boxAspect: number,
): { x: number; y: number; originX: number; originY: number } {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  // Size of the scaled image in box units along the axis that overflows.
  const place = (f: number, span: number) => {
    if (span <= 1 + 1e-9) return { pos: 0.5, at: f };
    const pos = clamp((f * span - 0.5) / (span - 1));
    return { pos, at: f * span + pos * (1 - span) };
  };
  const wide = imageAspect > boxAspect;
  const h = place(fx, wide ? imageAspect / boxAspect : 1);
  const v = place(fy, wide ? 1 : boxAspect / imageAspect);
  return { x: h.pos, y: v.pos, originX: h.at, originY: v.at };
}

const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * The app's index.html with its head rewritten for the wallpaper's own address,
 * so a link to wall.bhagwatham.com previews as the wallpaper and not as the
 * temple tracker. Link previews never run the app's JavaScript; this is all a
 * crawler sees.
 */
export function wallpaperHead(
  html: string,
  { title, description, image, imageSize, url, siteName, keywords }: {
    title: string; description: string; image: string; imageSize: [number, number];
    url: string; siteName: string; keywords: string;
  },
): string {
  const setMeta = (doc: string, attr: "name" | "property", key: string, value: string) => {
    const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*/?>`);
    const tag = `<meta ${attr}="${key}" content="${escAttr(value)}" />`;
    return re.test(doc) ? doc.replace(re, tag) : doc.replace("</head>", `    ${tag}\n  </head>`);
  };
  let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escAttr(title)}</title>`);
  const metas: Array<["name" | "property", string, string]> = [
    ["name", "description", description],
    ["name", "keywords", keywords],
    ["property", "og:site_name", siteName],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:image", image],
    ["property", "og:image:width", String(imageSize[0])],
    ["property", "og:image:height", String(imageSize[1])],
    ["property", "og:url", url],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description],
    ["name", "twitter:image", image],
  ];
  for (const [attr, key, value] of metas) out = setMeta(out, attr, key, value);
  const canonical = `<link rel="canonical" href="${escAttr(url)}" />`;
  out = /<link\s+rel="canonical"[^>]*>/.test(out)
    ? out.replace(/<link\s+rel="canonical"[^>]*>/, canonical)
    : out.replace("</head>", `    ${canonical}\n  </head>`);
  return out;
}
