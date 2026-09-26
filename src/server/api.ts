import { randomUUID } from "node:crypto";
import {
  type AppConfig,
  type Command,
  DomainError,
  type PlayerSnapshot,
  type Session,
  applyCommand,
  createSession,
  resolvePlayers,
  sessionBalances,
  validateConfig,
} from "../domain";
import type { SessionSummary, SetupStatus } from "../shared/api";
import {
  deleteSessionFile,
  listSessions,
  mutateSession,
  readConfig,
  readDataDir,
  readSession,
  scaffold,
  writeConfig,
  writeLocation,
  writeSession,
} from "./storage";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function requireDataDir(): string {
  const dataDir = readDataDir();
  if (!dataDir) {
    throw new DomainError("invalid-config", "data directory is not configured");
  }
  return dataDir;
}

function summarize(session: Session, config: AppConfig): SessionSummary {
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
    newId: () => randomUUID(),
    random: () => Math.random(),
  };
}

async function readBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new DomainError("invalid-config", "request body must be valid JSON");
  }
}

export async function handleApi(request: Request, url: URL): Promise<Response> {
  try {
    return await route(request, url);
  } catch (error) {
    if (error instanceof DomainError) {
      return json({ error: error.message, code: error.code }, 400);
    }
    throw error;
  }
}

async function route(request: Request, url: URL): Promise<Response> {
  const segments = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const rest = segments.slice(1);
  const method = request.method;

  if (rest[0] === "setup") {
    if (method === "GET") {
      const dataDir = readDataDir();
      const status: SetupStatus = { configured: Boolean(dataDir), dataDir };
      if (dataDir) await scaffold(dataDir);
      return json(status);
    }
    if (method === "POST") {
      const body = await readBody<{ dataDir?: unknown }>(request);
      if (typeof body.dataDir !== "string" || !body.dataDir.trim()) {
        throw new DomainError("invalid-config", "dataDir must be a non-empty string");
      }
      await writeLocation(body.dataDir.trim());
      const dataDir = requireDataDir();
      return json({ configured: true, dataDir, config: await readConfig(dataDir) });
    }
  }

  if (rest[0] === "config") {
    const dataDir = requireDataDir();
    if (method === "GET") return json(await readConfig(dataDir));
    if (method === "PUT") {
      const body = await readBody<AppConfig>(request);
      validateConfig(body);
      await writeConfig(dataDir, body);
      return json(await readConfig(dataDir));
    }
  }

  if (rest[0] === "sessions") {
    const dataDir = requireDataDir();
    const id = rest[1];

    if (!id) {
      if (method === "GET") {
        const config = await readConfig(dataDir);
        const sessions = await listSessions(dataDir);
        return json(sessions.map((s) => summarize(s, config)));
      }
      if (method === "POST") {
        const body = await readBody<{ name?: unknown; playerIds?: unknown }>(request);
        const name =
          typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Poker night";
        if (!Array.isArray(body.playerIds) || body.playerIds.some((v) => typeof v !== "string")) {
          throw new DomainError("invalid-config", "playerIds must be an array of ids");
        }
        const config = await readConfig(dataDir);
        const roster: PlayerSnapshot[] = resolvePlayers(config, body.playerIds as string[]);
        if (roster.length === 0) {
          throw new DomainError("roster-empty", "select at least one player for the session");
        }
        const session = createSession(randomUUID(), name, roster, new Date().toISOString());
        await writeSession(dataDir, session);
        return json(session, 201);
      }
      return json({ error: "method not allowed", code: "method-not-allowed" }, 405);
    }

    if (method === "GET") return json(await readSession(dataDir, id));
    if (method === "DELETE") {
      await deleteSessionFile(dataDir, id);
      return json({ ok: true });
    }
    if (method === "PATCH") {
      const body = await readBody<{ name?: unknown }>(request);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) throw new DomainError("invalid-config", "session name must not be empty");
      const next = await mutateSession(dataDir, id, (session) => ({
        ...session,
        name,
        updatedAt: new Date().toISOString(),
      }));
      return json(next);
    }

    if (rest[2] === "commands" && method === "POST") {
      const body = await readBody<{ command?: Command }>(request);
      if (!body.command || typeof body.command !== "object" || !("type" in body.command)) {
        throw new DomainError("invalid-config", "a command is required");
      }
      const config = await readConfig(dataDir);
      const next = await mutateSession(dataDir, id, (session) =>
        applyCommand(session, config, body.command as Command, makeDeps()),
      );
      return json(next);
    }
  }

  return json({ error: "not found", code: "not-found" }, 404);
}
