import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, type Page, chromium, devices } from "@playwright/test";
import {
  type AppConfig,
  type Session,
  applyCommand,
  createSession as makeSession,
} from "../src/domain";

const root = fileURLToPath(new URL("..", import.meta.url));
const outputDir = path.join(root, "docs", "screenshots");
const port = Number(process.env.SCREENSHOTS_PORT ?? 7407);
const base = `http://127.0.0.1:${port}`;
const NOW = "2026-10-08T18:00:00.000Z";

const config: AppConfig = {
  players: [
    { id: "beny", name: "beny" },
    { id: "mani", name: "mani" },
    { id: "rasam", name: "rasam" },
    { id: "ali", name: "ali" },
  ],
  minRaise: 5,
  maxBet: 100,
  currencyLabel: "chips",
};

interface SeedData {
  config: AppConfig;
  sessions: Session[];
  revision: number;
}

interface PlayAction {
  playerId: string;
  actionType: "check" | "fold" | "call" | "raise";
  amount?: number;
}

let idCounter = 0;
const deps = {
  now: () => NOW,
  newId: () => `seed-${++idCounter}`,
  random: () => 0.42,
};

function roster(ids: string[]): { id: string; name: string }[] {
  return ids.map((id) => ({
    id,
    name: config.players.find((player) => player.id === id)?.name ?? id,
  }));
}

function play(
  session: Session,
  participantIds: string[],
  actions: PlayAction[],
  winnerIds?: string[],
): { session: Session; matchId: string } {
  let next = applyCommand(session, config, { type: "startMatch", participantIds }, deps);
  const matchId = next.matches[next.matches.length - 1]?.id;
  if (!matchId) throw new Error("startMatch did not create a match");
  for (const action of actions) {
    next = applyCommand(
      next,
      config,
      {
        type: "recordAction",
        matchId,
        playerId: action.playerId,
        actionType: action.actionType,
        amount: action.amount ?? 0,
      },
      deps,
    );
  }
  if (winnerIds) {
    next = applyCommand(next, config, { type: "selectWinners", matchId, winnerIds }, deps);
  }
  return { session: next, matchId };
}

function buildSeed(): {
  data: SeedData;
  fridayId: string;
  liveMatchId: string;
  doneMatchId: string;
} {
  const friday = makeSession(
    deps.newId(),
    "Friday poker",
    roster(["beny", "mani", "rasam", "ali"]),
    NOW,
  );
  const done = play(
    friday,
    ["beny", "mani", "rasam"],
    [
      { playerId: "beny", actionType: "raise", amount: 10 },
      { playerId: "mani", actionType: "call" },
      { playerId: "rasam", actionType: "call" },
      { playerId: "beny", actionType: "check" },
      { playerId: "mani", actionType: "check" },
      { playerId: "rasam", actionType: "check" },
      { playerId: "beny", actionType: "raise", amount: 20 },
      { playerId: "mani", actionType: "call" },
      { playerId: "rasam", actionType: "fold" },
    ],
    ["beny"],
  );
  const live = play(
    done.session,
    ["beny", "mani", "rasam", "ali"],
    [
      { playerId: "beny", actionType: "raise", amount: 10 },
      { playerId: "mani", actionType: "call" },
      { playerId: "rasam", actionType: "fold" },
      { playerId: "ali", actionType: "call" },
      { playerId: "beny", actionType: "check" },
      { playerId: "mani", actionType: "check" },
      { playerId: "ali", actionType: "check" },
      { playerId: "beny", actionType: "raise", amount: 20 },
      { playerId: "mani", actionType: "call" },
      { playerId: "ali", actionType: "fold" },
      { playerId: "beny", actionType: "raise", amount: 15 },
    ],
  );

  const sunday = makeSession(
    deps.newId(),
    "Sunday cash game",
    roster(["beny", "mani", "rasam", "ali"]),
    NOW,
  );
  const sundayDone = play(
    sunday,
    ["beny", "mani", "rasam", "ali"],
    [
      { playerId: "beny", actionType: "raise", amount: 10 },
      { playerId: "mani", actionType: "call" },
      { playerId: "rasam", actionType: "fold" },
      { playerId: "ali", actionType: "call" },
      { playerId: "beny", actionType: "check" },
      { playerId: "mani", actionType: "check" },
      { playerId: "ali", actionType: "check" },
      { playerId: "beny", actionType: "raise", amount: 15 },
      { playerId: "mani", actionType: "fold" },
      { playerId: "ali", actionType: "call" },
    ],
    ["ali"],
  );

  return {
    data: { config, sessions: [live.session, sundayDone.session], revision: 12 },
    fridayId: friday.id,
    liveMatchId: live.matchId,
    doneMatchId: done.matchId,
  };
}

async function waitForServer(server: ChildProcess): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`server exited early (code ${server.exitCode})`);
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("server did not become ready in time");
}

