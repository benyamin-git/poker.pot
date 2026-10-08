import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const INDEX_HTML = "<!doctype html><html><body>poker.pot test build</body></html>";
const SCRIPT_JS = "console.log('asset');";

function rawGet(port: number, target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.write(`GET ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
    });
    let data = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      data += chunk;
    });
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
  });
}

function startServer(cwd: string): Promise<{ port: number; stop: () => void }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("bun", [path.join(process.cwd(), "src/server/index.ts")], {
      cwd,
      env: { ...process.env, PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = proc.stdout;
    if (!stdout) {
      proc.kill();
      reject(new Error("server process has no stdout"));
      return;
    }
    let buffer = "";
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`server did not start: ${buffer}`));
    }, 10000);
    stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = buffer.match(/listening on http:\/\/[^:]+:(\d+)/);
      if (match?.[1]) {
        clearTimeout(timer);
        resolve({ port: Number(match[1]), stop: () => proc.kill() });
      }
    });
    proc.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited with ${code}: ${buffer}`));
    });
  });
}

describe("static server", () => {
  let dir: string;
  let server: { port: number; stop: () => void };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "poker.pot-static-"));
    await mkdir(path.join(dir, "dist", "assets"), { recursive: true });
    await writeFile(path.join(dir, "dist", "index.html"), INDEX_HTML);
    await writeFile(path.join(dir, "dist", "assets", "app.js"), SCRIPT_JS);
    server = await startServer(dir);
  });

  afterAll(async () => {
    server.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it("serves index.html at the root", async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("poker.pot test build");
  });

  it("serves existing assets", async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/assets/app.js`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("asset");
  });

  it("falls back to index.html for client routes", async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/sessions/abc/matches/m1`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("poker.pot test build");
  });

  it("no longer exposes the api", async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/config`);
    expect(await response.text()).not.toContain("invalid-config");
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  it("does not serve files outside dist", async () => {
    const response = await rawGet(server.port, "/../../etc/passwd");
    expect(response).not.toContain("root:");
  });
});

describe("static server without a build", () => {
  let dir: string;
  let server: { port: number; stop: () => void };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "poker.pot-nobuild-"));
    server = await startServer(dir);
  });

  afterAll(async () => {
    server.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it("explains that the client build is missing", async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/`);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Client build not found");
  });
});
