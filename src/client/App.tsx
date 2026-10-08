import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UpdateBanner } from "./components/UpdateBanner";
import { IconGear, IconList } from "./components/icons";
import { BottomTabs, Center, Screen } from "./components/ui";
import { MatchScreen } from "./screens/MatchScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { SessionScreen } from "./screens/SessionScreen";
import { SessionsScreen } from "./screens/SessionsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ConfigProvider } from "./state/config";
import { store } from "./storage";

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
      <UpdateBanner />
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

function OnboardingGate() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    store
      .isOnboarded()
      .then((value) => {
        if (active) setOnboarded(value);
      })
      .catch(() => {
        if (active) setOnboarded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (onboarded === null) {
    return (
      <Screen>
        <Center>
          <p className="muted">Loading…</p>
        </Center>
      </Screen>
    );
  }

  if (!onboarded) return <OnboardingScreen onDone={() => setOnboarded(true)} />;

  return <AppShell />;
}

export function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <OnboardingGate />
      </HashRouter>
    </ErrorBoundary>
  );
}
