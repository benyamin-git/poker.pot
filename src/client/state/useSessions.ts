import { useCallback, useEffect, useState } from "react";
import { type SessionSummary, store } from "../storage";

export function useSessions() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await store.listSessionSummaries());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await store.deleteSession(id);
    setSessions((current) => current.filter((session) => session.id !== id));
  }, []);

  return { sessions, loading, error, refresh, remove };
}
