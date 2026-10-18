// ── The 3D temple (react-three-fiber) ───────────────────────────────────────
// A temple in four architectural styles, used on the landing hero and as the
// live preview in the "Design Your Temple" builder. Client-only (Vite SPA).
//
// It is built to look photographed rather than modelled: scanned marble and
// sandstone (temple3d/materials), bevelled stone and real architectural parts
// (temple3d/styles), lit by a captured sky with the sun cast as a real,
// shadowing light, and finished with occlusion, bloom and filmic tone mapping.

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  AdaptiveDpr, Environment, OrbitControls, PerformanceMonitor, SoftShadows, useEnvironment,
} from "@react-three/drei";
import type { BufferAttribute, Material } from "three";
import type { TempleStyle } from "@/lib/communityTemples";
import { designForStyle, type TempleDesign } from "@/lib/templeDesign";
import { groundShadowTile } from "@/lib/groundShadow";
import { sunDirection } from "@/lib/templeGeometry";
import { Bloom, EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { BlendFunction, Effect, ToneMappingMode } from "postprocessing";
import { DEFAULT_PAGE_RGB, opaqueBackgroundBehind, srgbToLinear, type Rgb } from "@/lib/colorSpace";
import { fxSettings, initialFxLevel, stepDown, type FxLevel } from "@/lib/renderQuality";
import { preloadTempleTextures, useTempleMaterials } from "./temple3d/materials";
import { buildTemple, PLINTH_WIDTH } from "./temple3d/styles";
import { pennant } from "./temple3d/geometry";

// ── The light ────────────────────────────────────────────────────────────────
// A captured sky (Poly Haven's Kloofendal, partly cloudy) lights the temple
// from every direction: blue from above, the clouds' white, the dimmer ground.
// Its sun has been taken out of the file — a sun inside an environment map
// lights everything but casts no shadow — and put back as a directional light
// along the same line, carrying the same irradiance. See public/3d/SOURCES.txt.

const SKY_URL = `${import.meta.env.BASE_URL}3d/hdri/kloofendal-sky-512.hdr`;
const SUN = {
  direction: sunDirection(48.2, 34.2),
  /** The irradiance the sun's pixels carried in the sky file. */
  irradiance: 4.38,
  colour: "#fefff4",
};
/**
 * One scale for the sky and the sun together, so their balance stays the one
 * the photograph had — about two to one on level ground, a bright, partly
 * cloudy day. At 0.7 sunlit white marble measured (199, 201, 200): grey. At
 * 1.1 it lands in the top of the tone curve, where white stone in sun sits in
 * a photograph.
 */
const EXPOSURE = 1.1;
/**
 * Sunlight bouncing back up off the ground. The sky file is a pure sky with no
 * ground in it, so without this the shaded walls and the undersides of every
 * eave got only the dim blue of the lower sky. Ground of albedo 0.3 under this
 * sun and sky glows at about 0.46; a wall facing out takes half of that
 * hemisphere, a soffit all of it — which is what a hemisphere light lit only
 * from below gives, at this intensity.
 */
const GROUND_BOUNCE = { colour: "#ecdcc0", intensity: 1.44 };

/** The ground the temple stands on, in scene units. */
const GROUND_Y = -1.2;

useEnvironment.preload({ files: SKY_URL });
preloadTempleTextures();

// ── The ground ────────────────────────────────────────────────────────────────
// drei's ContactShadows used to ground the temple by rendering the scene from
// below into a render target every frame. Through the post-processing pipeline
// that plane came out far more opaque than it does on its own and drew a flat
// grey floor across the canvas — switching it off left the floor clean, which
// is how it was pinned. The ground is two plain transparent planes instead,
// which composite like any other material: a soft rounded square under the
// plinth, and a shadow catcher for the shadow the sun actually casts.

const SHADOW_TILE: HTMLCanvasElement | null = (() => {
  if (typeof document === "undefined") return null;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // The plinth on a 6-unit plane, as a fraction of it, fading over 0.6 units.
  const alpha = groundShadowTile(size, { half: PLINTH_WIDTH / 2 / 6, falloff: 0.1, strength: 0.45 });
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
    <mesh rotation-x={-Math.PI / 2} position={[0, GROUND_Y + 0.005, 0]} renderOrder={-1}>
      <planeGeometry args={[6, 6]} />
      <meshBasicMaterial color="#000000" transparent depthWrite={false} toneMapped={false}>
        <canvasTexture attach="map" args={[SHADOW_TILE]} />
      </meshBasicMaterial>
    </mesh>
  );
}

/**
 * Catches the sun's soft shadow and draws nothing else. It also writes
 * depth, so the occlusion pass has a real floor to work against instead of a
 * gap to the far plane.
 */
function ShadowCatcher() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, GROUND_Y, 0]} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <shadowMaterial transparent opacity={0.3} />
    </mesh>
  );
}

