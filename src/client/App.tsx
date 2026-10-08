import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { IconGear, IconList } from "./components/icons";
import { BottomTabs, Center, Screen } from "./components/ui";
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

export function AppShell() {
  const location = useLocation();
  const showTabs = location.pathname === "/" || location.pathname === "/settings";
  return (
    <div className={showTabs ? "app app--tabbed" : "app"}>
      <Routes>
        <Route path="/setup" element={<SetupScreen />} />
        <Route path="*" element={<ConfiguredApp />} />
      </Routes>
      {showTabs ? (
        <BottomTabs
          items={[
            { to: "/", label: "Sessions", icon: <IconList /> },
            { to: "/settings", label: "Settings", icon: <IconGear /> },
          ]}
        />
      ) : null}
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
