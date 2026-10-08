import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { AppConfig } from "../../domain";
import { store } from "../storage";

interface ConfigContextValue {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  save: (config: AppConfig) => Promise<void>;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setConfig(await store.getConfig());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (next: AppConfig) => {
    const saved = await store.saveConfig(next);
    setConfig(saved);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ config, loading, error, refresh, save }),
    [config, loading, error, refresh, save],
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const value = useContext(ConfigContext);
  if (!value) throw new Error("useConfig must be used inside ConfigProvider");
  return value;
}
