// scripts/daemon.mjs
//
// Thin HTTP daemon exposing Wigolo's engine functions for fast benchmark testing.
// Sits alongside the MCP server — doesn't replace it. The MCP path still works
// exactly as it did. This is an additional surface that lets the inner loop
// hit the engine directly without spawning Claude Code subprocesses.
//
// Uses Node stdlib only. Node 18+. ESM.
//
// To customize what's exposed, edit scripts/daemon-bridge.mjs (NOT this file).
//
// Run:   node scripts/daemon.mjs
// Env:   WIGOLO_DAEMON_PORT (default 7878)

import http from "node:http";
import { search, research, crawl, version } from "./daemon-bridge.mjs";

const PORT = parseInt(process.env.WIGOLO_DAEMON_PORT || "7878", 10);
const REQUEST_TIMEOUT_MS = 60_000;

const ROUTES = {
  "POST /search": async (body) => {
    if (!search) throw new Error("search not exported by daemon-bridge.mjs");
    return await search(body.query, body.opts || {});
  },
  "POST /research": async (body) => {
    if (!research) throw new Error("research not exported by daemon-bridge.mjs");
    return await research(body.query, body.opts || {});
  },
  "POST /crawl": async (body) => {
    if (!crawl) throw new Error("crawl not exported by daemon-bridge.mjs");
    return await crawl(body.url, body.opts || {});
  },
  "GET /health": async () => ({
    ok: true,
    version: version || "unknown",
    capabilities: {
      search: !!search,
      research: !!research,
      crawl: !!crawl,
    },
  }),
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  const key = `${req.method} ${req.url?.split("?")[0]}`;
  const handler = ROUTES[key];
  res.setHeader("Content-Type", "application/json");

  if (!handler) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found", route: key, available: Object.keys(ROUTES) }));
    return;
  }

  const timeoutId = setTimeout(() => {
    if (!res.writableEnded) {
      res.statusCode = 504;
      res.end(JSON.stringify({ error: "daemon_timeout", elapsed_ms: Date.now() - t0 }));
    }
  }, REQUEST_TIMEOUT_MS);

  try {
    const body = await readBody(req);
    const result = await handler(body);
    clearTimeout(timeoutId);
    if (!res.writableEnded) {
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, elapsed_ms: Date.now() - t0, result }));
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err?.message || err), stack: err?.stack, elapsed_ms: Date.now() - t0 }));
    }
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[wigolo-daemon] listening on http://127.0.0.1:${PORT}`);
  console.log(`[wigolo-daemon] routes: ${Object.keys(ROUTES).join(", ")}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT",  () => server.close(() => process.exit(0)));
