// ローカル動作確認用の最小静的サーバ。tools/pilot-anchor/ のみを公開する
// (リポジトリ root を出すと papers/ の proprietary 論文が LAN に露出するため範囲を限定)。
// 使い方: node serve.js  → http://<このPCのLAN IP>:8000/ をスマホで開く。
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = process.env.PORT || 8000;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const fp = path.join(ROOT, path.normalize(rel));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end("forbidden"); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(fp)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, "0.0.0.0", () => console.log(`serving ${ROOT} on http://0.0.0.0:${PORT}`));
