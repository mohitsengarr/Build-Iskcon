// ── Procedural 3D temple (react-three-fiber) ───────────────────────────────────
// A lightweight, dependency-free (no GLTF/HDRI) temple built from primitives, in
// four architectural styles. Used on the landing hero and as the live preview in
// the "Design Your Temple" builder. Client-only (Vite SPA, no SSR).

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  AdaptiveDpr, Environment, Float, Lightformer,
  OrbitControls, PerformanceMonitor, SoftShadows,
} from "@react-three/drei";
import type { TempleStyle } from "@/lib/communityTemples";
import { roughnessTile, TILE_SIZE } from "@/lib/surfaceNoise";
import { groundShadowTile } from "@/lib/groundShadow";
import { Bloom, EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { BlendFunction, Effect, ToneMappingMode } from "postprocessing";
import { DEFAULT_PAGE_RGB, opaqueBackgroundBehind, srgbToLinear, type Rgb } from "@/lib/colorSpace";
import { fxSettings, initialFxLevel, stepDown, type FxLevel } from "@/lib/renderQuality";

const MARBLE = "#f4eddf";
const MARBLE_DK = "#e6dbc4";
const SAFFRON = "#c2410c";
const SAFFRON_DEEP = "#9a3412";
const GOLD = "#dcae52";
const STONE = "#e8dec8";

// ── Surface detail ────────────────────────────────────────────────────────────
// The grain itself lives in lib/surfaceNoise, seeded and tested. Here it is
// only painted into a canvas once and handed to the materials as a roughness
// map, so the stone keeps its colour and loses its glass-evenness.

/** THREE.RepeatWrapping, by value — three ships no types in this install. */
const REPEAT = 1000;

const NOISE_TILE: HTMLCanvasElement | null = (() => {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const grey = roughnessTile();
  const image = ctx.createImageData(TILE_SIZE, TILE_SIZE);
  for (let i = 0; i < grey.length; i++) {
    const p = i * 4;
    image.data[p] = image.data[p + 1] = image.data[p + 2] = grey[i];
    image.data[p + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
})();

/** The shared noise, tiled for one surface. */
function RoughnessNoise({ repeat = 3 }: { repeat?: number }) {
  if (!NOISE_TILE) return null;
  return (
    <canvasTexture
      attach="roughnessMap"
      args={[NOISE_TILE]}
      wrapS={REPEAT}
      wrapT={REPEAT}
      repeat={[repeat, repeat]}
      anisotropy={8}
    />
  );
}

// ── The ground ────────────────────────────────────────────────────────────────
// drei's ContactShadows used to ground the temple by rendering the scene from
// below into a render target every frame. Through the post-processing pipeline
// that plane came out far more opaque than it does on its own and drew a flat
// grey floor across the canvas — switching it off left the floor clean, which
// is how it was pinned. The ground is two plain transparent planes instead,
// which composite like any other material: a soft rounded square under the
// plinth, and a shadow catcher for the shadow the key light actually casts.

const SHADOW_TILE: HTMLCanvasElement | null = (() => {
  if (typeof document === "undefined") return null;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // The plinth is 3.7 wide on a 6-unit plane: half-width 0.31, fading over 0.6.
  const alpha = groundShadowTile(size, { half: 0.31, falloff: 0.1, strength: 0.45 });
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < alpha.length; i++) image.data[i * 4 + 3] = alpha[i];
  ctx.putImageData(image, 0, 0);
  return canvas;
})();

/** The soft shadow under the plinth, which grounds the temple from every side. */
function GroundShadow() {
  if (!SHADOW_TILE) return null;
  return (
    // Just above the shadow catcher, so the two never fight over the same depth.
    <mesh rotation-x={-Math.PI / 2} position={[0, -1.195, 0]} renderOrder={-1}>
      <planeGeometry args={[6, 6]} />
      <meshBasicMaterial color="#000000" transparent depthWrite={false} toneMapped={false}>
        <canvasTexture attach="map" args={[SHADOW_TILE]} />
      </meshBasicMaterial>
    </mesh>
  );
}

/**
 * Catches the key light's soft shadow and draws nothing else. It also writes
 * depth, so the occlusion pass has a real floor to work against instead of a
 * gap to the far plane.
 */
function ShadowCatcher() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -1.2, 0]} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <shadowMaterial transparent opacity={0.22} />
    </mesh>
  );
}

