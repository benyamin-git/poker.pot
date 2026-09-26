import { useNavigate } from "react-router-dom";
import { Screen, TopBar } from "../components/ui";

export function SettingsScreen() {
  const navigate = useNavigate();
  return (
    <Screen>
      <TopBar title="Settings" onBack={() => navigate("/")} />
      <div className="screen__body">
        <p className="muted">Coming soon.</p>
      </div>
    </Screen>
  );
}