// ── The building ──────────────────────────────────────────────────────────────

/** The saffron flag on the pinnacle, rippling in the wind, at the crown's scale. */
function Flag({ top, scale, material }: { top: readonly [number, number, number]; scale: number; material: Material }) {
  const length = 0.42;
  const geo = useMemo(() => pennant(length, 0.24), []);
  const rest = useMemo(() => Float32Array.from(geo.getAttribute("position").array), [geo]);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pos = geo.getAttribute("position") as BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const u = rest[i * 3] / length;               // 0 at the pole, 1 at the tip
      pos.setZ(i, u * (Math.sin(u * 7 - t * 3.2) * 0.03 + Math.sin(u * 3 - t * 1.7) * 0.015));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });
  return (
    <mesh geometry={geo} material={material} position={[top[0], top[1] - 0.12 * scale, top[2]]} rotation-y={-0.6} scale={scale} castShadow />
  );
}

function Temple({ design }: { design: TempleDesign }) {
  const materials = useTempleMaterials(design.stone, design.finish);
  // Rebuilt only when a part changes, not on every render of the builder page.
  const key = `${design.base}/${design.body}/${design.porch}/${design.crown}/${design.corners}/${design.finial}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const parts = useMemo(() => buildTemple(design), [key]);
  useEffect(() => () => { for (const [, g] of parts.meshes) g.dispose(); }, [parts]);
  return (
    <group position={[0, GROUND_Y, 0]}>
      {parts.meshes.map(([stuff, geo]) => (
        <mesh key={stuff} geometry={geo} material={materials[stuff]} castShadow receiveShadow />
      ))}
      {parts.flag && <Flag top={parts.flag.top} scale={parts.flag.scale} material={materials.cloth} />}
    </group>
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
 * Bloom on the brightest things only. The threshold is 1.6 — HDR, well above
 * white — because a sunlit marble roof reaches about 1.3 at this exposure, and
 * anything lower haloes the stone onto the page. Only the sun's glint off the
 * gold and the glazed dome gets that far, so it is the metal and tile that
 * sparkle.
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
      <Bloom mipmapBlur luminanceThreshold={1.6} luminanceSmoothing={0.12} intensity={0.9} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <primitive object={flatten} />
    </EffectComposer>
  );
}

export interface ThreeTempleModelProps {
  /** A temple saved before designs existed: shown as its style's family. */
  style?: TempleStyle;
  /** The temple part by part; wins over `style`. */
  design?: TempleDesign;
  className?: string;
  autoRotate?: boolean;
  interactive?: boolean;
}

export default function ThreeTempleModel({
  style = "tovp-dome",
  design,
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
        camera={{ position: [5.6, 4.1, 6.9], fov: 40 }}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
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
        {/* The sun, along the line it shone from in the sky file. */}
        <directionalLight
          position={[SUN.direction[0] * 14, SUN.direction[1] * 14, SUN.direction[2] * 14]}
          intensity={SUN.irradiance * EXPOSURE}
          color={SUN.colour}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
          shadow-camera-near={4}
          shadow-camera-far={26}
          shadow-camera-left={-5}
          shadow-camera-right={5}
          shadow-camera-top={5}
          shadow-camera-bottom={-5}
        />
        <hemisphereLight args={["#000000", GROUND_BOUNCE.colour, GROUND_BOUNCE.intensity * EXPOSURE]} />
        <Suspense fallback={null}>
          {/* The sky lights the scene but is not drawn: the page stays the backdrop. */}
          <Environment files={SKY_URL} environmentIntensity={EXPOSURE} />
          <Temple design={design ?? designForStyle(style)} />
          <GroundShadow />
          <ShadowCatcher />
          <TempleEffects level={fxLevel} page={page} />
        </Suspense>
        <OrbitControls
          enablePan={false}
          enableZoom={interactive}
          autoRotate={autoRotate}
          autoRotateSpeed={0.5}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.05}
          minDistance={5}
          maxDistance={12}
          enabled={interactive}
          target={[0, 0.9, 0]}
        />
      </Canvas>
    </div>
  );
}
