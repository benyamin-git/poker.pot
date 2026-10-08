import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, createStore } from "../src/client/storage";
import { type PokerDb, createDb } from "../src/client/storage/db";
import type { AppConfig } from "../src/domain";

const config: AppConfig = {
  players: [
    { id: "p1", name: "Ada" },
    { id: "p2", name: "Grace" },
    { id: "p3", name: "Alan" },
  ],
  minRaise: 5,
  maxBet: 100,
};

let counter = 0;
const dbs: PokerDb[] = [];

function makeStore() {
  counter += 1;
  const database = createDb(`poker.pot-test-${Date.now()}-${counter}`);
  dbs.push(database);
  return { database, store: createStore(database) };
}

afterEach(async () => {
  await Promise.all(dbs.map((database) => database.delete()));
  dbs.length = 0;
});

describe("storage", () => {
  it("returns the default config when none is stored", async () => {
    const { store } = makeStore();
    expect(await store.getConfig()).toEqual(DEFAULT_CONFIG);
  });

  it("rejects an invalid config and keeps the stored one", async () => {
    const { store } = makeStore();
    await store.saveConfig(config);
    await expect(store.saveConfig({ ...config, maxBet: 1 })).rejects.toMatchObject({
      code: "invalid-config",
    });
    expect(await store.getConfig()).toEqual(config);
  });

  it("creates a session and derives balances through commands", async () => {
    const { store } = makeStore();
    await store.saveConfig(config);
    const session = await store.createSession("Friday", ["p1", "p2"]);
    expect(session.name).toBe("Friday");
    expect(session.players.map((player) => player.id)).toEqual(["p1", "p2"]);

    const started = await store.command(session.id, {
      type: "startMatch",
      participantIds: ["p1", "p2"],
    });
    const matchId = started.matches[0]?.id;
    expect(matchId).toBeTruthy();
    if (!matchId) throw new Error("missing match");

    await store.command(session.id, {
      type: "recordAction",
      matchId,
      playerId: "p1",
      actionType: "raise",
      amount: 10,
    });
    await store.command(session.id, {
      type: "recordAction",
      matchId,
      playerId: "p2",
      actionType: "call",
    });
    await store.command(session.id, {
      type: "selectWinners",
      matchId,
      winnerIds: ["p1"],
    });

    const summaries = await store.listSessionSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.matchCount).toBe(1);
    expect(summaries[0]?.balances).toEqual({ p1: 10, p2: -10 });
  });

  it("rejects unknown sessions", async () => {
    const { store } = makeStore();
    await expect(store.getSession("missing")).rejects.toMatchObject({ code: "unknown-match" });
    await expect(store.command("missing", { type: "pauseSession" })).rejects.toMatchObject({
      code: "unknown-match",
    });
    await expect(store.renameSession("missing", "x")).rejects.toMatchObject({
      code: "unknown-match",
    });
  });

  it("renames, lists and deletes sessions", async () => {
    const { store } = makeStore();
    await store.saveConfig(config);
    const first = await store.createSession("A", ["p1"]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await store.createSession("B", ["p2"]);

    const renamed = await store.renameSession(first.id, "  Tuesday  ");
    expect(renamed.name).toBe("Tuesday");

    const summaries = await store.listSessionSummaries();
    expect(summaries.map((summary) => summary.name)).toEqual(["Tuesday", "B"]);

    await store.deleteSession(first.id);
    expect((await store.listSessions()).map((session) => session.id)).toEqual([second.id]);
    await expect(store.renameSession(first.id, "x")).rejects.toMatchObject({
      code: "unknown-match",
    });
  });

  it("rejects an empty roster and defaults an empty name", async () => {
    const { store } = makeStore();
    await store.saveConfig(config);
    await expect(store.createSession("Empty", [])).rejects.toMatchObject({ code: "roster-empty" });
    const session = await store.createSession("", ["p1"]);
    expect(session.name).toBe("Poker night");
  });

  it("tracks onboarding", async () => {
    const { store } = makeStore();
    expect(await store.isOnboarded()).toBe(false);
    await store.completeOnboarding();
    expect(await store.isOnboarded()).toBe(true);
    expect(await store.getRevision()).toBeGreaterThan(0);
  });

  it("bumps the revision on mutations and records backups", async () => {
    const { store } = makeStore();
    const start = await store.getRevision();
    await store.saveConfig(config);
    const afterConfig = await store.getRevision();
    expect(afterConfig).toBeGreaterThan(start);

    const session = await store.createSession("A", ["p1"]);
    const afterCreate = await store.getRevision();
    expect(afterCreate).toBeGreaterThan(afterConfig);

    await store.command(session.id, { type: "pauseSession" });
    const afterCommand = await store.getRevision();
    expect(afterCommand).toBeGreaterThan(afterCreate);

    expect(await store.getLastBackupAt()).toBeNull();
    expect(await store.getLastBackupRevision()).toBeNull();

    await store.markBackedUp("2026-10-08T12:00:00.000Z");
    expect(await store.getLastBackupAt()).toBe("2026-10-08T12:00:00.000Z");
    expect(await store.getLastBackupRevision()).toBe(afterCommand);

    await store.renameSession(session.id, "B");
    expect(await store.getRevision()).toBeGreaterThan(afterCommand);
    expect(await store.getLastBackupRevision()).toBe(afterCommand);
  });

  it("persists data across store instances sharing a database", async () => {
    counter += 1;
    const database = createDb(`poker.pot-test-${Date.now()}-${counter}`);
    dbs.push(database);
    const first = createStore(database);
    await first.saveConfig(config);
    const session = await first.createSession("Shared", ["p1"]);
    await first.completeOnboarding();

    const second = createStore(database);
    expect(await second.getConfig()).toEqual(config);
    expect((await second.listSessions()).map((entry) => entry.id)).toEqual([session.id]);
    expect(await second.isOnboarded()).toBe(true);
  });
});
