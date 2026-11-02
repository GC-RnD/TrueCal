// TrueCal local server: serves the app AND the I-CAR lookup on one address, so there are no browser cross-origin problems.
//   node relay/server.js            then open http://localhost:8080
// To host it elsewhere later, run this file with Node on any server, or call relay/icar.js from a function on any provider.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { lookupVehicle, Blocked } = require("./icar");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".pdf": "application/pdf", ".webmanifest": "application/manifest+json",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-cache" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function handleLookup(url, res) {
  const year = url.searchParams.get("year") || "";
  const make = url.searchParams.get("make") || "";
  const model = url.searchParams.get("model") || "";
  const icarModel = url.searchParams.get("icarModel") || "";
  if (!make || !model) return send(res, 400, { error: "make and model are required" });
  try {
    send(res, 200, await lookupVehicle({ year, make, model, icarModel }));
  } catch (err) {
    send(res, err instanceof Blocked ? 503 : 502, { error: err.message, blocked: err instanceof Blocked });
  }
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/icar") return handleLookup(url, res);
    if (url.pathname === "/api/health") return send(res, 200, { ok: true });
    let file = path.join(ROOT, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!file.startsWith(ROOT) || file.includes(`${path.sep}relay${path.sep}`) || file.includes(`${path.sep}tools${path.sep}`) || file.includes(`${path.sep}.git`)) return send(res, 404, "Not found", "text/plain");
    fs.readFile(file, (err, data) => (err ? send(res, 404, "Not found", "text/plain") : send(res, 200, data, TYPES[path.extname(file)] || "application/octet-stream")));
  })
  .listen(PORT, "127.0.0.1", () => console.log(`TrueCal running at http://localhost:${PORT}`));
