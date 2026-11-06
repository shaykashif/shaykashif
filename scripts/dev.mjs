// Live preview for writing. Serves the site exactly as it is (real CSS, fonts,
// dark mode) and rebuilds the page and reloads the browser every time you save
// the draft. It never touches index.html or sitemap.xml; run `npm run article`
// when you are ready to publish.
//
//   npm run dev -- ../drafts/my-essay.md
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { build, resolveDraft, ROOT } from "./article.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const portArg = args.indexOf("--port");
const PORT = portArg > -1 ? Number(args[portArg + 1]) : 8787;
if (!file) {
  console.error("Usage: npm run dev -- <draft.md> [--port 8787]");
  process.exit(1);
}
const draft = resolveDraft(file);

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".JPG": "image/jpeg",
  ".JPEG": "image/jpeg", ".png": "image/png", ".PNG": "image/png", ".woff2": "font/woff2",
  ".xml": "application/xml", ".mp3": "audio/mpeg", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon",
};
const BLOCKED = /^(\.|scripts\/|drafts\/)/;
const RELOAD = `<script>new EventSource("/__reload").onmessage=function(){location.reload()}</script>`;

const clients = new Set();
const reload = () => clients.forEach((res) => res.write("data: reload\n\n"));

let slug = "";
function rebuild() {
  try {
    const res = build(draft, { register: false });
    slug = res.slug;
    console.log(`${new Date().toLocaleTimeString()}  built ${path.basename(res.outFile)}`);
    res.warnings.forEach((w) => console.warn("  warning: " + w));
  } catch (e) {
    console.error(`${new Date().toLocaleTimeString()}  ${e.message}`);
  }
  reload();
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/__reload") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write("\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    if (!path.extname(rel) && fs.existsSync(path.join(ROOT, rel + ".html"))) rel += ".html";
    const full = path.resolve(ROOT, rel);
    if (BLOCKED.test(rel) || !full.startsWith(ROOT + path.sep) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }

    const type = TYPES[path.extname(full)] || "application/octet-stream";
    if (type.startsWith("text/html")) {
      const html = fs.readFileSync(full, "utf8").replace("</body>", RELOAD + "</body>");
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
      return res.end(html);
    }
    // Audio needs byte ranges so the browser can seek.
    const size = fs.statSync(full).size;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (range) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      res.writeHead(206, { "Content-Type": type, "Cache-Control": "no-store", "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
      return fs.createReadStream(full, { start, end }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store", "Accept-Ranges": "bytes", "Content-Length": size });
    fs.createReadStream(full).pipe(res);
  })
  .listen(PORT, "127.0.0.1", () => {
    rebuild();
    console.log(`\nPreview:  http://localhost:${PORT}/article-${slug}\nWatching: ${path.relative(ROOT, draft)}  (Ctrl+C to stop)\n`);
  });

// Watch the folder rather than the file: many editors save by replacing it.
let timer;
const trigger = (fn) => () => {
  clearTimeout(timer);
  timer = setTimeout(fn, 150);
};
fs.watch(path.dirname(draft), (_, name) => {
  if (name === path.basename(draft)) trigger(rebuild)();
});
for (const f of ["site.css", "footnotes.js"]) {
  fs.watch(path.join(ROOT, f), trigger(reload));
}
