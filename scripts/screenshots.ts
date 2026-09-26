import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, chromium, devices } from "@playwright/test";
import type { AppConfig, Session } from "../src/domain";

const root = fileURLToPath(new URL("..", import.meta.url));
const workDir = path.join(root, ".screenshots");
const dataDir = path.join(workDir, "data");
const locationFile = path.join(workDir, "location.yaml");
const outputDir = path.join(root, "docs", "screenshots");
const port = Number(process.env.SCREENSHOTS_PORT ?? 4180);
const base = `http://127.0.0.1:${port}`;

const config: AppConfig = {
  players: [
    { id: "ali", name: "Ali" },
    { id: "bo", name: "Bo" },
    { id: "cem", name: "Cem" },
    { id: "dana", name: "Dana" },
  ],
  minRaise: 5,
  maxBet: 100,
  currencyLabel: "chips",
};

async function request<T>(method: string, route: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${route} failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function waitForServer(server: ChildProcess): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`server exited early (code ${server.exitCode})`);
    try {
      const response = await fetch(`${base}/api/setup`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("server did not become ready in time");
}

interface PlayAction {
  playerId: string;
  actionType: "check" | "fold" | "call" | "raise";
  amount?: number;
}

async function playMatch(
  sessionId: string,
  participantIds: string[],
  actions: PlayAction[],
  winnerIds?: string[],
): Promise<{ session: Session; matchId: string }> {
  let session = await request<Session>("POST", `/api/sessions/${sessionId}/commands`, {
    command: { type: "startMatch", participantIds },
  });
  const matchId = session.matches[session.matches.length - 1]?.id;
  if (!matchId) throw new Error("startMatch did not create a match");
  for (const action of actions) {
    session = await request<Session>("POST", `/api/sessions/${sessionId}/commands`, {
      command: {
        type: "recordAction",
        matchId,
        playerId: action.playerId,
        actionType: action.actionType,
        amount: action.amount ?? 0,
      },
    });
  }
  if (winnerIds) {
    session = await request<Session>("POST", `/api/sessions/${sessionId}/commands`, {
      command: { type: "selectWinners", matchId, winnerIds },
    });
  }
  return { session, matchId };
}

async function seed(): Promise<{ fridayId: string; liveMatchId: string; doneMatchId: string }> {
  await request("POST", "/api/setup", { dataDir });
  await request("PUT", "/api/config", config);

  const friday = await request<Session>("POST", "/api/sessions", {
    name: "Friday poker",
    playerIds: ["ali", "bo", "cem", "dana"],
  });
  const done = await playMatch(
    friday.id,
    ["ali", "bo", "cem"],
    [
      { playerId: "ali", actionType: "raise", amount: 10 },
      { playerId: "bo", actionType: "call" },
      { playerId: "cem", actionType: "call" },
      { playerId: "ali", actionType: "check" },
      { playerId: "bo", actionType: "check" },
      { playerId: "cem", actionType: "check" },
      { playerId: "ali", actionType: "raise", amount: 20 },
      { playerId: "bo", actionType: "call" },
      { playerId: "cem", actionType: "fold" },
    ],
    ["ali"],
  );
  const live = await playMatch(
    friday.id,
    ["ali", "bo", "cem", "dana"],
    [
      { playerId: "ali", actionType: "raise", amount: 10 },
      { playerId: "bo", actionType: "call" },
      { playerId: "cem", actionType: "fold" },
      { playerId: "dana", actionType: "call" },
      { playerId: "ali", actionType: "check" },
      { playerId: "bo", actionType: "check" },
      { playerId: "dana", actionType: "check" },
      { playerId: "ali", actionType: "raise", amount: 20 },
      { playerId: "bo", actionType: "call" },
      { playerId: "dana", actionType: "fold" },
      { playerId: "ali", actionType: "raise", amount: 15 },
    ],
  );

  const sunday = await request<Session>("POST", "/api/sessions", {
    name: "Sunday cash game",
    playerIds: ["ali", "bo", "cem", "dana"],
  });
  await playMatch(
    sunday.id,
    ["ali", "bo", "cem", "dana"],
    [
      { playerId: "ali", actionType: "raise", amount: 10 },
      { playerId: "bo", actionType: "call" },
      { playerId: "cem", actionType: "fold" },
      { playerId: "dana", actionType: "call" },
      { playerId: "ali", actionType: "check" },
      { playerId: "bo", actionType: "check" },
      { playerId: "dana", actionType: "check" },
      { playerId: "ali", actionType: "raise", amount: 15 },
      { playerId: "bo", actionType: "fold" },
      { playerId: "dana", actionType: "call" },
    ],
    ["dana"],
  );

  return { fridayId: friday.id, liveMatchId: live.matchId, doneMatchId: done.matchId };
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
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage });
  console.log(`captured ${name}.png`);
}

async function main(): Promise<void> {
  if (!existsSync(path.join(root, "dist", "index.html"))) {
    throw new Error("client build missing — run `bun run build` first");
  }

  await rm(workDir, { recursive: true, force: true });
  await mkdir(dataDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const server = spawn("bun", ["src/server/index.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), POKER_LOCATION_FILE: locationFile },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));

  const browser = await chromium.launch();
  try {
    await waitForServer(server);

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
    const page = await context.newPage();

    await shot(page, "setup", "/setup", "private data folder", true);

    const { fridayId, liveMatchId, doneMatchId } = await seed();

    await shot(page, "sessions", "/", "Friday poker", true);
    await shot(page, "session", `/sessions/${fridayId}`, "Standings", true);
    await shot(
      page,
      "match",
      `/sessions/${fridayId}/matches/${liveMatchId}`,
      "Choose winners",
      false,
    );
    await shot(page, "history", `/sessions/${fridayId}/matches/${doneMatchId}`, "Won by", true);
    await shot(page, "settings", "/settings", "Minimum raise", true);

    await context.close();
  } finally {
    await browser.close();
    server.kill("SIGTERM");
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
