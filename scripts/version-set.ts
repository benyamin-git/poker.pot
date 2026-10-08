import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("usage: bun scripts/version-set.ts <x.y.z>");
  process.exit(1);
}

const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { version: string };
pkg.version = version;
await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const cargoPath = path.join(root, "src-tauri", "Cargo.toml");
const cargo = await readFile(cargoPath, "utf8");
await writeFile(cargoPath, cargo.replace(/^version = ".*"$/m, `version = "${version}"`));

const lockPath = path.join(root, "src-tauri", "Cargo.lock");
try {
  const lock = await readFile(lockPath, "utf8");
  const updated = lock.replace(/^(name = "poker_pot"\nversion = ")[^"]+(")/m, `$1${version}$2`);
  await writeFile(lockPath, updated);
} catch {
  // the lock file only exists after the first cargo build
}

console.log(`version set to ${version}`);
