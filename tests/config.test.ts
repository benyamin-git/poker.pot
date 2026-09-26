import { describe, expect, it } from "vitest";
import { type AppConfig, DomainError, resolvePlayers, validateConfig } from "../src/domain";

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`expected DomainError ${code}, but nothing was thrown`);
}

const base: AppConfig = {
  players: [
    { id: "a", name: "Ali" },
    { id: "b", name: "Bo" },
  ],
  minRaise: 5,
  maxBet: 100,
};

describe("validateConfig", () => {
  it("accepts a well-formed config", () => {
    expect(() => validateConfig(base)).not.toThrow();
    expect(() => validateConfig({ ...base, players: [], minRaise: 1, maxBet: 1 })).not.toThrow();
  });

  it("rejects non-positive or non-integer stakes", () => {
    expectCode(() => validateConfig({ ...base, minRaise: 0 }), "invalid-config");
    expectCode(() => validateConfig({ ...base, minRaise: -5 }), "invalid-config");
    expectCode(() => validateConfig({ ...base, minRaise: 1.5 }), "invalid-config");
    expectCode(() => validateConfig({ ...base, maxBet: 0 }), "invalid-config");
    expectCode(() => validateConfig({ ...base, maxBet: 10.5 }), "invalid-config");
  });

  it("rejects a max bet below the min raise", () => {
    expectCode(() => validateConfig({ ...base, minRaise: 20, maxBet: 10 }), "invalid-config");
  });

  it("rejects malformed players", () => {
    expectCode(
      () => validateConfig({ ...base, players: [{ id: "", name: "Ali" }] }),
      "invalid-config",
    );
    expectCode(
      () => validateConfig({ ...base, players: [{ id: "a", name: "  " }] }),
      "invalid-config",
    );
    expectCode(
      () =>
        validateConfig({
          ...base,
          players: [
            { id: "a", name: "Ali" },
            { id: "a", name: "Twin" },
          ],
        }),
      "invalid-config",
    );
  });
});

describe("resolvePlayers", () => {
  it("resolves configured players in the requested order", () => {
    expect(resolvePlayers(base, ["b", "a"])).toEqual([
      { id: "b", name: "Bo" },
      { id: "a", name: "Ali" },
    ]);
  });

  it("throws on an unknown player id", () => {
    expectCode(() => resolvePlayers(base, ["a", "z"]), "unknown-player");
  });
});
