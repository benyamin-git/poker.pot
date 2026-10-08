import Dexie, { type Table } from "dexie";
import type { AppConfig, Session } from "../../domain";

export interface ConfigRow {
  key: "config";
  value: AppConfig;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export class PokerDb extends Dexie {
  config!: Table<ConfigRow, string>;
  sessions!: Table<Session, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = "poker.pot") {
    super(name);
    this.version(1).stores({
      config: "key",
      sessions: "id, updatedAt, createdAt",
      meta: "key",
    });
  }
}

export function createDb(name?: string): PokerDb {
  return new PokerDb(name);
}

export const db = new PokerDb();
