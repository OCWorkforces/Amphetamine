/**
 * Generate tray icon PNGs for Amphetamine.
 *
 * Creates 4 inactive-state icons (inactive-dark/light × 1x/2x) as dimmed
 * versions of the existing active icons. The active icons already exist in
 * src/assets/ — this script only generates the inactive variants.
 *
 * Usage:
 *   node scripts/generate-tray-icons.mjs
 *   bun  scripts/generate-tray-icons.mjs
 *
 * Output:
 *   src/assets/tray-icon-inactive-dark.png
 *   src/assets/tray-icon-inactive-dark@2x.png
 *   src/assets/tray-icon-inactive-light.png
 *   src/assets/tray-icon-inactive-light@2x.png
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "..", "src", "assets");

// --- Minimal PNG encoder (no dependencies) ---

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeB = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeB, data]);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc32(body), 0);
  const lenB = Buffer.alloc(4);
  lenB.writeUInt32BE(data.length, 0);
  return Buffer.concat([lenB, body, crcB]);
}

function encodePng(width, height, pixels) {
  // pixels: Uint8Array of RGBA (width * height * 4)
  // PNG color type 6 (RGBA), bit depth 8
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Prepend filter byte (0 = None) to each row
  const rowSize = width * 4;
  const raw = Buffer.alloc((rowSize + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (rowSize + 1)] = 0; // filter: None
    for (let x = 0; x < rowSize; x++) {
      raw[y * (rowSize + 1) + 1 + x] = pixels[y * rowSize + x];
    }
  }

  const compressed = deflateSync(raw);

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Minimal PNG decoder ---

function decodePng(buffer) {
  const sig = buffer.subarray(0, 8);
  const expectedSig = PNG_SIGNATURE;
  if (!sig.equals(expectedSig)) {
    throw new Error("Not a valid PNG file");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let idatChunks = [];

  while (offset < buffer.length) {
    const len = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + len);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    }

    offset += 12 + len; // 4 (len) + 4 (type) + len (data) + 4 (crc)
  }

  if (width === 0 || height === 0 || idatChunks.length === 0) {
    throw new Error("Invalid PNG: missing IHDR or IDAT chunks");
  }

  return { width, height, idatChunks };
}

/**
 * Read an existing PNG and create a dimmed/inactive version.
 * Reduces alpha to 40% and desaturates for a "disabled" look.
 */
function createInactiveVariant(inputPath) {
  const inputBuf = readFileSync(inputPath);
  const { width, height, idatChunks } = decodePng(inputBuf);

  // Concatenate and decompress IDAT chunks
  const compressed = Buffer.concat(idatChunks);
  const raw = inflateSync(compressed);

  // Reconstruct pixel data with proper PNG filter handling
  const bpp = 4; // bytes per pixel (RGBA)
  const rowSize = width * bpp;
  const pixels = new Uint8Array(width * height * bpp);
  const prevRow = new Uint8Array(rowSize);
  const currRow = new Uint8Array(rowSize);

  for (let y = 0; y < height; y++) {
    const filterByte = raw[y * (rowSize + 1)];
    const srcStart = y * (rowSize + 1) + 1;

    for (let x = 0; x < rowSize; x++) {
      const filt = raw[srcStart + x];
      const a = x >= bpp ? currRow[x - bpp] : 0;
      const b = prevRow[x];
      const c = x >= bpp ? prevRow[x - bpp] : 0;

      let recon;
      switch (filterByte) {
        case 0: recon = filt; break;
        case 1: recon = (filt + a) & 0xff; break;
        case 2: recon = (filt + b) & 0xff; break;
        case 3: recon = (filt + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          recon = (filt + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
        default: recon = filt;
      }

      currRow[x] = recon;
      pixels[y * rowSize + x] = recon;
    }

    // Swap row buffers
    prevRow.set(currRow);
  }

  // Apply inactive effect: desaturate + reduce alpha
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];

    // Luminance-based desaturation (mix 50% gray)
    const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
    pixels[i] = Math.round(r * 0.5 + gray * 0.5);     // R
    pixels[i + 1] = Math.round(g * 0.5 + gray * 0.5); // G
    pixels[i + 2] = Math.round(b * 0.5 + gray * 0.5); // B
    pixels[i + 3] = Math.round(a * 0.4);               // Alpha: 40%
  }

  return encodePng(width, height, pixels);
}

// --- Main ---

const ICON_VARIANTS = [
  { input: "tray-icon-dark.png", output: "tray-icon-inactive-dark.png" },
  { input: "tray-icon-dark@2x.png", output: "tray-icon-inactive-dark@2x.png" },
  { input: "tray-icon-light.png", output: "tray-icon-inactive-light.png" },
  { input: "tray-icon-light@2x.png", output: "tray-icon-inactive-light@2x.png" },
];

console.log("Generating inactive tray icons...\n");

for (const { input, output } of ICON_VARIANTS) {
  const inputPath = join(ASSETS_DIR, input);
  const outputPath = join(ASSETS_DIR, output);

  if (!existsSync(inputPath)) {
    console.error(`  SKIP: ${input} not found`);
    continue;
  }

  try {
    const inactivePng = createInactiveVariant(inputPath);
    writeFileSync(outputPath, inactivePng);
    console.log(`  OK: ${output}`);
  } catch (err) {
    console.error(`  FAIL: ${output}: ${err.message}`);
    process.exitCode = 1;
  }
}

console.log("\nDone.");
