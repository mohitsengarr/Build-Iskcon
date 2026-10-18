// Geometry for the realistic temple.
//
// Two things separate a building from a toy here, and both are in this file.
//
// Bevels. A perfectly sharp box edge catches no light, so it reads as CG at a
// glance. Every block is extruded with a small bevel, which puts a thin
// highlight down every edge the way dressed stone has.
//
// One texel density. Marble slabs have to come out the same size on a step, a
// wall and a column, or the eye notices at once. ExtrudeGeometry already lays
// UVs out in world units; lathes get theirs rescaled to match. A material's
// texture.repeat then says, once, how big a slab is.

import {
  BufferAttribute, CatmullRomCurve3, ExtrudeGeometry, LatheGeometry, Matrix4, Path,
  PlaneGeometry, Shape, TubeGeometry, Vector2, Vector3, type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  archOutline, petalOutline, profileLength, ribbedScale, type Point,
} from "@/lib/templeGeometry";

/** A block w×h×d with bevelled edges, centred on the origin, UVs in world units. */
export function bevelledBox(w: number, h: number, d: number, bevel = 0.012): BufferGeometry {
  const b = Math.max(0, Math.min(bevel, w / 4, h / 4, d / 4));
  const shape = new Shape();
  shape.moveTo(-w / 2 + b, -d / 2 + b);
  shape.lineTo(w / 2 - b, -d / 2 + b);
  shape.lineTo(w / 2 - b, d / 2 - b);
  shape.lineTo(-w / 2 + b, d / 2 - b);
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, {
    depth: Math.max(0.0001, h - 2 * b),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 1,
  });
  // Extruded along +z; stand it up so the extrusion is the height.
  geo.rotateX(-Math.PI / 2);
  return centred(geo);
}

