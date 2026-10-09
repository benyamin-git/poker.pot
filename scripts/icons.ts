import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const BACKGROUND = "#1c1b1f";

interface Target {
  file: string;
  size: number;
  scale?: number;
}

const TARGETS: Target[] = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "maskable-512.png", size: 512, scale: 0.72 },
  { file: "apple-touch-icon-180.png", size: 180 },
  { file: "icon-1024.png", size: 1024 },
];

function html(svg: string, target: Target): string {
  const scale = target.scale ?? 1;
  const art = Math.round(target.size * scale);
  return `<!doctype html><html><head><style>
html,body{margin:0;padding:0;background:${BACKGROUND}}
body{width:${target.size}px;height:${target.size}px;display:flex;align-items:center;justify-content:center;overflow:hidden}
svg{display:block;width:${art}px;height:${art}px}
</style></head><body>${svg}</body></html>`;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const svg = await readFile(path.join(root, "public", "poker-chip-logo.svg"), "utf8");
  const outDir = path.join(root, "public", "icons");
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const target of TARGETS) {
      const page = await browser.newPage({
        viewport: { width: target.size, height: target.size },
        deviceScaleFactor: 1,
      });
      await page.setContent(html(svg, target));
      await page.screenshot({ path: path.join(outDir, target.file) });
      await page.close();
      console.log(`icons: wrote ${target.file} (${target.size}px)`);
    }
  } finally {
    await browser.close();
  }
}

await main();
