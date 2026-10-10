/* Lossless gzip for large local checkpoints and simple-request uploads. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./vendor/pako.min.js"));
  else root.PilotCodec = factory(root.pako);
})(typeof globalThis !== "undefined" ? globalThis : this, function (pako) {
  "use strict";
  const PREFIX = "pilot-gzip16-v1:", THRESHOLD = 256 * 1024, MAX_BYTES = 30 * 1024 * 1024;
  function base64(bytes) {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    let s = ""; for (let i = 0; i < bytes.length; i += 16384) s += String.fromCharCode(...bytes.subarray(i, i + 16384));
    return btoa(s);
  }
  function bytes(s) {
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(s, "base64"));
    return Uint8Array.from(atob(s), c => c.charCodeAt(0));
  }
  function pack(s) { return base64(pako.gzip(s)); }
  function unpack(s) { return pako.ungzip(bytes(s), { to: "string" }); }
  function encodeStorage(s) {
    if (s.length < THRESHOLD) return s;
    // localStorage stores UTF-16: pack two bytes per code unit, avoiding base64 expansion.
    const zipped = pako.gzip(s), units = [zipped.length % 2];
    for (let i = 0; i < zipped.length; i += 2) units.push(zipped[i] | ((zipped[i+1] || 0) << 8));
    let out = PREFIX;
    for (let i = 0; i < units.length; i += 16384) out += String.fromCharCode(...units.slice(i,i+16384));
    return out.length < s.length ? out : s;
  }
  function decodeStorage(s) {
    if (!s || !s.startsWith(PREFIX)) return s;
    const packed=s.slice(PREFIX.length), out=new Uint8Array((packed.length-1)*2-packed.charCodeAt(0));
    for(let i=1;i<packed.length;i++){const n=packed.charCodeAt(i);out[(i-1)*2]=n&255;if((i-1)*2+1<out.length)out[(i-1)*2+1]=n>>>8;}
    return pako.ungzip(out,{to:"string"});
  }
  function wire(s) {
    const size = new TextEncoder().encode(s).length;
    if (size > MAX_BYTES) { const e = new Error("payload_too_large"); e.code = "payload_too_large"; e.retryable = false; throw e; }
    if (size < THRESHOLD) return s;
    const encoded = JSON.stringify({ encoding: "gzip-base64-v1", utf8Bytes: size, data: pack(s) });
    return encoded.length < s.length ? encoded : s;
  }
  return { encodeStorage, decodeStorage, wire, MAX_BYTES };
});
