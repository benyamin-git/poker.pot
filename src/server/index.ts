import path from "node:path";
import { DomainError } from "../domain";
import { handleApi, json } from "./api";

const PORT = Number(process.env.PORT ?? 3001);
const DIST = path.join(process.cwd(), "dist");

async function serveStatic(url: URL): Promise<Response> {
  const relative = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = Bun.file(path.join(DIST, relative));
  if (await file.exists()) return new Response(file);
  const fallback = Bun.file(path.join(DIST, "index.html"));
  if (await fallback.exists()) return new Response(fallback);
  return new Response("Client build not found. Run `bun run build` first.", { status: 404 });
}

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, url);
      }
      return await serveStatic(url);
    } catch (error) {
      if (error instanceof DomainError) {
        return json({ error: error.message, code: error.code }, 400);
      }
      console.error("[server] unhandled error:", error);
      return json({ error: "internal server error", code: "internal" }, 500);
    }
  },
});

console.log(`poker.pot server listening on http://${server.hostname}:${server.port}`);
