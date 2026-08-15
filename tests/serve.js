/* 検証用のローカル静的サーバー（node tests/serve.js）。
   python -m http.server は連続E2Eで接続リセット（ERR_CONNECTION_RESET）が頻発し、
   ページのJS読み込みが欠けて無関係のFAILを生むため（2026-07-31に多発を確認）、
   node の http でキープアライブつきの配信に置き換える。ポートは従来と同じ 8123 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = 8123;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const file = path.join(ROOT, urlPath.replace(/^\/+/, ""));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
      res.end(data);
    });
  } catch (e) {
    res.writeHead(500); res.end();
  }
});
server.keepAliveTimeout = 60000;
server.listen(PORT, "127.0.0.1", () => console.log("serving " + ROOT + " at http://127.0.0.1:" + PORT));
