/**
 * Produces dist/ for Netlify: root calculator, /afford/, /live/, shared assets.
 * Run: npm run build:dist
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });

async function copyFile(srcRel, destRel) {
  const from = path.join(root, srcRel);
  const to = path.join(dist, destRel);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}

await fs.cp(path.join(root, "assets"), path.join(dist, "assets"), { recursive: true });

for (const f of ["styles.css", "shared-mortgage-data.js", "afford.js", "simple.js", "app.js", "embed-resize.js"]) {
  await copyFile(f, f);
}

await copyFile("index.html", "index.html");
await copyFile("affordweb.html", "afford/index.html");
await copyFile("simple.html", "live/index.html");

console.log("build-dist: wrote", dist);