async function seedBrowser(page: Page, data: SeedData): Promise<void> {
  await page.evaluate(async (payload) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("poker.pot");
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("config")) {
          db.createObjectStore("config", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("sessions")) {
          const sessions = db.createObjectStore("sessions", { keyPath: "id" });
          sessions.createIndex("updatedAt", "updatedAt");
          sessions.createIndex("createdAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(["config", "sessions", "meta"], "readwrite");
      tx.objectStore("config").put({ key: "config", value: payload.config });
      const sessions = tx.objectStore("sessions");
      for (const session of payload.sessions) sessions.put(session);
      const meta = tx.objectStore("meta");
      meta.put({ key: "onboarded", value: true });
      meta.put({ key: "revision", value: payload.revision });
      meta.put({ key: "lastBackupRevision", value: payload.revision });
      meta.put({ key: "lastBackupAt", value: "2026-10-08T17:30:00.000Z" });
      tx.oncomplete = () => {
        database.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }, data);
}

async function shot(
  page: Page,
  name: string,
  route: string,
  readyText: string,
  fullPage: boolean,
): Promise<void> {
  await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
  await page.getByText(readyText, { exact: false }).first().waitFor({ timeout: 15_000 });
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  if (theme !== "dark") {
    throw new Error(`expected the dark theme for ${name}, got ${String(theme)}`);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage });
  console.log(`captured ${name}.png`);
}

const THEME_STRIP = [
  { name: "theme-light", theme: "light", colorScheme: "light", seed: null },
  { name: "theme-dark", theme: "dark", colorScheme: "dark", seed: null },
  { name: "theme-oled", theme: "oled", colorScheme: "light", seed: "oled" },
] as const;

async function captureThemeStrip(browser: Browser, route: string, data: SeedData): Promise<void> {
  const phone = devices["Pixel 7"];
  for (const entry of THEME_STRIP) {
    const context = await browser.newContext({
      userAgent: phone.userAgent,
      viewport: phone.viewport,
      deviceScaleFactor: phone.deviceScaleFactor,
      isMobile: phone.isMobile,
      hasTouch: phone.hasTouch,
      colorScheme: entry.colorScheme,
      locale: "en-US",
    });
    if (entry.seed) {
      const seeded = entry.seed;
      await context.addInitScript((theme: string) => {
        localStorage.setItem("poker.pot:theme", theme);
        localStorage.setItem("poker.pot:accent", "blue");
      }, seeded);
    }
    const page = await context.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page
      .getByText("Welcome to poker.pot", { exact: false })
      .first()
      .waitFor({ timeout: 15_000 });
    await seedBrowser(page, data);
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
    await page.getByText("Choose winners", { exact: false }).first().waitFor({ timeout: 15_000 });
    const actual = await page.evaluate(() => document.documentElement.dataset.theme);
    if (actual !== entry.theme) {
      throw new Error(`expected ${entry.theme} for ${entry.name}, got ${String(actual)}`);
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outputDir, `${entry.name}.png`) });
    console.log(`captured ${entry.name}.png`);
    await context.close();
  }
}

async function report(): Promise<void> {
  const files = (await readdir(outputDir)).filter((file) => file.endsWith(".png")).sort();
  for (const file of files) {
    const buffer = readFileSync(path.join(outputDir, file));
    console.log(`screenshot ${file}: ${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`);
  }
}

async function main(): Promise<void> {
  if (!existsSync(path.join(root, "dist", "index.html"))) {
    throw new Error("client build missing — run `bun run build` first");
  }

  await mkdir(outputDir, { recursive: true });
  await rm(path.join(outputDir, "setup.png"), { force: true });

  const server = spawn("bun", ["src/server/index.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));

  const browser = await chromium.launch();
  try {
    await waitForServer(server);

    const { data, fridayId, liveMatchId, doneMatchId } = buildSeed();
    const phone = devices["Pixel 7"];
    const context = await browser.newContext({
      userAgent: phone.userAgent,
      viewport: phone.viewport,
      deviceScaleFactor: phone.deviceScaleFactor,
      isMobile: phone.isMobile,
      hasTouch: phone.hasTouch,
      colorScheme: "dark",
      locale: "en-US",
    });
    await context.addInitScript(() => {
      localStorage.setItem("poker.pot:theme", "dark");
      localStorage.setItem("poker.pot:accent", "blue");
    });
    const page = await context.newPage();

    await shot(page, "onboarding", "/", "Welcome to poker.pot", false);

    await seedBrowser(page, data);

    await shot(page, "sessions", "/", "Friday poker", true);
    await shot(page, "session", `/#/sessions/${fridayId}`, "Standings", true);
    await shot(
      page,
      "match",
      `/#/sessions/${fridayId}/matches/${liveMatchId}`,
      "Choose winners",
      false,
    );
    await shot(page, "history", `/#/sessions/${fridayId}/matches/${doneMatchId}`, "Won by", true);
    await shot(page, "settings", "/#/settings", "Export backup", true);

    await context.close();

    await captureThemeStrip(browser, `/#/sessions/${fridayId}/matches/${liveMatchId}`, data);
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }

  await report();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
