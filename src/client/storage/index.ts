import {
  type AppConfig,
  type Command,
  DomainError,
  type Session,
  applyCommand,
  createSession as makeSession,
  resolvePlayers,
  sessionBalances,
  validateConfig,
} from "../../domain";
import { newId } from "../id";
import type { PokerDb } from "./db";
import { createDb } from "./db";

export interface SessionSummary {
  id: string;
  name: string;
  status: Session["status"];
  createdAt: string;
  updatedAt: string;
  matchCount: number;
  balances: Record<string, number>;
}

export interface Store {
  getConfig(): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<AppConfig>;
  listSessions(): Promise<Session[]>;
  listSessionSummaries(): Promise<SessionSummary[]>;
  createSession(name: string, playerIds: string[]): Promise<Session>;
  getSession(id: string): Promise<Session>;
  renameSession(id: string, name: string): Promise<Session>;
  deleteSession(id: string): Promise<void>;
  command(id: string, command: Command): Promise<Session>;
  isOnboarded(): Promise<boolean>;
  completeOnboarding(): Promise<void>;
  getRevision(): Promise<number>;
  getLastBackupAt(): Promise<string | null>;
  getLastBackupRevision(): Promise<number | null>;
  markBackedUp(at?: string): Promise<void>;
  exportData(): Promise<{ config: AppConfig; sessions: Session[] }>;
  replaceAll(config: AppConfig, sessions: Session[]): Promise<void>;
  putSessions(sessions: Session[]): Promise<void>;
  putConfig(config: AppConfig): Promise<void>;
}

export const DEFAULT_CONFIG: AppConfig = { players: [], minRaise: 5, maxBet: 100 };

export function summarize(session: Session, config: AppConfig): SessionSummary {
  return {
    id: session.id,
    name: session.name,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    matchCount: session.matches.length,
    balances: sessionBalances(session, config),
  };
}

function makeDeps() {
  return {
    now: () => new Date().toISOString(),
    newId,
    random: () => Math.random(),
  };
}

export function createStore(database: PokerDb): Store {
  const readMeta = async <T>(key: string): Promise<T | undefined> => {
    const row = await database.meta.get(key);
    return row?.value as T | undefined;
  };

  const writeMeta = async (key: string, value: unknown): Promise<void> => {
    await database.meta.put({ key, value });
  };

  const bumpRevision = async (): Promise<number> => {
    const next = ((await readMeta<number>("revision")) ?? 0) + 1;
    await writeMeta("revision", next);
    return next;
  };

  const getConfig = async (): Promise<AppConfig> => {
    const row = await database.config.get("config");
    return row?.value ?? DEFAULT_CONFIG;
  };

  const getSessionRow = async (id: string): Promise<Session> => {
    const session = await database.sessions.get(id);
    if (!session) throw new DomainError("unknown-match", `unknown session: ${id}`);
    return session;
  };

  const listSessions = (): Promise<Session[]> => database.sessions.orderBy("createdAt").toArray();

  return {
    getConfig,

    async saveConfig(config) {
      validateConfig(config);
      return database.transaction("rw", database.config, database.meta, async () => {
        await database.config.put({ key: "config", value: config });
        await bumpRevision();
        return config;
      });
    },

    listSessions,

    async listSessionSummaries() {
      const [config, sessions] = await Promise.all([getConfig(), listSessions()]);
      return sessions.map((session) => summarize(session, config));
    },

    async createSession(name, playerIds) {
      const config = await getConfig();
      const roster = resolvePlayers(config, playerIds);
      if (roster.length === 0) {
        throw new DomainError("roster-empty", "select at least one player for the session");
      }
      const session = makeSession(
        newId(),
        name.trim() || "Poker night",
        roster,
        new Date().toISOString(),
      );
      await database.transaction("rw", database.sessions, database.meta, async () => {
        await database.sessions.put(session);
        await bumpRevision();
      });
      return session;
    },

    getSession: getSessionRow,

    async renameSession(id, name) {
      return database.transaction("rw", database.sessions, database.meta, async () => {
        const session = await getSessionRow(id);
        const trimmed = name.trim();
        if (!trimmed) {
          throw new DomainError("invalid-config", "session name must not be empty");
        }
        const next: Session = { ...session, name: trimmed, updatedAt: new Date().toISOString() };
        await database.sessions.put(next);
        await bumpRevision();
        return next;
      });
    },

    async deleteSession(id) {
      await database.transaction("rw", database.sessions, database.meta, async () => {
        const session = await database.sessions.get(id);
        if (!session) return;
        await database.sessions.delete(id);
        await bumpRevision();
      });
    },

    async command(id, command) {
      return database.transaction(
        "rw",
        database.sessions,
        database.config,
        database.meta,
        async () => {
          const session = await getSessionRow(id);
          const config = await getConfig();
          const next = applyCommand(session, config, command, makeDeps());
          await database.sessions.put(next);
          await bumpRevision();
          return next;
        },
      );
    },

    async isOnboarded() {
      return (await readMeta<boolean>("onboarded")) === true;
    },

    async completeOnboarding() {
      await database.transaction("rw", database.meta, async () => {
        await writeMeta("onboarded", true);
        await bumpRevision();
      });
    },

    async getRevision() {
      return (await readMeta<number>("revision")) ?? 0;
    },

    async getLastBackupAt() {
      return (await readMeta<string>("lastBackupAt")) ?? null;
    },

    async getLastBackupRevision() {
      return (await readMeta<number>("lastBackupRevision")) ?? null;
    },

    async markBackedUp(at) {
      await database.transaction("rw", database.meta, async () => {
        const revision = (await readMeta<number>("revision")) ?? 0;
        await writeMeta("lastBackupAt", at ?? new Date().toISOString());
        await writeMeta("lastBackupRevision", revision);
      });
    },

    async exportData() {
      return { config: await getConfig(), sessions: await listSessions() };
    },

    async replaceAll(config, sessions) {
      validateConfig(config);
      await database.transaction(
        "rw",
        database.config,
        database.sessions,
        database.meta,
        async () => {
          await database.config.put({ key: "config", value: config });
          await database.sessions.clear();
          await database.sessions.bulkPut(sessions);
          await bumpRevision();
        },
      );
    },

    async putSessions(sessions) {
      await database.transaction("rw", database.sessions, database.meta, async () => {
        await database.sessions.bulkPut(sessions);
        await bumpRevision();
      });
    },

    async putConfig(config) {
      validateConfig(config);
      await database.transaction("rw", database.config, database.meta, async () => {
        await database.config.put({ key: "config", value: config });
        await bumpRevision();
      });
    },
  };
}

export const db = createDb();
export const store = createStore(db);
