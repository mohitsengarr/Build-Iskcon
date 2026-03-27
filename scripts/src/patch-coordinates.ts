/**
 * patch-coordinates.ts
 *
 * One-shot script to back-fill latitude/longitude on any temples that were
 * inserted before coordinates were added to the seed.  Match is done by
 * temple name so it is safe to re-run — rows that already have coordinates
 * are skipped.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts patch-coordinates
 */

import { db } from "@workspace/db";
import { templesTable } from "@workspace/db/schema";
import { eq, isNull, and } from "drizzle-orm";

const COORDINATES: Record<string, { latitude: string; longitude: string }> = {
  "Sri Radha Govinda Mandir": {
    latitude: "27.579400",
    longitude: "77.696100",
  },
  "Shri Venkateswara Temple": {
    latitude: "13.628800",
    longitude: "79.419200",
  },
  "Jagannath Dham": {
    latitude: "19.804800",
    longitude: "85.818300",
  },
  "Somnath Mahadev Mandir": {
    latitude: "20.888000",
    longitude: "70.401400",
  },
  "Devi Durga Shakti Peeth": {
    latitude: "32.993000",
    longitude: "74.952000",
  },
};

async function patchCoordinates() {
  console.log("Fetching temples with missing coordinates…");

  const temples = await db
    .select({ id: templesTable.id, name: templesTable.name })
    .from(templesTable)
    .where(
      and(
        isNull(templesTable.latitude),
        isNull(templesTable.longitude)
      )
    );

  if (temples.length === 0) {
    console.log("All temples already have coordinates — nothing to patch.");
    return;
  }

  console.log(`Found ${temples.length} temple(s) without coordinates.`);

  let patched = 0;
  let skipped = 0;

  for (const temple of temples) {
    const coords = COORDINATES[temple.name];

    if (!coords) {
      console.warn(`  ⚠  No coordinates defined for "${temple.name}" — skipping.`);
      skipped++;
      continue;
    }

    await db
      .update(templesTable)
      .set({
        latitude: coords.latitude,
        longitude: coords.longitude,
        updatedAt: new Date(),
      })
      .where(eq(templesTable.id, temple.id));

    console.log(
      `  ✓  Updated "${temple.name}" → lat ${coords.latitude}, lng ${coords.longitude}`
    );
    patched++;
  }

  console.log(
    `\nDone — ${patched} patched, ${skipped} skipped (no mapping found).`
  );
}

patchCoordinates().catch((err) => {
  console.error("patch-coordinates failed:", err);
  process.exit(1);
});
