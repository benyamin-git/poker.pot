import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { type AppConfig, DomainError, type Session, validateConfig } from "../domain";

export const DEFAULT_CONFIG: AppConfig = { players: [], minRaise: 5, maxBet: 100 };

export function locationPath(): string {
  return process.env.POKER_LOCATION_FILE ?? path.join(process.cwd(), "location.yaml");
}

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

function assertSafeId(id: string): void {
  if (!SAFE_ID.test(id)) throw new DomainError("unknown-match", `unsafe id: ${id}`);
}

/** Serialize all writes for a given key so concurrent taps can't interleave. */
const locks = new Map<string, Promise<unknown>>();

function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  locks.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

async function atomicWrite(file: string, contents: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, contents, "utf8");
  await rename(tmp, file);
}

export function readDataDir(): string | null {
  const file = locationPath();
  if (!existsSync(file)) return null;
  try {
    const parsed = parseYaml(readFileSync(file, "utf8")) as { dataDir?: unknown } | null;
    if (parsed && typeof parsed.dataDir === "string" && parsed.dataDir.trim()) {
      return path.resolve(parsed.dataDir);
    }
  } catch {
    return null;
  }
  return null;
}

export async function writeLocation(dataDir: string): Promise<void> {
  const resolved = path.resolve(dataDir);
  await withLock("location", async () => {
    await atomicWrite(locationPath(), stringifyYaml({ dataDir: resolved }));
    await scaffold(resolved);
  });
}

export function configPath(dataDir: string): string {
  return path.join(dataDir, "config.yaml");
}

export function sessionsDir(dataDir: string): string {
  return path.join(dataDir, "sessions");
}

export async function scaffold(dataDir: string): Promise<void> {
  await mkdir(sessionsDir(dataDir), { recursive: true });
  if (!existsSync(configPath(dataDir))) {
    await atomicWrite(configPath(dataDir), stringifyYaml(DEFAULT_CONFIG));
  }
}

export async function readConfig(dataDir: string): Promise<AppConfig> {
  const file = configPath(dataDir);
  if (!existsSync(file)) {
    await scaffold(dataDir);
  }
  const parsed = parseYaml(await readFile(file, "utf8")) as Partial<AppConfig> | null;
  const config: AppConfig = {
    players: Array.isArray(parsed?.players) ? parsed.players : [],
    minRaise: typeof parsed?.minRaise === "number" ? parsed.minRaise : DEFAULT_CONFIG.minRaise,
    maxBet: typeof parsed?.maxBet === "number" ? parsed.maxBet : DEFAULT_CONFIG.maxBet,
    ...(typeof parsed?.currencyLabel === "string" ? { currencyLabel: parsed.currencyLabel } : {}),
  };
  validateConfig(config);
  return config;
}

export async function writeConfig(dataDir: string, config: AppConfig): Promise<void> {
  validateConfig(config);
  await withLock("config", () => atomicWrite(configPath(dataDir), stringifyYaml(config)));
}

export async function listSessions(dataDir: string): Promise<Session[]> {
  await scaffold(dataDir);
  const dir = sessionsDir(dataDir);
  const entries = await readdir(dir).catch(() => [] as string[]);
  const sessions: Session[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".yaml")) continue;
    try {
      const raw = await readFile(path.join(dir, entry), "utf8");
      const parsed = parseYaml(raw) as Session;
      if (!parsed || typeof parsed.id !== "string") throw new Error("bad session");
      sessions.push(parsed);
    } catch (error) {
      await quarantine(dataDir, entry, error);
    }
  }
  return sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function readSession(dataDir: string, id: string): Promise<Session> {
  assertSafeId(id);
  const file = path.join(sessionsDir(dataDir), `${id}.yaml`);
  if (!existsSync(file)) throw new DomainError("unknown-match", `unknown session: ${id}`);
  const parsed = parseYaml(await readFile(file, "utf8")) as Session;
  return parsed;
}

export async function writeSession(dataDir: string, session: Session): Promise<void> {
  assertSafeId(session.id);
  const file = path.join(sessionsDir(dataDir), `${session.id}.yaml`);
  await withLock(`session:${session.id}`, () => atomicWrite(file, stringifyYaml(session)));
}

export async function deleteSessionFile(dataDir: string, id: string): Promise<void> {
  assertSafeId(id);
  const file = path.join(sessionsDir(dataDir), `${id}.yaml`);
  await withLock(`session:${id}`, () => rm(file, { force: true }));
}

/** Read-mutate-write a session under its lock so edits are never lost. */
export async function mutateSession(
  dataDir: string,
  id: string,
  mutate: (session: Session) => Session,
): Promise<Session> {
  assertSafeId(id);
  return withLock(`session:${id}`, async () => {
    const current = await readSession(dataDir, id);
    const next = mutate(current);
    const file = path.join(sessionsDir(dataDir), `${id}.yaml`);
    await atomicWrite(file, stringifyYaml(next));
    return next;
  });
}

async function quarantine(dataDir: string, entry: string, error: unknown): Promise<void> {
  const dir = path.join(sessionsDir(dataDir), ".quarantine");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await rename(path.join(sessionsDir(dataDir), entry), path.join(dir, `${stamp}-${entry}`)).catch(
    () => undefined,
  );
  console.warn(`[storage] quarantined unreadable session ${entry}:`, error);
}
