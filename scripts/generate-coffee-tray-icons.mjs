/**
 * Generate coffee cup tray icon PNGs for Amphetamine.
 *
 * Creates 8 PNG files:
 *   Active:   tray-icon-dark.png, tray-icon-dark@2x.png
 *             tray-icon-light.png, tray-icon-light@2x.png
 *   Inactive: tray-icon-inactive-dark.png, tray-icon-inactive-dark@2x.png
 *             tray-icon-inactive-light.png, tray-icon-inactive-light@2x.png
 *
 * Usage:
 *   bun scripts/generate-coffee-tray-icons.mjs
 *   node scripts/generate-coffee-tray-icons.mjs
 */

import sharp from "sharp";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "..", "src", "assets");

if (!existsSync(ASSETS_DIR)) {
  mkdirSync(ASSETS_DIR, { recursive: true });
}

/**
 * Coffee cup SVG optimized for macOS menu bar.
 * Renders at any size — designed for 18px (1x) and 36px (2x).
 */
function coffeeCupSvg(opts) {
  const { fill, steamColor, size } = opts;
  const s = size;
  const pad = s * 0.02;
  const iw = s - pad * 2; // inner width
  const ih = s - pad * 2;

  // Cup body proportions (within inner area)
  const cupW = iw * 0.58;
  const cupH = ih * 0.52;
  const cupX = iw * 0.12;
  const cupY = ih * 0.34;

  // Handle
  const handleW = iw * 0.18;
  const handleH = cupH * 0.55;
  const handleX = cupX + cupW;
  const handleY = cupY + (cupH - handleH) / 2;

  // Saucer
  const saucerW = iw * 0.78;
  const saucerH = ih * 0.07;
  const saucerX = (iw - saucerW) / 2;
  const saucerY = cupY + cupH + ih * 0.02;

  // Steam lines
  const steamTopY = ih * 0.1;
  const steamBotY = cupY - ih * 0.05;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <g transform="translate(${pad}, ${pad})">
    <!-- Steam lines -->
    <path d="M ${iw * 0.34} ${steamTopY} Q ${iw * 0.3} ${(steamTopY + steamBotY) / 2} ${iw * 0.34} ${steamBotY}"
          fill="none" stroke="${steamColor}" stroke-width="${s * 0.065}" stroke-linecap="round" opacity="0.7"/>
    <path d="M ${iw * 0.5} ${steamTopY - ih * 0.04} Q ${iw * 0.46} ${(steamTopY + steamBotY) / 2 - ih * 0.02} ${iw * 0.5} ${steamBotY - ih * 0.02}"
          fill="none" stroke="${steamColor}" stroke-width="${s * 0.065}" stroke-linecap="round" opacity="0.5"/>
    <path d="M ${iw * 0.66} ${steamTopY + ih * 0.01} Q ${iw * 0.62} ${(steamTopY + steamBotY) / 2 + ih * 0.01} ${iw * 0.66} ${steamBotY - ih * 0.01}"
          fill="none" stroke="${steamColor}" stroke-width="${s * 0.055}" stroke-linecap="round" opacity="0.35"/>

    <!-- Saucer -->
    <rect x="${saucerX}" y="${saucerY}" width="${saucerW}" height="${saucerH}" rx="${saucerH / 2}" fill="${fill}"/>

    <!-- Cup body -->
    <path d="M ${cupX} ${cupY}
             Q ${cupX} ${cupY + cupH} ${cupX + cupW * 0.08} ${cupY + cupH}
             L ${cupX + cupW - cupW * 0.08} ${cupY + cupH}
             Q ${cupX + cupW} ${cupY + cupH} ${cupX + cupW} ${cupY}
             Z"
          fill="${fill}"/>

    <!-- Handle -->
    <path d="M ${handleX} ${handleY}
             Q ${handleX + handleW} ${handleY} ${handleX + handleW} ${handleY + handleH * 0.15}
             Q ${handleX + handleW} ${handleY + handleH} ${handleX} ${handleY + handleH}"
          fill="none" stroke="${fill}" stroke-width="${s * 0.075}" stroke-linecap="round"/>
  </g>
</svg>`;
}

/**
 * Convert SVG buffer to PNG at target size using sharp.
 */
async function svgToPng(svgString, size) {
  return sharp(Buffer.from(svgString)).resize(size, size).png().toBuffer();
}

/**
 * Apply inactive effect: multiply all alpha values by the given factor.
 * Processes raw RGBA pixel data directly.
 */
async function createInactiveVariant(pngBuffer, opacity = 0.4) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const factor = Math.round(opacity * 255);
  const raw = Buffer.from(data);
  for (let i = 3; i < raw.length; i += 4) {
    raw[i] = Math.round((raw[i] / 255) * factor);
  }

  return sharp(raw, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

// --- Icon definitions ---

const ICONS = [
  // Active — dark theme (white cup)
  {
    name: "tray-icon-dark.png",
    size: 18,
    fill: "#FFFFFF",
    steamColor: "#FFFFFF",
    inactive: false,
  },
  {
    name: "tray-icon-dark@2x.png",
    size: 36,
    fill: "#FFFFFF",
    steamColor: "#FFFFFF",
    inactive: false,
  },
  // Active — light theme (dark cup)
  {
    name: "tray-icon-light.png",
    size: 18,
    fill: "#1D1D1F",
    steamColor: "#636366",
    inactive: false,
  },
  {
    name: "tray-icon-light@2x.png",
    size: 36,
    fill: "#1D1D1F",
    steamColor: "#636366",
    inactive: false,
  },
  // Inactive — dark theme (dimmed white cup)
  {
    name: "tray-icon-inactive-dark.png",
    size: 18,
    fill: "#FFFFFF",
    steamColor: "#FFFFFF",
    inactive: true,
  },
  {
    name: "tray-icon-inactive-dark@2x.png",
    size: 36,
    fill: "#FFFFFF",
    steamColor: "#FFFFFF",
    inactive: true,
  },
  // Inactive — light theme (dimmed dark cup)
  {
    name: "tray-icon-inactive-light.png",
    size: 18,
    fill: "#1D1D1F",
    steamColor: "#636366",
    inactive: true,
  },
  {
    name: "tray-icon-inactive-light@2x.png",
    size: 36,
    fill: "#1D1D1F",
    steamColor: "#636366",
    inactive: true,
  },
];

// --- Main ---

console.log("Generating coffee cup tray icons...\n");

for (const icon of ICONS) {
  const svg = coffeeCupSvg({
    fill: icon.fill,
    steamColor: icon.steamColor,
    size: icon.size,
  });

  try {
    let png = await svgToPng(svg, icon.size);

    if (icon.inactive) {
      png = await createInactiveVariant(png, 0.4);
    }

    const outPath = join(ASSETS_DIR, icon.name);
    writeFileSync(outPath, png);
    console.log(`  OK: ${icon.name} (${icon.size}x${icon.size})`);
  } catch (err) {
    console.error(`  FAIL: ${icon.name}: ${err.message}`);
    process.exitCode = 1;
  }
}

console.log("\nDone. 8 icons generated.");