// ── Materials ─────────────────────────────────────────────────────────────────
// Three families, so every mesh of a kind reads the same. They are physical
// rather than standard materials because the scene now carries an environment:
// metalness and clearcoat only mean anything when there is something to
// reflect, which is why the gold read as flat mustard before.

/** Polished gold — leaf over metal, so a true metal with a faint lacquer coat. */
function GoldMat({ roughness = 0.22 }: { roughness?: number }) {
  return (
    <meshPhysicalMaterial
      color={GOLD}
      metalness={1}
      roughness={roughness}
      envMapIntensity={1.65}
      clearcoat={0.35}
      clearcoatRoughness={0.28}
    >
      {/* beaten leaf, not a mirror */}
      <RoughnessNoise repeat={5} />
    </meshPhysicalMaterial>
  );
}

/** Dressed stone and marble: not shiny, but it catches the sky. */
function StoneMat({ color = MARBLE, roughness = 0.7, flatShading = false }: {
  color?: string; roughness?: number; flatShading?: boolean;
}) {
  return (
    <meshPhysicalMaterial
      color={color}
      metalness={0}
      roughness={roughness}
      clearcoat={0.35}
      clearcoatRoughness={0.65}
      sheen={0.3}
      sheenColor="#fff3dd"
      sheenRoughness={0.85}
      envMapIntensity={0.85}
      flatShading={flatShading}
    >
      <RoughnessNoise repeat={4} />
    </meshPhysicalMaterial>
  );
}

/** Painted and pigmented surfaces — the saffron tiers and mouldings. */
function PaintMat({ color = SAFFRON, roughness = 0.55, metalness = 0, flatShading = false }: {
  color?: string; roughness?: number; metalness?: number; flatShading?: boolean;
}) {
  return (
    <meshPhysicalMaterial
      color={color}
      metalness={metalness}
      roughness={roughness}
      clearcoat={0.5}
      clearcoatRoughness={0.45}
      sheen={0.25}
      sheenColor="#ffd9b0"
      envMapIntensity={1.0}
      flatShading={flatShading}
    >
      <RoughnessNoise repeat={3} />
    </meshPhysicalMaterial>
  );
}

/** Gold finial (kalash) that crowns towers and spires. */
function Kalash({ y, scale = 1 }: { y: number; scale?: number }) {
  return (
    <group position={[0, y, 0]} scale={scale}>
      <mesh castShadow>
        <sphereGeometry args={[0.15, 20, 20]} />
        <GoldMat roughness={0.22} />
      </mesh>
      <mesh castShadow position={[0, 0.26, 0]}>
        <coneGeometry args={[0.045, 0.36, 16]} />
        <GoldMat roughness={0.18} />
      </mesh>
    </group>
  );
}

/** A simple round pillar with a square capital + base. */
function Pillar({ x, z, h = 1.1, r = 0.11 }: { x: number; z: number; h?: number; r?: number }) {
  return (
    <group position={[x, h / 2 + 0.44, z]}>
      <mesh castShadow>
        <cylinderGeometry args={[r, r * 1.15, h, 12]} />
        <StoneMat roughness={0.65} />
      </mesh>
      <mesh castShadow position={[0, h / 2 + 0.05, 0]}>
        <boxGeometry args={[r * 2.6, 0.1, r * 2.6]} />
        <StoneMat color={MARBLE_DK} roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, -h / 2 - 0.03, 0]}>
        <boxGeometry args={[r * 2.6, 0.08, r * 2.6]} />
        <StoneMat color={MARBLE_DK} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** Layered jagati (plinth), sanctum body, cornice, corner pillars, and an
 *  entrance mandapa (pillared porch) — shared across all styles. */
