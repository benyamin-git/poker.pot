import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Center, Screen } from "./components/ui";
import { MatchScreen } from "./screens/MatchScreen";
import { SessionScreen } from "./screens/SessionScreen";
import { SessionsScreen } from "./screens/SessionsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SetupScreen } from "./screens/SetupScreen";
import { ConfigProvider } from "./state/config";

function ConfiguredApp() {
  const [state, setState] = useState<"loading" | "configured" | "unconfigured">("loading");

  useEffect(() => {
    let active = true;
    api
      .setupStatus()
      .then((status) => {
        if (active) setState(status.configured ? "configured" : "unconfigured");
      })
      .catch(() => {
        if (active) setState("unconfigured");
      });
    return () => {
      active = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <Screen>
        <Center>
          <p className="muted">Loading…</p>
        </Center>
      </Screen>
    );
  }

  if (state === "unconfigured") {
    return <Navigate to="/setup" replace />;
  }

  return (
    <ConfigProvider>
      <Routes>
        <Route path="/" element={<SessionsScreen />} />
        <Route path="/sessions/:sessionId" element={<SessionScreen />} />
        <Route path="/sessions/:sessionId/matches/:matchId" element={<MatchScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ConfigProvider>
  );
}

export function App() {
  return (
    <div className="app">
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="/setup" element={<SetupScreen />} />
            <Route path="*" element={<ConfiguredApp />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </div>
  );
}
