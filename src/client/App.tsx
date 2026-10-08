import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { IconGear, IconList } from "./components/icons";
import { BottomTabs } from "./components/ui";
import { MatchScreen } from "./screens/MatchScreen";
import { SessionScreen } from "./screens/SessionScreen";
import { SessionsScreen } from "./screens/SessionsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ConfigProvider } from "./state/config";

export function AppShell() {
  const location = useLocation();
  const showTabs = location.pathname === "/" || location.pathname === "/settings";
  return (
    <div className={showTabs ? "app app--tabbed" : "app"}>
      <ConfigProvider>
        <Routes>
          <Route path="/" element={<SessionsScreen />} />
          <Route path="/sessions/:sessionId" element={<SessionScreen />} />
          <Route path="/sessions/:sessionId/matches/:matchId" element={<MatchScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ConfigProvider>
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
