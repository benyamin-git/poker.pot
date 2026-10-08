import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OnboardingScreen } from "../src/client/screens/OnboardingScreen";

describe("onboarding wizard", () => {
  it("renders the welcome step with both starting choices", () => {
    const html = renderToString(<OnboardingScreen />);
    expect(html).toContain("Welcome to poker.pot");
    expect(html).toContain("Start fresh");
    expect(html).toContain("Import a backup");
  });

  it("renders the players step with the roster editor", () => {
    const html = renderToString(<OnboardingScreen initialStep="players" />);
    expect(html).toContain("Players");
    expect(html).toContain("Player name");
    expect(html).toContain("Next");
  });

  it("renders the limits step with the rules editor", () => {
    const html = renderToString(<OnboardingScreen initialStep="limits" />);
    expect(html).toContain("Minimum raise");
    expect(html).toContain("Max bet");
    expect(html).toContain("Next");
  });

  it("renders the finish step with the start action", () => {
    const html = renderToString(<OnboardingScreen initialStep="finish" />);
    expect(html).toContain("Ready");
    expect(html).toContain("Start using poker.pot");
  });
});
