#!/usr/bin/env node
// Generate WebP variants of the images the frontend actually renders, next to
// the originals (which are kept). Rewrites the plot/structure_plot fields in
// static_site/data to point at the .webp files.
//
// Run once after the data changes:  node tools/optimize_images.js
// Requires `sharp` (dev-only):      npm install --no-save sharp
//
// Only images referenced by data/index.json (layer-type plots) and
// data/materials/*.json (structure plots) are converted; everything else in
// mediafiles/ is left untouched. Idempotent: an existing .webp is skipped.

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const MEDIA = path.join(ROOT, "mediafiles");
const DATA = path.join(ROOT, "static_site", "data");

// Longest edge kept; drawings stay legible far beyond the ~600 px container.
const MAX_EDGE = 1600;
const QUALITY = 82;

function relToAbs(rel) {
  return path.join(MEDIA, rel);
}

async function convert(rel) {
  const src = relToAbs(rel);
  if (!fs.existsSync(src)) return { rel, skipped: "missing" };
  const newRel = rel.replace(/\.(png|jpe?g)$/i, ".webp");
  const dst = relToAbs(newRel);
  if (fs.existsSync(dst)) return { rel, newRel, skipped: "exists" };
  const before = fs.statSync(src).size;
  try {
    await sharp(src)
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(dst);
  } catch (e) {
    return { rel, error: e.message };
  }
  const after = fs.statSync(dst).size;
  return { rel, newRel, before, after };
}

async function main() {
  const index = JSON.parse(fs.readFileSync(path.join(DATA, "index.json"), "utf8"));
  const refs = new Set();
  for (const lt of index.layer_types || []) if (lt.plot) refs.add(lt.plot);

  const materialsDir = path.join(DATA, "materials");
  for (const name of fs.readdirSync(materialsDir)) {
    if (!name.endsWith(".json") || name.includes(".", name.length - 5) && name.split(".").length > 2) continue;
    // skip lazy series files like <slug>.powder_pattern.json
    if ((name.match(/\./g) || []).length > 1) continue;
    const m = JSON.parse(fs.readFileSync(path.join(materialsDir, name), "utf8"));
    if (m.files && m.files.structure_plot) refs.add(m.files.structure_plot);
  }

  const plan = [...refs].filter((r) => /\.(png|jpe?g)$/i.test(r));
  console.log(`Referenced raster images: ${plan.length}`);

  let saved = 0, converted = 0;
  const map = {};
  for (const rel of plan) {
    const res = await convert(rel);
    if (res.error) { console.log(`  ERROR ${rel}: ${res.error}`); continue; }
    if (res.newRel) {
      map[rel] = res.newRel;
      if (!res.skipped) { converted++; saved += res.before - res.after; }
    }
  }
  console.log(`Converted: ${converted}, saved ${(saved / 1048576).toFixed(1)} MB`);

  // Rewrite data references to the .webp files, keeping the original path so the
  // frontend can offer it as the <picture> fallback without guessing extensions.
  // Both index.json (list/overview) and layer-types/<slug>.json (detail page)
  // carry the plot.
  let rewritten = 0;
  for (const lt of index.layer_types || []) if (map[lt.plot]) { lt.plot_original = lt.plot; lt.plot = map[lt.plot]; rewritten++; }
  fs.writeFileSync(path.join(DATA, "index.json"), JSON.stringify(index, null, 2));

  const layerTypesDir = path.join(DATA, "layer-types");
  for (const name of fs.readdirSync(layerTypesDir)) {
    if (!name.endsWith(".json")) continue;
    const p = path.join(layerTypesDir, name);
    const lt = JSON.parse(fs.readFileSync(p, "utf8"));
    if (map[lt.plot]) {
      lt.plot_original = lt.plot;
      lt.plot = map[lt.plot];
      fs.writeFileSync(p, JSON.stringify(lt, null, 2));
      rewritten++;
    }
  }

  for (const name of fs.readdirSync(materialsDir)) {
    if ((name.match(/\./g) || []).length > 1) continue;
    const p = path.join(materialsDir, name);
    const m = JSON.parse(fs.readFileSync(p, "utf8"));
    if (m.files && map[m.files.structure_plot]) {
      m.files.structure_plot_original = m.files.structure_plot;
      m.files.structure_plot = map[m.files.structure_plot];
      fs.writeFileSync(p, JSON.stringify(m, null, 2));
      rewritten++;
    }
  }
  console.log(`Data references rewritten: ${rewritten}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
