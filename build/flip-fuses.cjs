const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");
const path = require("path");
const fs = require("fs");

// Resolve app path from CLI arg or find in dist/
const arch = process.argv[2] || "arm64";
const appPath = path.resolve(__dirname, "..", "dist", `mac-${arch}`, "Amphetamine.app");

if (!fs.existsSync(appPath)) {
  console.error(`[flip-fuses] App not found at: ${appPath}`);
  process.exit(1);
}

console.log(`[flip-fuses] Applying fuses to: ${appPath}`);

flipFuses(appPath, {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableFuses]: true,
});

console.log("[flip-fuses] Done");
