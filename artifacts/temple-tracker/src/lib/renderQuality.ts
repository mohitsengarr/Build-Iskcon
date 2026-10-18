// How much of the 3D temple's finishing to draw, on this device, right now.
//
// Ambient occlusion and bloom are full-screen passes on top of a scene that
// already carries soft shadows and an environment map, and the same component
// runs on a desktop and on a three-year-old phone. So the passes come in levels,
// and the device moves down them when it struggles — never back up, because a
// scene that flips between looks every few seconds is worse than either look.

export type FxLevel = "full" | "lite" | "off";

/** Below this width the page is laid out for a phone. */
export const PHONE_WIDTH = 768;
/** Above this pixel ratio a screen pushes enough pixels to start in the lighter level. */
export const DENSE_DPR = 2.5;

/**
 * Where to start, before anything has been measured. A phone or a very dense
 * screen starts light; PerformanceMonitor takes it from there.
 */
export function initialFxLevel({ width, dpr }: { width: number; dpr: number }): FxLevel {
  if (!Number.isFinite(width) || !Number.isFinite(dpr)) return "lite";
  return width < PHONE_WIDTH || dpr > DENSE_DPR ? "lite" : "full";
}

/** One step lighter. "off" is the floor: the scene still renders, just unfinished. */
export function stepDown(level: FxLevel): FxLevel {
  return level === "full" ? "lite" : "off";
}

export interface FxSettings {
  /** MSAA samples inside the composer — the canvas's own antialias stops applying there. */
  multisampling: number;
  /** N8AO quality preset. */
  aoQuality: "performance" | "low" | "medium" | "high" | "ultra";
  /**
   * Render the occlusion at half resolution and upsample it. Off at every level:
   * the upsampling smeared occlusion across the depth gap between the temple's
   * base and the far-plane pixels under the contact-shadow plane, and on a phone
   * that drew a flat grey slab under the temple. The lighter preset's fewer
   * samples are where a phone saves instead.
   */
  aoHalfRes: boolean;
}

/** What each level actually draws. Null means no composer at all. */
export function fxSettings(level: FxLevel): FxSettings | null {
  if (level === "off") return null;
  if (level === "lite") return { multisampling: 2, aoQuality: "performance", aoHalfRes: false };
  return { multisampling: 4, aoQuality: "medium", aoHalfRes: false };
}
