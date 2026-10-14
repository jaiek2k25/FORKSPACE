/**
 * Photo pipeline: normalise the raw downloads in tools/raw-photos/ into the
 * files served from assets/photos/.
 *
 * Why a script: JPEG re-encoding is done in Chromium (already present for the
 * browser tests) so the repository needs no native image dependency. Every
 * source photo is openly licensed and its attribution is recorded in
 * assets/js/data/photos.js; nothing here downloads anything at runtime.
 *
 * Usage: node tools/prepare-photos.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './local-chromium.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RAW_DIR = path.join(ROOT, 'tools', 'raw-photos');
const OUT_DIR = path.join(ROOT, 'assets', 'photos');

/** slug -> raw file name. Max width keeps card and gallery sizes sharp. */
const PHOTOS = [
  { slug: 'coimbatore-street', raw: 'site-commons-wikimedia-org-coimbatore-ta-4.jpg', maxWidth: 900 },
  { slug: 'bengaluru-towers', raw: 'site-commons-wikimedia-org-bengaluru-res-1.jpg', maxWidth: 900 },
  { slug: 'lisbon-facade', raw: 'site-commons-wikimedia-org-lisbon-apartm-2.jpg', maxWidth: 900 },
  { slug: 'lisbon-avenida', raw: 'site-commons-wikimedia-org-lisbon-apartm-3.jpg', maxWidth: 900 },
  { slug: 'berlin-courtyard', raw: 'site-commons-wikimedia-org-berlin-apartm-2.jpg', maxWidth: 900 },
  { slug: 'london-hamilton-terrace', raw: 'site-commons-wikimedia-org-islington-lon-2.jpg', maxWidth: 900 },
  { slug: 'toronto-college', raw: 'site-commons-wikimedia-org-toronto-resid-3.jpg', maxWidth: 900 },
  { slug: 'dubai-marina', raw: 'site-commons-wikimedia-org-dubai-residen-4.jpg', maxWidth: 900 },
  { slug: 'dubai-marina-2007', raw: 'site-commons-wikimedia-org-dubai-residen-1.jpg', maxWidth: 900 },
  { slug: 'melbourne-elizabeth', raw: 'site-commons-wikimedia-org-melbourne-apa-1.jpg', maxWidth: 900 },
  { slug: 'melbourne-collins', raw: 'site-commons-wikimedia-org-melbourne-apa-4.jpg', maxWidth: 900 },
  { slug: 'nyc-brooklyn', raw: 'site-commons-wikimedia-org-new-york-broo-3.jpg', maxWidth: 900 },
  { slug: 'nyc-brownstone', raw: 'site-commons-wikimedia-org-new-york-broo-1.jpg', maxWidth: 900 },
  { slug: 'mexico-city-centro', raw: 'site-commons-wikimedia-org-mexico-city-c-4.jpg', maxWidth: 900 },
  { slug: 'amsterdam-canal', raw: 'site-commons-wikimedia-org-amsterdam-can-1.jpg', maxWidth: 900 },
  { slug: 'interior-living-1', raw: 'site-commons-wikimedia-org-living-room-i-1.jpg', maxWidth: 900 },
  { slug: 'interior-bedroom-1', raw: 'site-commons-wikimedia-org-bedroom-inter-2.jpg', maxWidth: 900 },
  { slug: 'interior-kitchen-1', raw: 'site-commons-wikimedia-org-kitchen-apart-1.jpg', maxWidth: 900 }
];

const render = async (payload) => {
  const img = new Image();
  img.src = payload.dataUrl;
  await img.decode();
  const scale = Math.min(1, payload.maxWidth / img.naturalWidth);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  return { width, height, dataUrl: canvas.toDataURL('image/jpeg', 0.82) };
};

async function main() {
  if (!existsSync(RAW_DIR)) {
    console.error(`raw folder missing: ${RAW_DIR}`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(launchOptions());
  const page = await browser.newPage();
  const written = [];
  for (const photo of PHOTOS) {
    const source = path.join(RAW_DIR, photo.raw);
    if (!existsSync(source)) {
      console.warn(`skip (missing): ${photo.slug}`);
      continue;
    }
    const dataUrl = `data:image/jpeg;base64,${readFileSync(source).toString('base64')}`;
    const result = await page.evaluate(render, { dataUrl, maxWidth: photo.maxWidth });
    const target = path.join(OUT_DIR, `${photo.slug}.jpg`);
    writeFileSync(target, Buffer.from(result.dataUrl.split(',')[1], 'base64'));
    written.push({ slug: photo.slug, width: result.width, height: result.height, bytes: statSync(target).size });
  }
  await browser.close();
  const totalKb = Math.round(written.reduce((sum, p) => sum + p.bytes, 0) / 1024);
  for (const photo of written) {
    console.log(`${photo.slug.padEnd(26)} ${photo.width}x${photo.height}  ${Math.round(photo.bytes / 1024)}KB`);
  }
  console.log(`${written.length} photos · ${totalKb} KB total`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
