/**
 * Generates static JSON files that mirror the /api/bhagwatham/* endpoints.
 * Run during Vite build so Vercel can serve them as static assets.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "..", "..", "data", "bhagwatham");
const OUT_DIR = path.resolve(__dirname, "..", "public", "api", "bhagwatham");

// Ensure output directories exist
fs.mkdirSync(path.join(OUT_DIR, "images"), { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, "faces"), { recursive: true });

// 1. progress.json → /api/bhagwatham/progress
const progress = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "progress.json"), "utf-8"));
fs.writeFileSync(path.join(OUT_DIR, "progress"), JSON.stringify(progress));
console.log("✓ progress");

// 2. Read all batch files
const PAGES_DIR = path.join(DATA_DIR, "pages");
const batchFiles = fs.readdirSync(PAGES_DIR)
  .filter(f => f.startsWith("batch-") && f.endsWith(".json"))
  .sort();

const allBatches = batchFiles.map(f =>
  JSON.parse(fs.readFileSync(path.join(PAGES_DIR, f), "utf-8"))
);

// 3. /api/bhagwatham/batches — metadata only
const batchesMeta = allBatches.map(b => ({
  batchNumber: b.batchNumber,
  startPage: b.startPage,
  endPage: b.endPage,
  processedAt: b.processedAt,
  pageCount: b.pages.length,
}));
fs.writeFileSync(path.join(OUT_DIR, "batches"), JSON.stringify(batchesMeta));
console.log(`✓ batches (${batchesMeta.length})`);

// 4. /api/bhagwatham/batch/:number — individual batch files
const batchDir = path.join(OUT_DIR, "batch");
fs.mkdirSync(batchDir, { recursive: true });
for (const batch of allBatches) {
  fs.writeFileSync(path.join(batchDir, String(batch.batchNumber)), JSON.stringify(batch));
}
console.log(`✓ batch files`);

// 5. /api/bhagwatham/content?page=1&limit=100 — all content as single file
// The frontend always fetches page=1&limit=100, so serve everything
const contentResponse = {
  batches: allBatches,
  pagination: {
    page: 1,
    limit: 100,
    totalBatches: allBatches.length,
    totalPages: 1,
    hasMore: false,
  },
};
fs.writeFileSync(path.join(OUT_DIR, "content"), JSON.stringify(contentResponse));
console.log(`✓ content (${allBatches.length} batches, ${allBatches.reduce((s, b) => s + b.pages.length, 0)} pages)`);

// 6. /api/bhagwatham/image-manifest
const manifestPath = path.join(DATA_DIR, "images", "manifest.json");
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  fs.writeFileSync(path.join(OUT_DIR, "image-manifest"), JSON.stringify(manifest));
  console.log(`✓ image-manifest (${manifest.images?.length || 0} images)`);

  // Copy actual image files
  const imagesDir = path.join(DATA_DIR, "images");
  const imageFiles = fs.readdirSync(imagesDir).filter(f => f.endsWith(".jpg") || f.endsWith(".png"));
  for (const img of imageFiles) {
    fs.copyFileSync(path.join(imagesDir, img), path.join(OUT_DIR, "images", img));
  }
  console.log(`✓ copied ${imageFiles.length} image files`);
}

// 7. Copy face bank images
const facesDir = path.join(DATA_DIR, "faces");
if (fs.existsSync(facesDir)) {
  const faceFiles = fs.readdirSync(facesDir).filter(f => f.endsWith(".jpg") || f.endsWith(".png") || f.endsWith(".json"));
  for (const face of faceFiles) {
    fs.copyFileSync(path.join(facesDir, face), path.join(OUT_DIR, "faces", face));
  }
  console.log(`✓ copied ${faceFiles.length} face files`);
}

console.log("\n✅ Static API files generated successfully");