function Base() {
  return (
    <group>
      {/* stepped jagati */}
      <mesh receiveShadow castShadow position={[0, 0.08, 0]}>
        <boxGeometry args={[3.7, 0.16, 3.7]} />
        <StoneMat color={STONE} roughness={0.92} />
      </mesh>
      <mesh receiveShadow castShadow position={[0, 0.24, 0]}>
        <boxGeometry args={[3.3, 0.16, 3.3]} />
        <StoneMat color={MARBLE_DK} roughness={0.85} />
      </mesh>
      <mesh receiveShadow castShadow position={[0, 0.4, 0]}>
        <boxGeometry args={[2.95, 0.16, 2.95]} />
        <StoneMat roughness={0.8} />
      </mesh>

      {/* sanctum */}
      <mesh castShadow position={[0, 1.2, 0]}>
        <boxGeometry args={[2.0, 1.4, 2.0]} />
        <StoneMat roughness={0.68} />
      </mesh>
      {/* saffron cornice band */}
      <mesh castShadow position={[0, 1.98, 0]}>
        <boxGeometry args={[2.28, 0.2, 2.28]} />
        <PaintMat roughness={0.55} />
      </mesh>
      {/* corner pillars on the sanctum */}
      {[[0.86, 0.86], [-0.86, 0.86], [0.86, -0.86], [-0.86, -0.86]].map(([x, z], i) => (
        <Pillar key={i} x={x} z={z} h={1.15} />
      ))}

      {/* entrance mandapa (front porch, +z) */}
      <group position={[0, 0, 1.35]}>
        <mesh receiveShadow castShadow position={[0, 0.56, 0]}>
          <boxGeometry args={[1.5, 0.12, 0.9]} />
          <StoneMat roughness={0.8} />
        </mesh>
        <Pillar x={-0.55} z={0.32} h={0.9} r={0.09} />
        <Pillar x={0.55} z={0.32} h={0.9} r={0.09} />
        {/* porch roof */}
        <mesh castShadow position={[0, 1.5, 0.3]}>
          <boxGeometry args={[1.45, 0.14, 0.75]} />
          <PaintMat color={SAFFRON_DEEP} roughness={0.6} />
        </mesh>
        {/* pyramidal porch cap */}
        <mesh castShadow position={[0, 1.75, 0.3]}>
          <coneGeometry args={[0.72, 0.5, 4]} />
          <PaintMat roughness={0.55} />
        </mesh>
        {/* doorway */}
        <mesh position={[0, 1.02, -0.34]}>
          <boxGeometry args={[0.5, 0.9, 0.05]} />
          <PaintMat color={SAFFRON_DEEP} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

function CornerSpires({ height = 0.85 }: { height?: number }) {
  const d = 0.82;
  return (
    <group position={[0, 2.05, 0]}>
      {[[d, d], [-d, d], [d, -d], [-d, -d]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.02, 0.26, height, 6]} />
            <PaintMat color={SAFFRON_DEEP} roughness={0.6} />
          </mesh>
          <Kalash y={height / 2 + 0.04} scale={0.42} />
        </group>
      ))}
    </group>
  );
}

/** TOVP-style central dome: lotus-petal ring + ribbed hemisphere on a drum. */
function DomeCrown() {
  const petals = 12;
  return (
    <group position={[0, 2.08, 0]}>
      {/* drum */}
      <mesh castShadow position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.92, 1.02, 0.64, 32]} />
        <StoneMat roughness={0.58} />
      </mesh>
      {/* lotus-petal ring at dome spring line */}
      {Array.from({ length: petals }).map((_, i) => {
        const a = (i / petals) * Math.PI * 2;
        return (
          <mesh key={i} castShadow position={[Math.cos(a) * 0.9, 0.66, Math.sin(a) * 0.9]} rotation={[0, -a, 0.5]}>
            <coneGeometry args={[0.13, 0.34, 4]} />
            <GoldMat roughness={0.35} />
          </mesh>
        );
      })}
      {/* ribbed hemisphere dome */}
      <mesh castShadow position={[0, 0.68, 0]}>
        <sphereGeometry args={[0.95, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <PaintMat roughness={0.42} metalness={0.12} />
      </mesh>
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} castShadow position={[0, 0.68, 0]} rotation={[0, a, 0]}>
            <torusGeometry args={[0.955, 0.02, 6, 24, Math.PI]} />
            <PaintMat color={SAFFRON_DEEP} roughness={0.5} />
          </mesh>
        );
      })}
      {/* neck + kalash */}
      <mesh castShadow position={[0, 1.66, 0]}>
        <cylinderGeometry args={[0.16, 0.26, 0.28, 16]} />
        <GoldMat roughness={0.28} />
      </mesh>
      <Kalash y={1.98} />
    </group>
  );
}

