import { describe, expect, it } from "vitest";
import { formatAmount, formatSigned, playerName, signedTone } from "../src/client/format";
import { newId } from "../src/client/id";
import type { AppConfig, Session } from "../src/domain";

const config: AppConfig = {
  players: [
    { id: "a", name: "Ali" },
    { id: "b", name: "Bo" },
    { id: "c", name: "Cy" },
  ],
  minRaise: 5,
  maxBet: 100,
};

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: "s",
    name: "Night",
    status: "active",
    players: [{ id: "a", name: "Ali" }],
    matches: [],
    createdAt: "x",
    updatedAt: "x",
    ...overrides,
  };
}

describe("playerName", () => {
  it("prefers the session roster", () => {
    const s = session({ players: [{ id: "b", name: "Bo" }] });
    expect(playerName("b", s, config)).toBe("Bo");
  });

  it("falls back to a match participant snapshot", () => {
    const s = session({
      players: [],
      matches: [
        {
          id: "m",
          participants: [{ id: "c", name: "Cy" }],
          rounds: [],
          status: "active",
          winners: [],
          createdAt: "x",
        },
      ],
    });
    expect(playerName("c", s, config)).toBe("Cy");
  });

  it("falls back to config, then to the raw id", () => {
    expect(playerName("a", null, config)).toBe("Ali");
    expect(playerName("z", null, config)).toBe("z");
    expect(playerName("z", null, null)).toBe("z");
  });
});

describe("amount formatting", () => {
  it("formats plain and currency amounts", () => {
    expect(formatAmount(10)).toBe("10");
    expect(formatAmount(10, "chips")).toBe("10 chips");
  });

  it("formats signed amounts", () => {
    expect(formatSigned(5)).toBe("+5");
    expect(formatSigned(-3)).toBe("-3");
    expect(formatSigned(0)).toBe("0");
    expect(formatSigned(5, "chips")).toBe("+5 chips");
  });

  it("classifies tone by sign", () => {
    expect(signedTone(1)).toBe("positive");
    expect(signedTone(-1)).toBe("negative");
    expect(signedTone(0)).toBe("");
  });
});

describe("newId fallback", () => {
  it("uses crypto.getRandomValues when randomUUID is unavailable", () => {
    const original = globalThis.crypto;
    const stub = {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0);
        return bytes;
      },
    };
    Object.defineProperty(globalThis, "crypto", { value: stub, configurable: true });
    try {
      expect(newId()).toBe("00000000-0000-4000-8000-000000000000");
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
  });
});
