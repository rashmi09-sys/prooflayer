// Serves a static export (Next.js `output: "export"`) for ProofLayer's browser
// journeys. Mounted read-only into the sandbox by the worker; repositories
// cannot change it. Usage: node static-server.mjs <dir> <port> [basePath]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const [dir, port = "3000", base = ""] = process.argv.slice(2);
const root = path.resolve(dir);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    let p = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (base && p.startsWith(base)) p = p.slice(base.length) || "/";
    let file = path.resolve(root, "." + p);
    if (!file.startsWith(root)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) {
      if (fs.existsSync(file + ".html")) file += ".html";
      else return res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(Number(port), "0.0.0.0");
