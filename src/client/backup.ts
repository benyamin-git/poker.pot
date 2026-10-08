import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import type { AppConfig, Match, Session } from "../domain";
import { isIos } from "./platform";
import type { Store } from "./storage";

export const BACKUP_APP = "poker.pot";
export const BACKUP_SCHEMA_VERSION = 1;

export type BackupErrorCode = "invalid-yaml" | "invalid-bundle" | "future-version";

export class BackupError extends Error {
  readonly code: BackupErrorCode;

  constructor(code: BackupErrorCode, message: string) {
    super(message);
    this.name = "BackupError";
    this.code = code;
  }
}

export interface BackupBundle {
  app: "poker.pot";
  schemaVersion: number;
  exportedAt: string;
  data: { config: AppConfig; sessions: Session[] };
}

export interface MergeConflict {
  local: Session;
  incoming: Session;
}

export interface MergePlan {
  added: Session[];
  conflicts: MergeConflict[];
  config: AppConfig;
}

const playerSchema = z.object({ id: z.string().min(1), name: z.string().min(1) });

const actionSchema = z.object({
  id: z.string().min(1),
  playerId: z.string().min(1),
  type: z.enum(["check", "fold", "call", "raise"]),
  amount: z.number(),
  createdAt: z.string().min(1),
});

const roundSchema = z.object({
  index: z.number().int().nonnegative(),
  actions: z.array(actionSchema),
});

const matchSchema = z.object({
  id: z.string().min(1),
  participants: z.array(playerSchema),
  rounds: z.array(roundSchema),
  status: z.enum(["active", "done"]),
  winners: z.array(z.string().min(1)),
  remainderSeed: z.number().optional(),
  createdAt: z.string().min(1),
  endedAt: z.string().optional(),
  endedBy: z.enum(["winners", "last-standing"]).optional(),
});

const sessionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["active", "paused", "ended"]),
  players: z.array(playerSchema),
  matches: z.array(matchSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const configSchema = z
  .object({
    players: z.array(playerSchema),
    minRaise: z.number().int().positive(),
    maxBet: z.number().int().positive(),
    currencyLabel: z.string().optional(),
  })
  .refine((config) => config.maxBet >= config.minRaise, {
    message: "maxBet must be greater than or equal to minRaise",
  });

const bundleSchema = z.object({
  app: z.literal(BACKUP_APP),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string().min(1),
  data: z.object({ config: configSchema, sessions: z.array(sessionSchema) }),
});

type RawBundle = z.infer<typeof bundleSchema>;
type RawMatch = z.infer<typeof matchSchema>;
type RawSession = z.infer<typeof sessionSchema>;

function toMatch(raw: RawMatch): Match {
  return {
    id: raw.id,
    participants: raw.participants.map((player) => ({ id: player.id, name: player.name })),
    rounds: raw.rounds.map((round) => ({
      index: round.index,
      actions: round.actions.map((action) => ({
        id: action.id,
        playerId: action.playerId,
        type: action.type,
        amount: action.amount,
        createdAt: action.createdAt,
      })),
    })),
    status: raw.status,
    winners: [...raw.winners],
    createdAt: raw.createdAt,
    ...(raw.remainderSeed !== undefined ? { remainderSeed: raw.remainderSeed } : {}),
    ...(raw.endedAt !== undefined ? { endedAt: raw.endedAt } : {}),
    ...(raw.endedBy !== undefined ? { endedBy: raw.endedBy } : {}),
  };
}

function toSession(raw: RawSession): Session {
  return {
    id: raw.id,
    name: raw.name,
    status: raw.status,
    players: raw.players.map((player) => ({ id: player.id, name: player.name })),
    matches: raw.matches.map(toMatch),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function toConfig(raw: RawBundle["data"]["config"]): AppConfig {
  return {
    players: raw.players.map((player) => ({ id: player.id, name: player.name })),
    minRaise: raw.minRaise,
    maxBet: raw.maxBet,
    ...(raw.currencyLabel !== undefined ? { currencyLabel: raw.currencyLabel } : {}),
  };
}

export function buildBundle(
  config: AppConfig,
  sessions: Session[],
  exportedAt: string,
): BackupBundle {
  return {
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    data: { config, sessions },
  };
}

export function bundleToYaml(bundle: BackupBundle): string {
  return stringifyYaml(bundle);
}

export function parseBundle(text: string): BackupBundle {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch {
    throw new BackupError("invalid-yaml", "the file is not valid YAML");
  }

  const version =
    typeof raw === "object" && raw !== null && "schemaVersion" in raw
      ? (raw as { schemaVersion?: unknown }).schemaVersion
      : undefined;
  if (typeof version === "number" && version > BACKUP_SCHEMA_VERSION) {
    throw new BackupError("future-version", "this backup was made by a newer version of poker.pot");
  }

  const result = bundleSchema.safeParse(raw);
  if (!result.success) {
    throw new BackupError(
      "invalid-bundle",
      result.error.issues[0]?.message ?? "invalid backup file",
    );
  }

  return {
    app: BACKUP_APP,
    schemaVersion: result.data.schemaVersion,
    exportedAt: result.data.exportedAt,
    data: {
      config: toConfig(result.data.data.config),
      sessions: result.data.data.sessions.map(toSession),
    },
  };
}

export function exportFilename(now: Date): string {
  const stamp = now.toISOString().slice(0, 19).replace(/:/g, "").replace("T", "-");
  return `poker.pot-backup-${stamp}.yaml`;
}

export function planMerge(
  local: { config: AppConfig; sessions: Session[] },
  incoming: { config: AppConfig; sessions: Session[] },
): MergePlan {
  const localIds = new Set(local.sessions.map((session) => session.id));
  const incomingById = new Map(incoming.sessions.map((session) => [session.id, session]));

  const added = incoming.sessions.filter((session) => !localIds.has(session.id));
  const conflicts = local.sessions.flatMap((session) => {
    const incomingSession = incomingById.get(session.id);
    return incomingSession ? [{ local: session, incoming: incomingSession }] : [];
  });

  const localPlayerIds = new Set(local.config.players.map((player) => player.id));
  const extraPlayers = incoming.config.players.filter((player) => !localPlayerIds.has(player.id));
  const config: AppConfig = {
    ...local.config,
    players: [...local.config.players, ...extraPlayers],
  };

  return { added, conflicts, config };
}

export function applyResolutions(
  plan: MergePlan,
  resolutions: Map<string, "local" | "incoming">,
): { config: AppConfig; sessions: Session[] } {
  const sessions = [...plan.added];
  for (const conflict of plan.conflicts) {
    const choice = resolutions.get(conflict.local.id);
    if (choice !== "local" && choice !== "incoming") {
      throw new BackupError(
        "invalid-bundle",
        `missing conflict resolution for session ${conflict.local.id}`,
      );
    }
    sessions.push(choice === "incoming" ? conflict.incoming : conflict.local);
  }
  return { config: plan.config, sessions };
}

function supportsFileShare(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({
      files: [new File([""], "probe.yaml", { type: "application/yaml" })],
    });
  } catch {
    return false;
  }
}

export async function saveBackupFile(
  bundle: BackupBundle,
): Promise<"shared" | "downloaded" | "cancelled"> {
  const text = bundleToYaml(bundle);
  const filename = exportFilename(new Date());

  if (isIos() && supportsFileShare()) {
    try {
      await navigator.share({
        files: [new File([text], filename, { type: "application/yaml" })],
        title: filename,
      });
      return "shared";
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        (error as { name?: unknown }).name === "AbortError"
      ) {
        return "cancelled";
      }
      throw error;
    }
  }

  const url = URL.createObjectURL(new Blob([text], { type: "application/yaml" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return "downloaded";
}

export async function readBackupFile(file: File): Promise<BackupBundle> {
  return parseBundle(await file.text());
}

export async function exportFromStore(
  store: Store,
  save: (bundle: BackupBundle) => Promise<"shared" | "downloaded" | "cancelled"> = saveBackupFile,
): Promise<"shared" | "downloaded" | "cancelled"> {
  const data = await store.exportData();
  const bundle = buildBundle(data.config, data.sessions, new Date().toISOString());
  const result = await save(bundle);
  if (result !== "cancelled") await store.markBackedUp();
  return result;
}

export async function importIntoStore(
  store: Store,
  bundle: BackupBundle,
  mode: "replace" | "merge",
  resolutions?: Map<string, "local" | "incoming">,
): Promise<void> {
  if (mode === "replace") {
    await store.replaceAll(bundle.data.config, bundle.data.sessions);
    return;
  }
  const local = await store.exportData();
  const plan = planMerge(local, bundle.data);
  const merged = applyResolutions(plan, resolutions ?? new Map());
  await store.putConfig(merged.config);
  await store.putSessions(merged.sessions);
}
