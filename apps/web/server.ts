import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = normalize(join(webRoot, "..", ".."));
const port = Number(process.env.PORT ?? "8787");

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".sfw": "application/octet-stream",
  ".svg": "image/svg+xml; charset=utf-8",
};

function contentType(path: string): string {
  return mimeTypes[extname(path).toLowerCase()] ?? "application/octet-stream";
}

function safeJoin(root: string, relativePath: string): string | null {
  const candidate = normalize(join(root, relativePath));
  if (!candidate.startsWith(root)) {
    return null;
  }
  return candidate;
}

async function fileResponse(path: string): Promise<Response> {
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      return new Response("Not Found", { status: 404 });
    }
  } catch {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(Bun.file(path), {
    headers: {
      "cache-control": "no-store",
      "content-type": contentType(path),
    },
  });
}

function resolvePath(url: URL): string | null {
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return join(webRoot, "index.html");
  }
  if (url.pathname === "/favicon.ico") {
    return join(webRoot, "favicon.ico");
  }
  if (url.pathname === "/favicon.png") {
    return join(webRoot, "favicon.png");
  }
  if (url.pathname.startsWith("/dist/")) {
    return safeJoin(join(webRoot, "dist"), decodeURIComponent(url.pathname.slice("/dist/".length)));
  }
  if (url.pathname.startsWith("/downloads/")) {
    return safeJoin(
      join(repoRoot, "downloads"),
      decodeURIComponent(url.pathname.slice("/downloads/".length)),
    );
  }
  return null;
}

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const path = resolvePath(url);
    if (!path) {
      return new Response("Not Found", { status: 404 });
    }
    return fileResponse(path);
  },
});

console.log(`Axon web app listening on http://127.0.0.1:${server.port}`);