/** North-Indian curvilinear shikhara + amalaka disc. */
function ShikharaCrown() {
  const tiers = [
    { r0: 1.0, r1: 0.8, h: 0.66, y: 0.33 },
    { r0: 0.8, r1: 0.6, h: 0.66, y: 0.98 },
    { r0: 0.6, r1: 0.4, h: 0.66, y: 1.6 },
    { r0: 0.4, r1: 0.2, h: 0.66, y: 2.18 },
  ];
  return (
    <group position={[0, 2.05, 0]}>
      {tiers.map((t, i) => (
        <group key={i}>
          <mesh castShadow position={[0, t.y, 0]}>
            <cylinderGeometry args={[t.r1, t.r0, t.h, 8]} />
            <PaintMat color={i % 2 === 0 ? SAFFRON : SAFFRON_DEEP} roughness={0.6} />
          </mesh>
          {/* horizontal moulding band */}
          <mesh castShadow position={[0, t.y + t.h / 2, 0]}>
            <cylinderGeometry args={[t.r1 * 1.06, t.r1 * 1.06, 0.06, 8]} />
            <StoneMat roughness={0.7} />
          </mesh>
        </group>
      ))}
      {/* amalaka (ribbed disc) */}
      <mesh castShadow position={[0, 2.6, 0]}>
        <torusGeometry args={[0.24, 0.11, 8, 16]} />
        <StoneMat color={MARBLE_DK} roughness={0.6} />
      </mesh>
      <Kalash y={2.86} />
    </group>
  );
}

/** South-Indian gopuram — stepped tapering tower with per-tier kalashes. */
function GopuramCrown() {
  const steps = 6;
  const items = Array.from({ length: steps }, (_, i) => {
    const t = i / steps;
    const w = 2.02 - t * 1.6;
    return { w, h: 0.42, y: 0.3 + i * 0.44, i };
  });
  return (
    <group position={[0, 2.05, 0]}>
      {items.map(({ w, h, y, i }) => (
        <group key={i}>
          <mesh castShadow position={[0, y, 0]}>
            <boxGeometry args={[w, h, w]} />
            <StoneMat color={i % 2 === 0 ? MARBLE : SAFFRON} roughness={0.7} />
          </mesh>
          <mesh castShadow position={[0, y + h / 2, 0]}>
            <boxGeometry args={[w * 1.04, 0.07, w * 1.04]} />
            <PaintMat color={SAFFRON_DEEP} roughness={0.6} />
          </mesh>
          {/* mini finials along each tier edge (front) */}
          <Kalash y={y + h / 2 + 0.02} scale={0.28} />
        </group>
      ))}
      <Kalash y={0.32 + steps * 0.44} scale={0.9} />
    </group>
  );
}

/** Modern faceted vedic dome. */
function ModernCrown() {
  return (
    <group position={[0, 2.08, 0]}>
      <mesh castShadow position={[0, 0.22, 0]}>
        <cylinderGeometry args={[1.05, 1.15, 0.36, 8]} />
        <StoneMat roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.95, 0]}>
        <icosahedronGeometry args={[1.0, 1]} />
        <PaintMat roughness={0.32} metalness={0.18} flatShading />
      </mesh>
      <Kalash y={2.08} />
    </group>
  );
}

/**
 * The light the temple sits in.
 *
 * An environment map, not just lamps. Metalness and clearcoat describe how a
 * surface reflects its surroundings, so without one the gold had nothing to be
 * gold with and came out flat mustard. This builds the surroundings out of
 * Lightformers — emissive shapes rendered to a small cube map — rather than
 * fetching an HDRI, so the page pulls nothing at runtime and works offline.
 *
 * Warm key from the upper right, cool sky fill, and a saffron rim behind, which
 * is what separates the silhouette from a cream background.
 */
function TempleLighting() {
  return (
    <Environment resolution={256} frames={1}>
      {/* the sky */}
      <Lightformer intensity={0.9} rotation-x={Math.PI / 2} position={[0, 6, -3]} scale={[12, 12, 1]} color="#fff6e8" />
      {/* warm key */}
      <Lightformer form="rect" intensity={3.4} position={[5, 5, 2]} scale={[4, 6, 1]} color="#ffe6bd" target={[0, 0, 0]} />
      {/* cool fill, so the shadow side is not dead */}
      <Lightformer form="rect" intensity={1.1} position={[-6, 2, 3]} scale={[5, 5, 1]} color="#dfe9ff" target={[0, 0, 0]} />
      {/* saffron rim */}
      <Lightformer form="ring" intensity={2.2} position={[-3, 3, -5]} scale={3} color="#ff9a52" target={[0, 0, 0]} />
      {/* ground bounce */}
      <Lightformer intensity={0.5} rotation-x={-Math.PI / 2} position={[0, -3, 0]} scale={[10, 10, 1]} color="#f3e3c6" />
    </Environment>
  );
}

