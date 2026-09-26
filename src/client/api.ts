import type { AppConfig, Command, Session } from "../domain";
import type { SessionSummary, SetupStatus } from "../shared/api";

export class ApiError extends Error {
  readonly code: string;
  constructor(message: string, code = "request-failed") {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    let message = response.statusText;
    let code = `http-${response.status}`;
    try {
      const body = (await response.json()) as { error?: string; code?: string };
      if (body.error) message = body.error;
      if (body.code) code = body.code;
    } catch {
      // keep defaults
    }
    throw new ApiError(message, code);
  }
  return (await response.json()) as T;
}

export const api = {
  setupStatus: () => request<SetupStatus>("/api/setup"),
  configure: (dataDir: string) =>
    request<{ configured: boolean; dataDir: string; config: AppConfig }>("/api/setup", {
      method: "POST",
      body: JSON.stringify({ dataDir }),
    }),
  getConfig: () => request<AppConfig>("/api/config"),
  saveConfig: (config: AppConfig) =>
    request<AppConfig>("/api/config", { method: "PUT", body: JSON.stringify(config) }),
  listSessions: () => request<SessionSummary[]>("/api/sessions"),
  createSession: (name: string, playerIds: string[]) =>
    request<Session>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ name, playerIds }),
    }),
  getSession: (id: string) => request<Session>(`/api/sessions/${encodeURIComponent(id)}`),
  renameSession: (id: string, name: string) =>
    request<Session>(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  deleteSession: (id: string) =>
    request<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  command: (id: string, command: Command) =>
    request<Session>(`/api/sessions/${encodeURIComponent(id)}/commands`, {
      method: "POST",
      body: JSON.stringify({ command }),
    }),
};
