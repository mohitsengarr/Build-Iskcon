// The temple's materials, made from photographed surfaces rather than flat
// colours. A flat colour is what made the old temple read as a toy: real marble
// has veins and a polish that varies across a slab, and real sandstone has
// courses and grain. These come from Poly Haven scans (CC0; see
// public/3d/SOURCES.txt), so the texture is the material, not a guess at it.

import { useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import {
  DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace,
  Vector2, type Texture,
} from "three";

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

export interface TempleMaterials {
  /** White marble walls, columns and drums. */
  marble: MeshPhysicalMaterial;
  /** Polished white marble — the modern dome. */
  marblePolished: MeshPhysicalMaterial;
  /** Warm beige marble for plinths, cornices and mouldings. */
  marbleTrim: MeshPhysicalMaterial;
  /** Buff Rajasthani sandstone, for the Nagara temple. */
  sandstone: MeshPhysicalMaterial;
  /** Weathered grey granite, for the Dravidian temple. */
  granite: MeshPhysicalMaterial;
  /** Gilded metal — kalash, ribs, petals. */
  gold: MeshPhysicalMaterial;
  /** Cobalt glazed tile, for the TOVP's domes. */
  glaze: MeshPhysicalMaterial;
  /** Window glass: dark, and reflecting the sky. */
  glass: MeshPhysicalMaterial;
  /** The dark of a niche or an open doorway, seen from outside in daylight. */
  shade: MeshStandardMaterial;
  /** Teak doors. */
  wood: MeshPhysicalMaterial;
  /** Saffron cloth, for the flag. */
  cloth: MeshStandardMaterial;
}

export function useTempleMaterials(): TempleMaterials {
  const maps = useTexture(TEXTURE_URLS);
  const materials = useMemo<TempleMaterials>(() => {
    const marbleWhite = tiled(maps.marbleWhite, TILE.marble, true);
    const marbleBeige = tiled(maps.marbleBeige, TILE.marble, true);
    const marbleRough = tiled(maps.marbleRough, TILE.marble);
    const sandstone = tiled(maps.sandstone, TILE.sandstone, true);
    const sandstoneNormal = tiled(maps.sandstoneNormal, TILE.sandstone);
    const sandstoneRough = tiled(maps.sandstoneRough, TILE.sandstone);
    // The same course pattern, much smaller, gives the dome its tiles.
    const tileNormal = tiled(maps.sandstoneNormal.clone(), TILE.glazeTile);

    // White marble reflects about 0.83 of the light on it: the scan's 0.87 by
    // this tint. Its roughness averages 0.5; scaled by 0.55 that is honed
    // marble, matte up close but holding a soft sheen of sky.
    const marble = new MeshPhysicalMaterial({
      map: marbleWhite, roughnessMap: marbleRough, roughness: 0.55, color: "#fbf9f5",
      clearcoat: 0.2, clearcoatRoughness: 0.35,
    });
    const marblePolished = new MeshPhysicalMaterial({
      map: marbleWhite, roughnessMap: marbleRough, roughness: 0.3, color: "#fdfbf8",
      clearcoat: 0.8, clearcoatRoughness: 0.12,
    });
    const marbleTrim = new MeshPhysicalMaterial({
      map: marbleBeige, roughnessMap: marbleRough, roughness: 0.7, color: "#fff4e4",
      clearcoat: 0.1, clearcoatRoughness: 0.5,
    });
    const sandstoneMat = new MeshPhysicalMaterial({
      map: sandstone, normalMap: sandstoneNormal, normalScale: new Vector2(0.9, 0.9),
      roughnessMap: sandstoneRough, roughness: 1, color: "#ffd6b0",
    });
    const granite = new MeshPhysicalMaterial({
      map: sandstone, normalMap: sandstoneNormal, normalScale: new Vector2(1, 1),
      roughnessMap: sandstoneRough, roughness: 1, color: "#c9c4bc",
    });
    // Gold's own reflectance (0.99, 0.78, 0.34 in linear light), a shade warmer
    // for leaf over metal; the marble roughness varies the polish across it.
    const gold = new MeshPhysicalMaterial({
      color: "#f5b84a", metalness: 1, roughnessMap: marbleRough, roughness: 0.42,
      clearcoat: 0.25, clearcoatRoughness: 0.2,
    });
    const glaze = new MeshPhysicalMaterial({
      color: "#1f4a96", roughness: 0.28, normalMap: tileNormal, normalScale: new Vector2(0.35, 0.35),
      clearcoat: 1, clearcoatRoughness: 0.06,
    });
    const glass = new MeshPhysicalMaterial({
      color: "#15181d", roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02,
      reflectivity: 0.6,
    });
    const shade = new MeshStandardMaterial({ color: "#2a211b", roughness: 0.95 });
    const wood = new MeshPhysicalMaterial({
      color: "#6a3d22", roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.4,
    });
    const cloth = new MeshStandardMaterial({ color: "#f06a1a", roughness: 0.85, side: DoubleSide });
    return {
      marble, marblePolished, marbleTrim, sandstone: sandstoneMat, granite,
      gold, glaze, glass, shade, wood, cloth,
    };
  }, [maps]);
  useEffect(() => () => {
    for (const m of Object.values(materials)) m.dispose();
  }, [materials]);
  return materials;
}

/** Fetch the scans before the temple mounts, so it appears whole. */
export function preloadTempleTextures() {
  useTexture.preload(Object.values(TEXTURE_URLS));
}
