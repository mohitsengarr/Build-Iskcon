// ── Procedural 3D temple (react-three-fiber) ───────────────────────────────────
// A lightweight, dependency-free (no GLTF/HDRI) temple built from primitives, in
// four architectural styles. Used on the landing hero and as the live preview in
// the "Design Your Temple" builder. Client-only (Vite SPA, no SSR).

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Float } from "@react-three/drei";
import type { TempleStyle } from "@/lib/communityTemples";

const MARBLE = "#f4eddf";
const MARBLE_DK = "#e6dbc4";
const SAFFRON = "#c2410c";
const SAFFRON_DEEP = "#9a3412";
const GOLD = "#dcae52";
const STONE = "#e8dec8";

/** Gold finial (kalash) that crowns towers and spires. */
function Kalash({ y, scale = 1 }: { y: number; scale?: number }) {
  return (
    <group position={[0, y, 0]} scale={scale}>
      <mesh castShadow>
        <sphereGeometry args={[0.15, 20, 20]} />
        <meshStandardMaterial color={GOLD} metalness={0.9} roughness={0.22} />
      </mesh>
      <mesh castShadow position={[0, 0.26, 0]}>
        <coneGeometry args={[0.045, 0.36, 16]} />
        <meshStandardMaterial color={GOLD} metalness={0.95} roughness={0.18} />
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
        <meshStandardMaterial color={MARBLE} roughness={0.65} />
      </mesh>
      <mesh castShadow position={[0, h / 2 + 0.05, 0]}>
        <boxGeometry args={[r * 2.6, 0.1, r * 2.6]} />
        <meshStandardMaterial color={MARBLE_DK} roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, -h / 2 - 0.03, 0]}>
        <boxGeometry args={[r * 2.6, 0.08, r * 2.6]} />
        <meshStandardMaterial color={MARBLE_DK} roughness={0.7} />
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
        <meshStandardMaterial color={STONE} roughness={0.92} />
      </mesh>
      <mesh receiveShadow castShadow position={[0, 0.24, 0]}>
        <boxGeometry args={[3.3, 0.16, 3.3]} />
        <meshStandardMaterial color={MARBLE_DK} roughness={0.85} />
      </mesh>
      <mesh receiveShadow castShadow position={[0, 0.4, 0]}>
        <boxGeometry args={[2.95, 0.16, 2.95]} />
        <meshStandardMaterial color={MARBLE} roughness={0.8} />
      </mesh>

      {/* sanctum */}
      <mesh castShadow position={[0, 1.2, 0]}>
        <boxGeometry args={[2.0, 1.4, 2.0]} />
        <meshStandardMaterial color={MARBLE} roughness={0.68} />
      </mesh>
      {/* saffron cornice band */}
      <mesh castShadow position={[0, 1.98, 0]}>
        <boxGeometry args={[2.28, 0.2, 2.28]} />
        <meshStandardMaterial color={SAFFRON} roughness={0.55} />
      </mesh>
      {/* corner pillars on the sanctum */}
      {[[0.86, 0.86], [-0.86, 0.86], [0.86, -0.86], [-0.86, -0.86]].map(([x, z], i) => (
        <Pillar key={i} x={x} z={z} h={1.15} />
      ))}

      {/* entrance mandapa (front porch, +z) */}
      <group position={[0, 0, 1.35]}>
        <mesh receiveShadow castShadow position={[0, 0.56, 0]}>
          <boxGeometry args={[1.5, 0.12, 0.9]} />
          <meshStandardMaterial color={MARBLE} roughness={0.8} />
        </mesh>
        <Pillar x={-0.55} z={0.32} h={0.9} r={0.09} />
        <Pillar x={0.55} z={0.32} h={0.9} r={0.09} />
        {/* porch roof */}
        <mesh castShadow position={[0, 1.5, 0.3]}>
          <boxGeometry args={[1.45, 0.14, 0.75]} />
          <meshStandardMaterial color={SAFFRON_DEEP} roughness={0.6} />
        </mesh>
        {/* pyramidal porch cap */}
        <mesh castShadow position={[0, 1.75, 0.3]}>
          <coneGeometry args={[0.72, 0.5, 4]} />
          <meshStandardMaterial color={SAFFRON} roughness={0.55} />
        </mesh>
        {/* doorway */}
        <mesh position={[0, 1.02, -0.34]}>
          <boxGeometry args={[0.5, 0.9, 0.05]} />
          <meshStandardMaterial color={SAFFRON_DEEP} roughness={0.5} />
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
            <meshStandardMaterial color={SAFFRON_DEEP} roughness={0.6} />
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
        <meshStandardMaterial color={MARBLE} roughness={0.58} />
      </mesh>
      {/* lotus-petal ring at dome spring line */}
      {Array.from({ length: petals }).map((_, i) => {
        const a = (i / petals) * Math.PI * 2;
        return (
          <mesh key={i} castShadow position={[Math.cos(a) * 0.9, 0.66, Math.sin(a) * 0.9]} rotation={[0, -a, 0.5]}>
            <coneGeometry args={[0.13, 0.34, 4]} />
            <meshStandardMaterial color={GOLD} metalness={0.6} roughness={0.35} />
          </mesh>
        );
      })}
      {/* ribbed hemisphere dome */}
      <mesh castShadow position={[0, 0.68, 0]}>
        <sphereGeometry args={[0.95, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={SAFFRON} roughness={0.42} metalness={0.12} />
      </mesh>
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} castShadow position={[0, 0.68, 0]} rotation={[0, a, 0]}>
            <torusGeometry args={[0.955, 0.02, 6, 24, Math.PI]} />
            <meshStandardMaterial color={SAFFRON_DEEP} roughness={0.5} />
          </mesh>
        );
      })}
      {/* neck + kalash */}
      <mesh castShadow position={[0, 1.66, 0]}>
        <cylinderGeometry args={[0.16, 0.26, 0.28, 16]} />
        <meshStandardMaterial color={GOLD} metalness={0.85} roughness={0.28} />
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
            <meshStandardMaterial color={i % 2 === 0 ? SAFFRON : SAFFRON_DEEP} roughness={0.6} />
          </mesh>
          {/* horizontal moulding band */}
          <mesh castShadow position={[0, t.y + t.h / 2, 0]}>
            <cylinderGeometry args={[t.r1 * 1.06, t.r1 * 1.06, 0.06, 8]} />
            <meshStandardMaterial color={MARBLE} roughness={0.7} />
          </mesh>
        </group>
      ))}
      {/* amalaka (ribbed disc) */}
      <mesh castShadow position={[0, 2.6, 0]}>
        <torusGeometry args={[0.24, 0.11, 8, 16]} />
        <meshStandardMaterial color={MARBLE_DK} roughness={0.6} />
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
            <meshStandardMaterial color={i % 2 === 0 ? MARBLE : SAFFRON} roughness={0.7} />
          </mesh>
          <mesh castShadow position={[0, y + h / 2, 0]}>
            <boxGeometry args={[w * 1.04, 0.07, w * 1.04]} />
            <meshStandardMaterial color={SAFFRON_DEEP} roughness={0.6} />
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
        <meshStandardMaterial color={MARBLE} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.95, 0]}>
        <icosahedronGeometry args={[1.0, 1]} />
        <meshStandardMaterial color={SAFFRON} roughness={0.32} metalness={0.18} flatShading />
      </mesh>
      <Kalash y={2.08} />
    </group>
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
  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [4.4, 2.7, 5.4], fov: 40 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#fbf6ee"]} />
        <fog attach="fog" args={["#fbf6ee", 11, 24]} />
        <hemisphereLight args={["#fff6e6", "#d9c9a8", 0.55]} />
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[5, 8, 4]}
          intensity={1.7}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-near={0.5}
          shadow-camera-far={30}
        />
        <directionalLight position={[-5, 3, -4]} intensity={0.45} color={SAFFRON} />
        <Suspense fallback={null}>
          <Float speed={1.1} rotationIntensity={0.12} floatIntensity={0.3}>
            <Temple style={style} />
          </Float>
          <ContactShadows position={[0, -1.2, 0]} opacity={0.38} scale={10} blur={2.6} far={4.5} />
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
