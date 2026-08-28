// src/vite-shims/path.mjs
//
// Browser shim for `node:path`.  The plugin uses path.join / path.dirname
// for filesystem paths — the browser shim does nothing meaningful (those
// operations never run in the browser; they're just imported for the
// module graph).  Provide identity-ish implementations that won't blow up
// if accidentally called.

export const join = (...parts) => parts.filter(Boolean).join("/");
export const dirname = (p) => {
  if (typeof p !== "string" || p === "") return ".";
  const idx = p.lastIndexOf("/");
  return idx <= 0 ? "." : p.slice(0, idx);
};
export const basename = (p) => {
  if (typeof p !== "string") return "";
  const idx = p.lastIndexOf("/");
  return idx < 0 ? p : p.slice(idx + 1);
};
export const extname = (p) => {
  if (typeof p !== "string") return "";
  const base = basename(p);
  const idx = base.lastIndexOf(".");
  return idx <= 0 ? "" : base.slice(idx);
};
export const resolve = (...parts) => "/" + join(...parts);
export const sep = "/";
export const delimiter = ":";

export default {
  join, dirname, basename, extname, resolve, sep, delimiter,
};
