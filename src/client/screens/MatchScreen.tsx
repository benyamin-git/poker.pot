import { useNavigate, useParams } from "react-router-dom";
import { Screen, TopBar } from "../components/ui";

export function MatchScreen() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  return (
    <Screen>
      <TopBar title="Match" onBack={() => navigate(`/sessions/${sessionId ?? ""}`)} />
      <div className="screen__body">
        <p className="muted">Coming soon.</p>
      </div>
    </Screen>
  );
}
