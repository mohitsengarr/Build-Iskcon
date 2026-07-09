// Lazy wrapper for the 3D temple. Importing THIS (instead of ThreeTempleModel
// directly) keeps three.js / fiber / drei out of the main bundle — they load as
// a separate async chunk only on the pages that actually render a temple.
import { lazy, Suspense } from "react";
import type { ThreeTempleModelProps } from "./ThreeTempleModel";

const Model = lazy(() => import("./ThreeTempleModel"));

export default function ThreeTemple(props: ThreeTempleModelProps) {
  return (
    <Suspense fallback={<div style={{ width: "100%", height: "100%", background: "#fbf6ee" }} />}>
      <Model {...props} />
    </Suspense>
  );
}
