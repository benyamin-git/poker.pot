import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "./ui";

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <output className="update-banner">
      <span className="update-banner__text">New version available.</span>
      <Button size="sm" variant="primary" onClick={() => void updateServiceWorker(true)}>
        Reload
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Dismiss update notice"
        onClick={() => setNeedRefresh(false)}
      >
        Dismiss
      </Button>
    </output>
  );
}
