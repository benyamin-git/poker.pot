import { describe, expect, it } from "vitest";
import {
  BACKUP_SCHEMA_VERSION,
  BackupError,
  applyResolutions,
  buildBundle,
  bundleToYaml,
  exportFilename,
  parseBundle,
  planMerge,
} from "../src/client/backup";
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
  currencyLabel: "EUR",
};

function session(id: string, name: string, createdAt = "2026-10-08T10:00:00.000Z"): Session {
  return {
    id,
    name,
    status: "active",
    players: [{ id: "p1", name: "Ada" }],
    matches: [],
    createdAt,
    updatedAt: createdAt,
  };
}

const sessionWithMatch: Session = {
  ...session("s2", "With match"),
  players: [
    { id: "p1", name: "Ada" },
    { id: "p2", name: "Grace" },
  ],
  matches: [
    {
      id: "m1",
      participants: [
        { id: "p1", name: "Ada" },
        { id: "p2", name: "Grace" },
      ],
      rounds: [
        {
          index: 0,
          actions: [
            {
              id: "a1",
              playerId: "p1",
              type: "raise",
              amount: 10,
              createdAt: "2026-10-08T10:01:00.000Z",
            },
          ],
        },
      ],
      status: "done",
      winners: ["p1"],
      remainderSeed: 42,
      createdAt: "2026-10-08T10:01:00.000Z",
      endedAt: "2026-10-08T10:02:00.000Z",
      endedBy: "winners",
    },
  ],
};

function expectBackupError(run: () => unknown, code: BackupError["code"]): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(BackupError);
    expect((error as BackupError).code).toBe(code);
    return;
  }
  throw new Error(`expected BackupError with code ${code}`);
}

describe("backup bundles", () => {
  it("round-trips a bundle through yaml", () => {
    const bundle = buildBundle(configA, [sessionWithMatch], "2026-10-08T10:00:00.000Z");
    expect(parseBundle(bundleToYaml(bundle))).toEqual(bundle);
  });

  it("rejects invalid yaml", () => {
    expectBackupError(() => parseBundle("app: [unclosed"), "invalid-yaml");
  });

  it("rejects a bundle for another app", () => {
    const bundle = buildBundle(configA, [], "2026-10-08T10:00:00.000Z");
    expectBackupError(
      () => parseBundle(bundleToYaml({ ...bundle, app: "other" as "poker.pot" })),
      "invalid-bundle",
    );
  });

  it("rejects a structurally invalid bundle", () => {
    const raw = { app: "poker.pot", schemaVersion: 1, exportedAt: "2026-10-08", data: {} };
    expectBackupError(() => parseBundle(JSON.stringify(raw)), "invalid-bundle");
  });

  it("rejects a future schema version before validating shapes", () => {
    const bundle = buildBundle(configA, [], "2026-10-08T10:00:00.000Z");
    expectBackupError(
      () =>
        parseBundle(
          bundleToYaml({ ...bundle, schemaVersion: BACKUP_SCHEMA_VERSION + 1, data: {} as never }),
        ),
      "future-version",
    );
  });

  it("formats export filenames from the timestamp", () => {
    expect(exportFilename(new Date("2026-10-08T14:30:12.000Z"))).toBe(
      "poker.pot-backup-2026-10-08-143012.yaml",
    );
  });
});

describe("merge planning", () => {
  const localA = session("s1", "Local only");
  const localB = session("s2", "Local version", "2026-10-08T11:00:00.000Z");
  const incomingB = { ...session("s2", "Imported version", "2026-10-09T09:00:00.000Z") };
  const incomingC = session("s3", "Imported only");

  it("adds new sessions and reports conflicts", () => {
    const plan = planMerge(
      { config: configA, sessions: [localA, localB] },
      { config: configB, sessions: [incomingB, incomingC] },
    );
    expect(plan.added).toEqual([incomingC]);
    expect(plan.conflicts).toEqual([{ local: localB, incoming: incomingB }]);
  });

  it("unions the roster by id and keeps local limits", () => {
    const plan = planMerge({ config: configA, sessions: [] }, { config: configB, sessions: [] });
    expect(plan.config.players.map((player) => player.id)).toEqual(["p1", "p2", "p3"]);
    expect(plan.config.minRaise).toBe(5);
    expect(plan.config.maxBet).toBe(100);
    expect(plan.config.currencyLabel).toBeUndefined();
  });

  it("applies the chosen side per conflict", () => {
    const plan = planMerge(
      { config: configA, sessions: [localA, localB] },
      { config: configB, sessions: [incomingB, incomingC] },
    );

    const keepLocal = applyResolutions(plan, new Map([["s2", "local" as const]]));
    expect(keepLocal.sessions).toEqual([incomingC, localB]);
    expect(keepLocal.config.players.map((player) => player.id)).toEqual(["p1", "p2", "p3"]);

    const useIncoming = applyResolutions(plan, new Map([["s2", "incoming" as const]]));
    expect(useIncoming.sessions).toEqual([incomingC, incomingB]);
  });

  it("requires a resolution for every conflict", () => {
    const plan = planMerge(
      { config: configA, sessions: [localB] },
      { config: configB, sessions: [incomingB] },
    );
    expectBackupError(() => applyResolutions(plan, new Map()), "invalid-bundle");
  });
});
