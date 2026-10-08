import { useCallback, useEffect, useRef, useState } from "react";
import type { Command, Session } from "../../domain";
import { store } from "../storage";

export function useSession(id: string | undefined) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeId = useRef(id);

  useEffect(() => {
    activeId.current = id;
    if (!id) return;
    setLoading(true);
    store
      .getSession(id)
      .then((next) => {
        if (activeId.current !== id) return;
        setSession(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (activeId.current !== id) return;
        setError(err instanceof Error ? err.message : "Failed to load session");
      })
      .finally(() => {
        if (activeId.current === id) setLoading(false);
      });
  }, [id]);

  const send = useCallback(
    async (command: Command): Promise<Session | null> => {
      const currentId = id;
      if (!currentId) return null;
      setSending(true);
      try {
        const next = await store.command(currentId, command);
        setSession(next);
        setError(null);
        return next;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Command failed");
        throw err;
      } finally {
        setSending(false);
      }
    },
    [id],
  );

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const next = await store.getSession(id);
      setSession(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [id]);

  return { session, loading, sending, error, send, refresh };
}
