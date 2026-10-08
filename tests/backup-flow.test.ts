import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  type BackupBundle,
  buildBundle,
  bundleToYaml,
  exportFromStore,
  importIntoStore,
  parseBundle,
} from "../src/client/backup";
import { DEFAULT_CONFIG, type Store, createStore } from "../src/client/storage";
import { type PokerDb, createDb } from "../src/client/storage/db";
import type { AppConfig, Session } from "../src/domain";

const configA: AppConfig = {
  players: [
    { id: "p1", name: "Ada" },
    { id: "p2", name: "Grace" },
  ],
  minRaise: 5,
  maxBet: 100,
};

const configB: AppConfig = {
  players: [
    { id: "p2", name: "Grace" },
    { id: "p3", name: "Alan" },
  ],
  minRaise: 10,
  maxBet: 200,
};

function plainSession(id: string, name: string, stamp = "2026-10-08T10:00:00.000Z"): Session {
  return {
    id,
    name,
    status: "active",
    players: [{ id: "p1", name: "Ada" }],
    matches: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

let counter = 0;
const dbs: PokerDb[] = [];

function makeStore(): Store {
  counter += 1;
  const database = createDb(`poker.pot-flow-${Date.now()}-${counter}`);
  dbs.push(database);
  return createStore(database);
}

afterEach(async () => {
  await Promise.all(dbs.map((database) => database.delete()));
  dbs.length = 0;
});

describe("backup flows", () => {
  it("exports a bundle that replaces a wiped store", async () => {
    const store = makeStore();
    await store.saveConfig(configA);
    const session = await store.createSession("Friday", ["p1", "p2"]);
    let captured: BackupBundle | null = null;

    const result = await exportFromStore(store, async (bundle) => {
      captured = bundle;
      return "downloaded";
    });
    expect(result).toBe("downloaded");
    if (!captured) throw new Error("expected the export to capture a bundle");
    expect(await store.getLastBackupRevision()).toBe(await store.getRevision());
    expect(await store.getLastBackupAt()).toBeTruthy();

    await store.replaceAll(DEFAULT_CONFIG, []);
    await importIntoStore(store, parseBundle(bundleToYaml(captured)), "replace");

    expect(await store.getConfig()).toEqual(configA);
    expect((await store.listSessions()).map((entry) => entry.id)).toEqual([session.id]);
  });

  it("does not mark a cancelled export as backed up", async () => {
    const store = makeStore();
    await store.saveConfig(configA);
    await store.createSession("A", ["p1"]);

    const result = await exportFromStore(store, async () => "cancelled");
    expect(result).toBe("cancelled");
    expect(await store.getLastBackupRevision()).toBeNull();
    expect(await store.getLastBackupAt()).toBeNull();
  });

  it("merges added sessions and resolves conflicts to the imported side", async () => {
    const store = makeStore();
    await store.saveConfig(configA);
    await store.putSessions([
      plainSession("s1", "Local only"),
      plainSession("s2", "Local version"),
    ]);

    const incomingConflict = plainSession("s2", "Imported version", "2026-10-09T09:00:00.000Z");
    const incomingNew = plainSession("s3", "Imported only");
    const bundle = buildBundle(
      configB,
      [incomingConflict, incomingNew],
      "2026-10-09T10:00:00.000Z",
    );

    await importIntoStore(store, bundle, "merge", new Map([["s2", "incoming"]]));

    const sessions = await store.listSessions();
    expect(sessions.map((entry) => entry.id).sort()).toEqual(["s1", "s2", "s3"]);
    expect(sessions.find((entry) => entry.id === "s2")?.name).toBe("Imported version");

    const merged = await store.getConfig();
    expect(merged.players.map((player) => player.id)).toEqual(["p1", "p2", "p3"]);
    expect(merged.minRaise).toBe(5);
    expect(merged.maxBet).toBe(100);
  });

  it("keeps the local side for resolved conflicts", async () => {
    const store = makeStore();
    await store.saveConfig(configA);
    await store.putSessions([plainSession("s2", "Local version")]);
    const bundle = buildBundle(
      configB,
      [plainSession("s2", "Imported version")],
      "2026-10-09T10:00:00.000Z",
    );

    await importIntoStore(store, bundle, "merge", new Map([["s2", "local"]]));
    expect((await store.getSession("s2")).name).toBe("Local version");
  });

  it("refuses a merge with unresolved conflicts and changes nothing", async () => {
    const store = makeStore();
    await store.saveConfig(configA);
    await store.putSessions([plainSession("s2", "Local version")]);
    const bundle = buildBundle(
      configB,
      [plainSession("s2", "Imported version")],
      "2026-10-09T10:00:00.000Z",
    );

    await expect(importIntoStore(store, bundle, "merge")).rejects.toMatchObject({
      code: "invalid-bundle",
    });
    expect((await store.getSession("s2")).name).toBe("Local version");
  });

  it("detects data changed since the last backup", async () => {
    const store = makeStore();
    await store.saveConfig(configA);
    await store.putSessions([plainSession("s1", "A")]);
    await exportFromStore(store, async () => "downloaded");
    expect(await store.getRevision()).toBe(await store.getLastBackupRevision());

    await store.putSessions([plainSession("s2", "B")]);
    expect(await store.getRevision()).not.toBe(await store.getLastBackupRevision());
  });
});
