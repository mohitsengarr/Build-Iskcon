// The Bhaktigram mark on every image we store (owner, 2026-10-21): the lotus and
// "Bhaktigram", small in the bottom-right corner — about 2.2% of the image's
// height, 2.5% of its shorter side from the edges — so a copied image still says
// where it came from without the mark getting in the way of the painting.
//
// The image model's answer (base64 JPEG) is decoded, the mark pre-rendered at the
// right size (watermarkMarks.ts) is laid over it, and the result is encoded as
// JPEG for storage. The visual check looks at the image before it is marked.
//
// Marking runs in the watermark-image function: decoding and encoding a 1.4 MP
// JPEG takes ~280 ms of CPU, and a bulk run storing 10-50 images in one call would
// pass the edge runtime's CPU limit. The generators send each image there through
// _shared/watermarkClient.ts. watermarkBytes never throws and never loses an
// image: when marking fails the image's own bytes come back and it is logged.

import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { WATERMARK_MARKS } from "./watermarkMarks.ts";

export const MARK_HEIGHT_FRAC = 0.022;
export const MARGIN_FRAC = 0.025;
export const MIN_UNIT = 14;
export const MAX_UNIT = 36;
export const JPEG_QUALITY = 92;

/** The mark's unit height (the wordmark's size) for an image this tall. */
export function markUnit(imageHeight: number): number {
  return Math.min(MAX_UNIT, Math.max(MIN_UNIT, Math.round(imageHeight * MARK_HEIGHT_FRAC)));
}

/** Where the mark's top-left corner goes, or null when the image is too small to hold it. */
export function markPlacement(
  width: number,
  height: number,
  mark: { w: number; h: number },
): { x: number; y: number } | null {
  const margin = Math.round(Math.min(width, height) * MARGIN_FRAC);
  const x = width - mark.w - margin;
  const y = height - mark.h - margin;
  return x >= 0 && y >= 0 ? { x, y } : null;
}

export function base64Bytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const markImages = new Map<number, Promise<Image>>();
function markImage(unit: number): Promise<Image> {
  let img = markImages.get(unit);
  if (!img) {
    img = Image.decode(base64Bytes(WATERMARK_MARKS[unit].png)) as Promise<Image>;
    markImages.set(unit, img);
  }
  return img;
}

/**
 * An image with the mark laid over its bottom-right corner, as JPEG, and whether
 * it was marked. Never throws: an image that cannot be decoded, or is too small
 * for the mark, comes back as it was.
 */
export async function watermarkBytes(
  original: Uint8Array,
  log: (line: string) => void = console.log,
): Promise<{ bytes: Uint8Array; marked: boolean }> {
  try {
    const image = await Image.decode(original) as Image;
    const unit = markUnit(image.height);
    const spec = WATERMARK_MARKS[unit];
    const at = spec ? markPlacement(image.width, image.height, spec) : null;
    if (!at) {
      log(`[watermark] ${image.width}x${image.height} too small for the mark; stored without it`);
      return { bytes: original, marked: false };
    }
    image.composite(await markImage(unit), at.x, at.y);
    return { bytes: await image.encodeJPEG(JPEG_QUALITY), marked: true };
  } catch (e) {
    log(`[watermark] not marked, stored as rendered: ${e}`);
    return { bytes: original, marked: false };
  }
}

/**
 * How strongly the mark seems to be there already: the wordmark's pixels (white
 * in the mark) against the mark's empty pixels around them, as mean luminance
 * difference. A marked image has near-white text over its own background (well
 * over MARKED_CONTRAST on all but very bright corners); an unmarked one has no
 * such pattern. Pure: RGBA bitmaps in, number out.
 */
export const MARKED_CONTRAST = 45;
export function markContrast(
  image: { width: number; height: number; bitmap: Uint8Array | Uint8ClampedArray },
  mark: { width: number; height: number; bitmap: Uint8Array | Uint8ClampedArray },
  at: { x: number; y: number },
): number {
  const lum = (b: Uint8Array | Uint8ClampedArray, i: number) => 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
  let text = 0, nText = 0, empty = 0, nEmpty = 0;
  for (let my = 0; my < mark.height; my++) {
    for (let mx = 0; mx < mark.width; mx++) {
      const mi = (my * mark.width + mx) * 4;
      const ix = at.x + mx, iy = at.y + my;
      if (ix < 0 || iy < 0 || ix >= image.width || iy >= image.height) continue;
      const ii = (iy * image.width + ix) * 4;
      const a = mark.bitmap[mi + 3];
      if (a >= 150 && mark.bitmap[mi] >= 200 && mark.bitmap[mi + 1] >= 200 && mark.bitmap[mi + 2] >= 200) {
        text += lum(image.bitmap, ii); nText++;
      } else if (a === 0) {
        empty += lum(image.bitmap, ii); nEmpty++;
      }
    }
  }
  return nText && nEmpty ? text / nText - empty / nEmpty : 0;
}

/**
 * For stamping an image stored before the watermark existed: the image with the
 * mark, or alreadyMarked when it seems to carry one (never marked twice).
 */
export async function stampBytes(
  original: Uint8Array,
  log: (line: string) => void = console.log,
): Promise<{ bytes: Uint8Array; marked: boolean; alreadyMarked: boolean }> {
  try {
    const image = await Image.decode(original) as Image;
    const unit = markUnit(image.height);
    const spec = WATERMARK_MARKS[unit];
    const at = spec ? markPlacement(image.width, image.height, spec) : null;
    if (!at) return { bytes: original, marked: false, alreadyMarked: false };
    const mark = await markImage(unit);
    if (markContrast(image, mark, at) > MARKED_CONTRAST) return { bytes: original, marked: false, alreadyMarked: true };
    image.composite(mark, at.x, at.y);
    return { bytes: await image.encodeJPEG(JPEG_QUALITY), marked: true, alreadyMarked: false };
  } catch (e) {
    log(`[watermark] could not stamp: ${e}`);
    return { bytes: original, marked: false, alreadyMarked: false };
  }
}

/** watermarkBytes for a base64 image (the image model's answer). */
export async function watermarkedJpeg(b64: string, log: (line: string) => void = console.log): Promise<Uint8Array> {
  return (await watermarkBytes(base64Bytes(b64), log)).bytes;
}

/** Only a file in this project's public storage, never another host or a path that climbs out. */
export function isOwnStorageUrl(url: unknown, prefix: string): url is string {
  return typeof url === "string" && url.startsWith(prefix) && !url.slice(prefix.length).includes("..");
}
