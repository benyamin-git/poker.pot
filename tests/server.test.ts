import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { handleApi } from "../src/server/api";

let root: string;
let dataDir: string;
let locationFile: string;

async function api(pathname: string, init?: RequestInit): Promise<Response> {
  const request = new Request(`http://test${pathname}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  return handleApi(request, new URL(request.url));
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "poker-pot-test-"));
  dataDir = path.join(root, "private-data");
  locationFile = path.join(root, "location.yaml");
  process.env.POKER_LOCATION_FILE = locationFile;
});

describe("setup and config", () => {
  it("reports unconfigured before setup and scaffolds after", async () => {
    const before = await body<{ configured: boolean }>(await api("/api/setup"));
    expect(before.configured).toBe(false);

    const setup = await api("/api/setup", {
      method: "POST",
      body: JSON.stringify({ dataDir }),
    });
    expect(setup.status).toBe(200);
    const after = await body<{ configured: boolean; dataDir: string }>(await api("/api/setup"));
    expect(after.configured).toBe(true);
    expect(after.dataDir).toBe(dataDir);

    const entries = await readdir(dataDir);
    expect(entries).toContain("config.yaml");
    expect(entries).toContain("sessions");
  });

  it("validates and persists config", async () => {
    const bad = await api("/api/config", {
      method: "PUT",
      body: JSON.stringify({ players: [], minRaise: 0, maxBet: 10 }),
    });
    expect(bad.status).toBe(400);

    const config = {
      players: [
        { id: "a", name: "Ali" },
        { id: "b", name: "Bo" },
        { id: "c", name: "Cy" },
      ],
      minRaise: 5,
      maxBet: 100,
    };
    const saved = await api("/api/config", { method: "PUT", body: JSON.stringify(config) });
    expect(saved.status).toBe(200);
    const onDisk = await readFile(path.join(dataDir, "config.yaml"), "utf8");
    expect(onDisk).toContain("Ali");
  });
});

describe("session lifecycle over HTTP", () => {
  let sessionId: string;

  it("creates a session with a subset of players", async () => {
    const response = await api("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ name: "Friday", playerIds: ["a", "b"] }),
    });
    expect(response.status).toBe(201);
    const session = await body<{ id: string; players: { id: string }[] }>(response);
    sessionId = session.id;
    expect(session.players.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("plays a match through commands and persists every step", async () => {
    const start = await api(`/api/sessions/${sessionId}/commands`, {
      method: "POST",
      body: JSON.stringify({ command: { type: "startMatch", participantIds: ["a", "b"] } }),
    });
    expect(start.status).toBe(200);
    const withMatch = await body<{ matches: { id: string }[] }>(start);
    const matchId = withMatch.matches[0]?.id;
    if (!matchId) throw new Error("no match created");

    const record = async (playerId: string, actionType: string, amount = 0) => {
      const response = await api(`/api/sessions/${sessionId}/commands`, {
        method: "POST",
        body: JSON.stringify({
          command: { type: "recordAction", matchId, playerId, actionType, amount },
        }),
      });
      expect(response.status).toBe(200);
      return response;
    };

    await record("a", "raise", 10);
    await record("b", "raise", 15);

    const settle = await api(`/api/sessions/${sessionId}/commands`, {
      method: "POST",
      body: JSON.stringify({
        command: { type: "selectWinners", matchId, winnerIds: ["a", "b"] },
      }),
    });
    expect(settle.status).toBe(200);

    const onDisk = await readFile(path.join(dataDir, "sessions", `${sessionId}.yaml`), "utf8");
    expect(onDisk).toContain("raise");
    expect(onDisk).toContain("winners");

    const files = await readdir(path.join(dataDir, "sessions"));
    expect(files.some((f) => f.endsWith(".tmp"))).toBe(false);

    const summary = await body<
      { id: string; matchCount: number; balances: Record<string, number> }[]
    >(await api("/api/sessions"));
    const mine = summary.find((s) => s.id === sessionId);
    expect(mine?.matchCount).toBe(1);
    const total = Object.values(mine?.balances ?? {}).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(0);
  });

  it("rejects invalid commands with a domain error code", async () => {
    const response = await api(`/api/sessions/${sessionId}/commands`, {
      method: "POST",
      body: JSON.stringify({ command: { type: "setRoster", playerIds: [] } }),
    });
    expect(response.status).toBe(400);
    const error = await body<{ code: string }>(response);
    expect(error.code).toBe("roster-empty");
  });

  it("quarantines corrupt session files instead of crashing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const dir = path.join(dataDir, "sessions");
    await writeFile(path.join(dir, "broken.yaml"), "::: not yaml :::", "utf8");
    const response = await api("/api/sessions");
    expect(response.status).toBe(200);
    const sessions = await body<{ id: string }[]>(response);
    expect(sessions.some((s) => s.id === "broken")).toBe(false);
    const quarantine = await readdir(path.join(dir, ".quarantine"));
    expect(quarantine.some((f) => f.includes("broken.yaml"))).toBe(true);
    warn.mockRestore();
  });

  it("deletes a session", async () => {
    const response = await api(`/api/sessions/${sessionId}`, { method: "DELETE" });
    expect(response.status).toBe(200);
    const sessions = await body<{ id: string }[]>(await api("/api/sessions"));
    expect(sessions.some((s) => s.id === sessionId)).toBe(false);
  });
});
