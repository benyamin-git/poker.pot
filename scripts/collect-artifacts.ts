import { cp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const version = (
  JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as { version: string }
).version;

async function findApk(dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findApk(full);
      if (found) return found;
    } else if (entry.name.endsWith(".apk")) {
      return full;
    }
  }
  return null;
}

const outputs = path.join(root, "src-tauri", "gen", "android", "app", "build", "outputs", "apk");
const apk = await findApk(outputs);
if (!apk) {
  console.error(`no apk found under ${outputs}`);
  process.exit(1);
}

const releaseDir = path.join(root, "release");
await rm(releaseDir, { recursive: true, force: true });
const target = path.join(releaseDir, `poker.pot-${version}-android-universal.apk`);
await cp(apk, target);
console.log(`collected ${apk} -> ${target}`);