/**
 * The last pass: composite the finished frame onto the page it sits on.
 *
 * The canvas is transparent so it can take its card's colour — but post effects
 * over transparency are ill-defined at the edges. Bloom adds light to pixels
 * whose alpha is zero, the browser composites those "brighter than their own
 * alpha" pixels as extra light, and on a phone that drew a white halo off the
 * sunlit plinth and a grey veil over the contact shadow's soft fringe. Doing the
 * "over" here, after tone mapping, hands the browser opaque, correctly blended
 * pixels, and the background comes out the exact colour of the card.
 *
 * The buffer is premultiplied — three blends onto a cleared target — so the
 * operator is rgb + page × (1 − a). Effects run in linear light before the
 * final sRGB encode, hence the page colour arrives in linear.
 */
/** The uniform type postprocessing's Effect expects — three's Uniform, which is
 *  structurally just a value and a clone(). Derived rather than imported,
 *  because three ships no types this package can see. */
type EffectUniform = NonNullable<NonNullable<ConstructorParameters<typeof Effect>[2]>["uniforms"]> extends Map<string, infer U> ? U : never;

function uniform(value: Rgb): EffectUniform {
  return { value, clone: () => uniform([...value] as Rgb) };
}

class FlattenOntoPageEffect extends Effect {
  constructor(pageLinear: Rgb) {
    super(
      "FlattenOntoPageEffect",
      /* glsl */ `
        uniform vec3 page;
        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          outputColor = vec4(inputColor.rgb + page * (1.0 - inputColor.a), 1.0);
        }
      `,
      // SRC: the result replaces what came in. The default, SCREEN, would
      // lighten the whole frame against itself.
      { blendFunction: BlendFunction.SRC, uniforms: new Map([["page", uniform(pageLinear)]]) },
    );
  }
}

/**
 * The finishing passes — igloo.inc's EffectComposer, scaled to a temple.
 *
 * Ambient occlusion first: the shadow that gathers where two surfaces meet —
 * under the cornice, between the pillars, where the drum sits on its base. It is
 * the cue the eye reads form by, and without it the temple read as parts stacked
 * on each other rather than one building. A radius of 0.6 because N8AO's default
 * of 5 is measured in world units and the whole temple is about three tall, and
 * a warm brown rather than black so the crevices stay inside the palette.
 *
 * Keep distanceFalloff LOW. The contact-shadow plane does not write depth, so
 * the pixels under the temple carry the far-plane depth; at falloff 1 the
 * temple's occlusion bled across that gap and the plane's whole footprint went
 * a flat grey. Low falloff means occlusion only from close surfaces — which is
 * exactly the crevice shadow this is for.
 *
 * Bloom on the brightest things only. The threshold is 1.0 — HDR, above white —
 * because at 0.9 the marble's clearcoat caught the key light and haloed the
 * sunlit edge of the plinth onto the page. Only the metal, reflecting a
 * Lightformer of intensity 3.4, gets that far, so it is the gold that glows.
 *
 * Tone mapping last, and not optional: the composer switches the renderer's own
 * tone mapping off while it runs, so without this the ACES curve would quietly
 * disappear and every highlight would clip.
 */
function TempleEffects({ level, page }: { level: FxLevel; page: Rgb }) {
  const fx = fxSettings(level);
  const flatten = useMemo(() => new FlattenOntoPageEffect(srgbToLinear(page)), [page]);
  useEffect(() => () => flatten.dispose(), [flatten]);
  if (!fx) return null;
  return (
    <EffectComposer multisampling={fx.multisampling}>
      <N8AO
        aoRadius={0.6}
        distanceFalloff={0.5}
        intensity={4}
        color="#3a2414"
        quality={fx.aoQuality}
        halfRes={fx.aoHalfRes}
      />
      <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.12} intensity={0.9} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <primitive object={flatten} />
    </EffectComposer>
  );
}

