import path from "node:path";

const PORT = Number(process.env.PORT ?? 7403);
const DIST = path.resolve(process.cwd(), "dist");

function resolveInDist(pathname: string): string | null {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(DIST, relative);
  if (resolved !== DIST && !resolved.startsWith(DIST + path.sep)) return null;
  return resolved;
}

async function serveStatic(url: URL): Promise<Response> {
  let pathname: string | null = null;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    pathname = null;
  }

  if (pathname) {
    const resolved = resolveInDist(pathname);
    if (resolved) {
      const file = Bun.file(resolved);
      if (await file.exists()) return new Response(file);
    }
  }

  const fallback = Bun.file(path.join(DIST, "index.html"));
  if (await fallback.exists()) return new Response(fallback);
  return new Response("Client build not found. Run `bun run build` first.", { status: 404 });
}

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  fetch(request) {
    return serveStatic(new URL(request.url));
  },
});

console.log(`poker.pot server listening on http://${server.hostname}:${server.port}`);