function centred(geo: BufferGeometry): BufferGeometry {
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  geo.translate(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -(box.min.z + box.max.z) / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Rescale a lathe's 0-1 UVs to world units: u around the widest circumference,
 * v along the profile. The top of a dome then gathers the texture slightly,
 * which is what courses of tile do on a real one.
 */
function toWorldUv(geo: BufferGeometry, around: number, along: number): BufferGeometry {
  const uv = geo.getAttribute("uv") as BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * around, uv.getY(i) * along);
  uv.needsUpdate = true;
  return geo;
}

/** A turned form from a [x, y] profile, standing on y = 0. */
export function latheFrom(points: readonly Point[], segments = 48, phiStart = 0): BufferGeometry {
  const geo = new LatheGeometry(points.map(([x, y]) => new Vector2(x, y)), segments, phiStart);
  const maxR = Math.max(...points.map(([x]) => x));
  return toWorldUv(geo, 2 * Math.PI * maxR, profileLength(points));
}

/**
 * A lathe with few sides and hard edges — a square shikhara, an octagonal
 * drum. A lathe averages its normals round the corners, which would shade a
 * square tower like a cushion; splitting the faces gives each its own.
 *
 * `halfWidth` profiles: x is the distance to the middle of a face, the way the
 * tower would be drawn in elevation, not to the corner.
 */
export function facetedLathe(points: readonly Point[], sides: number): BufferGeometry {
  const toCorner = 1 / Math.cos(Math.PI / sides);
  const corners = points.map(([x, y]): Point => [x * toCorner, y]);
  // phiStart of half a side puts a face, not a corner, towards +z.
  const geo = latheFrom(corners, sides, Math.PI / sides).toNonIndexed();
  geo.computeVertexNormals();
  return geo;
}

/** A turned form with vertical ribs, like an amalaka or a melon dome. */
export function ribbedLathe(points: readonly Point[], ribs: number, depth: number, segments = 96): BufferGeometry {
  const geo = latheFrom(points, segments);
  const pos = geo.getAttribute("position") as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const s = ribbedScale(Math.atan2(x, z), ribs, depth);
    pos.setXYZ(i, x * s, pos.getY(i), z * s);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** A ring of thin tubes following a dome's profile — the ribs of the dome. */
export function domeRibs(
  profile: readonly Point[],
  { count, offset = 0.006, radius = 0.012, phase = 0 }:
  { count: number; offset?: number; radius?: number; phase?: number },
): BufferGeometry {
  // Stop short of the apex, where every rib would meet in a knot.
  const path = profile.filter(([x]) => x > radius * 3);
  return merged(Array.from({ length: count }, (_, i) => {
    const a = phase + (i / count) * Math.PI * 2;
    const curve = new CatmullRomCurve3(
      path.map(([x, y]) => new Vector3(Math.sin(a) * (x + offset), y, Math.cos(a) * (x + offset))),
    );
    return new TubeGeometry(curve, Math.max(24, path.length), radius, 6, false);
  }));
}

/** A round-arched panel `depth` thick, standing on y = 0 and facing +z. */
export function archPanel(width: number, height: number, depth: number): BufferGeometry {
  const shape = new Shape(archOutline({ width, height, steps: 18 }).map(([x, y]) => new Vector2(x, y)));
  const geo = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 18 });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * The stone surround of an arched opening: an arch with an arch-shaped hole,
 * `border` wide, standing on y = 0 and facing +z. The glazing sits behind it,
 * so the opening reads as cut into the wall rather than painted on it.
 */
export function archFrame(width: number, height: number, border: number, depth: number): BufferGeometry {
  const outer = new Shape(archOutline({ width, height, steps: 20 }).map(([x, y]) => new Vector2(x, y)));
  const inner = archOutline({ width: width - 2 * border, height: height - border, steps: 20 });
  // Lift the hole off the sill a hair so the two outlines never share an edge.
  outer.holes.push(new Path(inner.map(([x, y]) => new Vector2(x, Math.max(y, 0.001)))));
  const geo = new ExtrudeGeometry(outer, {
    depth,
    bevelEnabled: true,
    bevelThickness: Math.min(0.006, depth / 4),
    bevelSize: Math.min(0.006, border / 4),
    bevelSegments: 1,
    curveSegments: 20,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/** A lotus petal `thickness` thick, standing on y = 0 and facing +z. */
export function petal(width: number, height: number, thickness: number): BufferGeometry {
  const shape = new Shape(petalOutline({ width, height }).map(([x, y]) => new Vector2(x, y)));
  const geo = new ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness / 3,
    bevelSize: Math.min(width, height) / 14,
    bevelSegments: 3,
    curveSegments: 12,
  });
  geo.translate(0, 0, -thickness / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A barrel vault — the wagon roof that crowns a gopuram — `length` long along
 * x, `radius` high, standing on y = 0.
 */
export function barrelVault(length: number, radius: number): BufferGeometry {
  const shape = new Shape(archOutline({ width: radius * 2, height: radius, steps: 20 }).map(([x, y]) => new Vector2(x, y)));
  const geo = new ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.015,
    bevelSegments: 2,
    curveSegments: 20,
  });
  geo.translate(0, 0, -length / 2);
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A pennant: a plane tapered to a point, with enough segments along its length
 * to ripple. Attached along x = 0, flying towards +x.
 */
export function pennant(length: number, height: number): BufferGeometry {
  const geo = new PlaneGeometry(length, height, 16, 4);
  geo.translate(length / 2, 0, 0);
  const pos = geo.getAttribute("position") as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / length;
    pos.setY(i, pos.getY(i) * (1 - u * 0.92));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export type Vec3 = readonly [number, number, number];

export interface Placement { rotationY?: number; rotationX?: number; scale?: number | Vec3 }

/** A copy of `geo` moved into place — for merging repeated parts into one mesh. */
export function placed(
  geo: BufferGeometry,
  [x, y, z]: Vec3,
  { rotationY = 0, rotationX = 0, scale = 1 }: Placement = {},
): BufferGeometry {
  const [sx, sy, sz] = typeof scale === "number" ? [scale, scale, scale] : scale;
  const m = new Matrix4()
    .makeTranslation(x, y, z)
    .multiply(new Matrix4().makeRotationY(rotationY))
    .multiply(new Matrix4().makeRotationX(rotationX))
    .multiply(new Matrix4().makeScale(sx, sy, sz));
  return geo.clone().applyMatrix4(m);
}

/**
 * Many parts of one material as one mesh, so a ring of twelve windows costs one
 * draw call, not twelve. Mixed indexed and non-indexed parts are evened out
 * first, which mergeGeometries otherwise refuses.
 */
export function merged(parts: BufferGeometry[]): BufferGeometry {
  const anyFlat = parts.some((g) => !g.index);
  const even = anyFlat ? parts.map((g) => (g.index ? g.toNonIndexed() : g)) : parts;
  const out = mergeGeometries(even, false);
  if (!out) throw new Error("temple geometry: parts could not be merged");
  return out;
}

/** Every face of a square building, as the offset and turn that faces +z there. */
export const FACES: ReadonlyArray<{ dir: [number, number]; rotationY: number }> = [
  { dir: [0, 1], rotationY: 0 },
  { dir: [1, 0], rotationY: Math.PI / 2 },
  { dir: [0, -1], rotationY: Math.PI },
  { dir: [-1, 0], rotationY: -Math.PI / 2 },
];

/** A round shaft with world-unit UVs, its foot on y = 0, capped at both ends. */
export function columnShaft(radiusTop: number, radiusBottom: number, height: number, segments = 20): BufferGeometry {
  return latheFrom([[0, 0], [radiusBottom, 0], [radiusTop, height], [0, height]], segments);
}