function Temple({ style }: { style: TempleStyle }) {
  const showCornerSpires = style === "tovp-dome" || style === "modern-vedic";
  return (
    <group position={[0, -1.15, 0]}>
      <Base />
      {showCornerSpires && <CornerSpires />}
      {style === "tovp-dome" && <DomeCrown />}
      {style === "north-shikhara" && <ShikharaCrown />}
      {style === "south-gopuram" && <GopuramCrown />}
      {style === "modern-vedic" && <ModernCrown />}
    </group>
  );
}

export interface ThreeTempleModelProps {
  style?: TempleStyle;
  className?: string;
  autoRotate?: boolean;
  interactive?: boolean;
}

export default function ThreeTempleModel({
  style = "tovp-dome",
  className,
  autoRotate = true,
  interactive = true,
}: ThreeTempleModelProps) {
  const [dpr, setDpr] = useState<number>(1.5);
  // The colour of the card the canvas sits in, read off the page so the
  // flatten pass matches it on every page the temple appears on.
  const frameRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<Rgb>(DEFAULT_PAGE_RGB);
  useEffect(() => {
    const rgb = opaqueBackgroundBehind(frameRef.current, (el) => getComputedStyle(el as Element).backgroundColor);
    setPage((prev) => (prev.every((v, i) => v === rgb[i]) ? prev : rgb));
  }, []);
  const [fxLevel, setFxLevel] = useState<FxLevel>(() =>
    typeof window === "undefined"
      ? "lite"
      : initialFxLevel({ width: window.innerWidth, dpr: window.devicePixelRatio }),
  );
  return (
    <div ref={frameRef} className={className} style={{ width: "100%", height: "100%" }}>
      <Canvas
        shadows
        dpr={dpr}
        camera={{ position: [4.4, 2.7, 5.4], fov: 40 }}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
        // r3f already renders through ACES Filmic tone mapping; this only opens
        // the exposure a little, so the marble keeps its highlights.
        onCreated={({ gl }) => { gl.toneMappingExposure = 1.08; }}
      >
        {/* Drop the pixel ratio rather than the frame rate when a device
            struggles: a soft-shadowed, environment-lit scene is heavier than
            what stood here before, and a phone should still turn smoothly. */}
        <PerformanceMonitor
          flipflops={3}
          onDecline={() => { setDpr(1); setFxLevel(stepDown); }}
          onIncline={() => setDpr(Math.min(1.75, window.devicePixelRatio))}
          onFallback={() => setFxLevel("off")}
        />
        <AdaptiveDpr />
        {/* No background of its own. Painting the cream here sent it through the
            composer's ACES pass, which pulls near-whites to a flat grey —
            (227, 226, 224) where the page is (251, 246, 238). The canvas clears
            transparent instead: with the effects off the page shows straight
            through, and with them on, the cleared alpha is what tells the final
            flatten pass where the background is. Fog still fades distant
            geometry toward the same cream. */}
        <fog attach="fog" args={["#fbf6ee", 11, 24]} />
        {/* Percentage-closer soft shadows: the shadow softens with distance from
            whatever casts it, the way a real one does. */}
        <SoftShadows size={26} samples={12} focus={0.7} />
        <ambientLight intensity={0.22} />
        <directionalLight
          position={[5, 8, 4]}
          intensity={2.1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.0005}
          shadow-normalBias={0.02}
          shadow-camera-near={0.5}
          shadow-camera-far={30}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
        />
        <directionalLight position={[-5, 3, -4]} intensity={0.5} color={SAFFRON} />
        <Suspense fallback={null}>
          <TempleLighting />
          <Float speed={1.1} rotationIntensity={0.12} floatIntensity={0.3}>
            <Temple style={style} />
          </Float>
          <GroundShadow />
          <ShadowCatcher />
          <TempleEffects level={fxLevel} page={page} />
        </Suspense>
        <OrbitControls
          enablePan={false}
          enableZoom={interactive}
          autoRotate={autoRotate}
          autoRotateSpeed={0.85}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.05}
          minDistance={4}
          maxDistance={9.5}
          enabled={interactive}
          target={[0, 0.2, 0]}
        />
      </Canvas>
    </div>
  );
}
