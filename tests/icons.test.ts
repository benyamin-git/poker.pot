import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function pngSize(file: string): { width: number; height: number } {
  const buffer = readFileSync(path.join(process.cwd(), file));
  expect(buffer.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe("icons", () => {
  it("ships the source mark", () => {
    expect(existsSync(path.join(process.cwd(), "public/icon.svg"))).toBe(true);
  });

  it.each<[string, number]>([
    ["public/icons/icon-192.png", 192],
    ["public/icons/icon-512.png", 512],
    ["public/icons/maskable-512.png", 512],
    ["public/icons/apple-touch-icon-180.png", 180],
    ["public/icons/icon-1024.png", 1024],
  ])("writes %s at %ip px", (file, size) => {
    expect(pngSize(file)).toEqual({ width: size, height: size });
  });
});
