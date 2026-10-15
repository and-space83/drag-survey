"use strict";
// Read the browser entry point, including split classic scripts and Worker assets.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const DEFAULT_ROOT = path.resolve(__dirname, "..");
const withoutComments = html => html.replace(/<!--[\s\S]*?-->/g, "");
function attribute(text, name) {
  const match = new RegExp("(?:^|\\s)" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i").exec(text);
  return match ? match[1] ?? match[2] ?? match[3] : null;
}
function localPath(root, reference, from = "index.html") {
  if (!reference || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)) return null;
  const pathname = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
  if (!pathname) return null;
  const relative = pathname.startsWith("/") ? pathname.slice(1) : path.posix.join(path.posix.dirname(from), pathname);
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(path.resolve(root) + path.sep)) throw new Error("App asset escapes its root: " + reference);
  return path.relative(root, absolute).replace(/\\/g, "/");
}
function classicScripts(html) {
  return Array.from(withoutComments(html).matchAll(/<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi), (match, index) => {
    const type = attribute(match[1], "type");
    return { index, attributes: match[1], src: attribute(match[1], "src"), text: match[2], classic: !type || /^(?:text|application)\/(?:java|ecma)script$/i.test(type) };
  }).filter(script => script.classic);
}
function readAppHtml(root = DEFAULT_ROOT) { return fs.readFileSync(path.join(root, "index.html"), "utf8"); }
function readAppSource(root = DEFAULT_ROOT, html = readAppHtml(root), { includeVendor = false } = {}) {
  // Keep the HTML as well: existing tests inspect both markup and engine functions.
  // Ignore commented examples of script tags when resolving actual dependencies.
  const comments = [];
  const protectedHtml = html.replace(/<!--[\s\S]*?-->/g, comment => "\u0000COMMENT" + (comments.push(comment) - 1) + "\u0000");
  return protectedHtml.replace(/<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi, (tag, attrs) => {
    const src = attribute(attrs, "src"), type = attribute(attrs, "type");
    if (!src || (type && !/^(?:text|application)\/(?:java|ecma)script$/i.test(type))) return tag;
    const file = localPath(root, src);
    if (!file) throw new Error("Cannot expand a remote app script: " + src);
    if (!includeVendor && file.startsWith("vendor/")) return tag;
    return "<script" + attrs + ">\n" + fs.readFileSync(path.join(root, file), "utf8") + "\n</script>";
  }).replace(/\u0000COMMENT(\d+)\u0000/g, (_, index) => comments[Number(index)]);
}
function appAssetPaths(root = DEFAULT_ROOT, html = readAppHtml(root)) {
  root = path.resolve(root);
  const found = new Set(["index.html"]), pending = [];
  function add(reference, from) {
    const file = localPath(root, reference, from);
    if (!file || found.has(file)) return;
    if (!fs.existsSync(path.join(root, file)) || !fs.statSync(path.join(root, file)).isFile()) throw new Error("Missing app asset: " + file + " (from " + (from || "index.html") + ")");
    found.add(file); pending.push(file);
  }
  const clean = withoutComments(html);
  for (const tag of clean.matchAll(/<(?:script|link)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)) {
    const src = attribute(tag[1], "src"), href = attribute(tag[1], "href"), rel = attribute(tag[1], "rel");
    if (src) add(src);
    else if (href && /(?:^|\s)stylesheet(?:\s|$)/i.test(rel || "")) add(href);
  }
  // Inline legacy engines may also declare Worker assets.
  const scripts = classicScripts(html).filter(script => !script.src).map(script => ["index.html", script.text]);
  while (pending.length || scripts.length) {
    const [file, text] = scripts.length ? scripts.shift() : (() => { const file = pending.shift(); return [file, fs.readFileSync(path.join(root, file), "utf8")]; })();
    if (/\.(?:js|html)$/i.test(file)) {
      for (const worker of text.matchAll(/\bnew\s+(?:Shared)?Worker\s*\(\s*["']([^"']+)["']/g)) add(worker[1]);
      for (const imported of text.matchAll(/\bimportScripts\s*\(([^)]*)\)/g)) for (const ref of imported[1].matchAll(/["']([^"']+)["']/g)) add(ref[1], file);
    }
    if (/\.css$/i.test(file)) {
      for (const ref of text.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)|@import\s+["']([^"']+)["']/g)) add(ref[1] || ref[2], file);
    }
  }
  // A bundled library's license must travel with the distribution too.
  if (found.has("vendor/pako.min.js")) add("vendor/pako-LICENSE");
  return Array.from(found);
}
function appAssets(root = DEFAULT_ROOT, prefix = "") {
  return new Map(appAssetPaths(root).map(file => [prefix + "/" + file, fs.readFileSync(path.join(root, file))]));
}
function sourceManifest(root = DEFAULT_ROOT) {
  return Object.fromEntries(appAssetPaths(root).map(file => [file, crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n")).digest("hex")]));
}
function transformAppScripts(assets, transform, prefix = "") {
  const index = prefix + "/index.html", html = assets.get(index)?.toString();
  if (html == null) throw new Error("Missing app entry point in asset map: " + index);
  for (const script of classicScripts(html)) {
    if (!script.src) continue;
    const file = localPath("/app-root", script.src), key = prefix + "/" + file;
    if (!assets.has(key)) throw new Error("Missing app script in asset map: " + key);
    assets.set(key, Buffer.from(transform(assets.get(key).toString(), file)));
  }
  assets.set(index, Buffer.from(html.replace(/<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi, (tag, attrs, text) => attribute(attrs, "src") ? tag : "<script" + attrs + ">" + transform(text, "index.html") + "</script>")));
  return assets;
}
module.exports = { readAppHtml, readAppSource, classicScripts, appAssetPaths, appAssets, sourceManifest, transformAppScripts };
