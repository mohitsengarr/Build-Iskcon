// The temple's materials, made from photographed surfaces rather than flat
// colours. A flat colour is what made the old temple read as a toy: real marble
// has veins and a polish that varies across a slab, and real sandstone has
// courses and grain. These come from Poly Haven scans (CC0; see
// public/3d/SOURCES.txt), so the texture is the material, not a guess at it.

import { useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import {
  DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace,
  Vector2, type Material, type Texture,
} from "three";
import type { FinishKind, StoneKind } from "@/lib/templeDesign";
import type { Stuff } from "./kit";

const BASE = `${import.meta.env.BASE_URL}3d/textures/`;

export const TEXTURE_URLS = {
  marbleWhite: `${BASE}marble-white.jpg`,
  marbleBeige: `${BASE}marble-beige.jpg`,
  marbleRough: `${BASE}marble-rough.jpg`,
  sandstone: `${BASE}sandstone.jpg`,
  sandstoneNormal: `${BASE}sandstone-normal.jpg`,
  sandstoneRough: `${BASE}sandstone-rough.jpg`,
} as const;

/**
 * How big one tile of each scan is, in scene units. The temple is about four
 * units tall; a marble slab of a bit over a unit and stone courses of about a
 * tenth read at the right scale for a building that size.
 */
const TILE = { marble: 1.3, sandstone: 1.1, glazeTile: 0.32 } as const;

function tiled(tex: Texture, size: number, colour = false): Texture {
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(1 / size, 1 / size);
  tex.anisotropy = 8;
  if (colour) tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** A material for every role a part can play (kit.ts), plus the flag's cloth. */
export type TempleMaterials = Record<Stuff, Material> & { cloth: Material };

/**
 * Each stone as a tint over one of the two scans. The sandstone scan's courses
 * read as stone blocks in buff, pink, red, grey and black, and as brick in
 * terracotta; marble is its own scan. Trim — plinths, frames, mouldings — is
 * beige marble with white marble, and a shade darker of the same stone with
 * every other.
 */
const STONE_TINT: Record<StoneKind, { tint: string; trim: string; normal: number }> = {
  "white-marble": { tint: "#fbf9f5", trim: "#fff4e4", normal: 0 },
  "buff-sandstone": { tint: "#ffd6b0", trim: "#e9bf98", normal: 0.9 },
  "pink-sandstone": { tint: "#ffc0aa", trim: "#e6a48e", normal: 0.85 },
  "red-sandstone": { tint: "#e08466", trim: "#c46c52", normal: 0.9 },
  granite: { tint: "#c9c4bc", trim: "#b3aea6", normal: 1 },
  basalt: { tint: "#7d7873", trim: "#6a6560", normal: 1 },
  terracotta: { tint: "#e88c5a", trim: "#cf7748", normal: 1.1 },
};

export function useTempleMaterials(stone: StoneKind, finish: FinishKind): TempleMaterials {
  const maps = useTexture(TEXTURE_URLS);
  const materials = useMemo<TempleMaterials>(() => {
    const marbleWhite = tiled(maps.marbleWhite, TILE.marble, true);
    const marbleBeige = tiled(maps.marbleBeige, TILE.marble, true);
    const marbleRough = tiled(maps.marbleRough, TILE.marble);
    const sandstone = tiled(maps.sandstone, TILE.sandstone, true);
    const sandstoneNormal = tiled(maps.sandstoneNormal, TILE.sandstone);
    const sandstoneRough = tiled(maps.sandstoneRough, TILE.sandstone);
    // The same course pattern, much smaller, gives a dome its tiles.
    const tileNormal = tiled(maps.sandstoneNormal.clone(), TILE.glazeTile);

    const stoneOf = (kind: StoneKind, which: "tint" | "trim"): MeshPhysicalMaterial => {
      const t = STONE_TINT[kind];
      if (kind === "white-marble") {
        // White marble reflects about 0.83 of the light on it: the scan's 0.87
        // by this tint. Its roughness averages 0.5; scaled by 0.55 that is
        // honed marble, matte up close but holding a soft sheen of sky.
        return which === "tint"
          ? new MeshPhysicalMaterial({ map: marbleWhite, roughnessMap: marbleRough, roughness: 0.55, color: t.tint, clearcoat: 0.2, clearcoatRoughness: 0.35 })
          : new MeshPhysicalMaterial({ map: marbleBeige, roughnessMap: marbleRough, roughness: 0.7, color: t.trim, clearcoat: 0.1, clearcoatRoughness: 0.5 });
      }
      return new MeshPhysicalMaterial({
        map: sandstone, normalMap: sandstoneNormal, normalScale: new Vector2(t.normal, t.normal),
        roughnessMap: sandstoneRough, roughness: 1, color: which === "tint" ? t.tint : t.trim,
      });
    };

    const walls = stoneOf(stone, "tint");
    const trim = stoneOf(stone, "trim");
    // Gold's own reflectance (0.99, 0.78, 0.34 in linear light), a shade warmer
    // for leaf over metal; the marble roughness varies the polish across it.
    const gold = new MeshPhysicalMaterial({
      color: "#f5b84a", metalness: 1, roughnessMap: marbleRough, roughness: 0.42,
      clearcoat: 0.25, clearcoatRoughness: 0.2,
    });
    const glazed = (color: string) => new MeshPhysicalMaterial({
      color, roughness: 0.28, normalMap: tileNormal, normalScale: new Vector2(0.35, 0.35),
      clearcoat: 1, clearcoatRoughness: 0.06,
    });
    const finishes: Record<Exclude<FinishKind, "stone" | "gold">, () => MeshPhysicalMaterial> = {
      cobalt: () => glazed("#1f4a96"),
      turquoise: () => glazed("#2f9d97"),
      white: () => new MeshPhysicalMaterial({
        map: marbleWhite, roughnessMap: marbleRough, roughness: 0.3, color: "#fdfbf8",
        clearcoat: 0.8, clearcoatRoughness: 0.12,
      }),
      // Lime plaster painted saffron: the stone's courses faintly through it.
      saffron: () => new MeshPhysicalMaterial({
        color: "#ec7a2c", roughness: 0.62, normalMap: sandstoneNormal, normalScale: new Vector2(0.25, 0.25),
        clearcoat: 0.25, clearcoatRoughness: 0.5,
      }),
      copper: () => new MeshPhysicalMaterial({
        color: "#d08a5a", metalness: 1, roughnessMap: marbleRough, roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.4,
      }),
    };
    const crown = finish === "stone" ? walls : finish === "gold" ? gold : finishes[finish]();

    const glass = new MeshPhysicalMaterial({
      color: "#15181d", roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02,
      reflectivity: 0.6,
    });
    const shade = new MeshStandardMaterial({ color: "#2a211b", roughness: 0.95 });
    const wood = new MeshPhysicalMaterial({
      color: "#6a3d22", roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.4,
    });
    const cloth = new MeshStandardMaterial({ color: "#f06a1a", roughness: 0.85, side: DoubleSide });
    return { stone: walls, trim, crown, metal: gold, glass, shade, wood, cloth };
  }, [maps, stone, finish]);
  useEffect(() => () => {
    // A crown "in the same stone" is the walls' own material: free it once.
    for (const m of new Set(Object.values(materials))) m.dispose();
  }, [materials]);
  return materials;
}

/** Fetch the scans before the temple mounts, so it appears whole. */
export function preloadTempleTextures() {
  useTexture.preload(Object.values(TEXTURE_URLS));
}
