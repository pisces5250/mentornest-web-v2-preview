// src/vite-shims/fs.mjs
//
// Browser shim for `node:fs`.  Provides the `promises` namespace + a few
// sync methods that throw if called (persistence is server-side).

const notAvailable = (op) => () => {
  throw new Error(
    `vite-shim: node:fs.${op}() is not available in the browser bundle. ` +
    `Persistence happens server-side via mentornest-learning plugin tools.`
  );
};

const promises = {
  readFile:   notAvailable("readFile"),
  writeFile:  notAvailable("writeFile"),
  mkdir:      notAvailable("mkdir"),
  rename:     notAvailable("rename"),
  unlink:     notAvailable("unlink"),
  readdir:    notAvailable("readdir"),
  stat:       notAvailable("stat"),
  access:     notAvailable("access"),
};

const fs = {
  promises,
  readFileSync:  notAvailable("readFileSync"),
  writeFileSync: notAvailable("writeFileSync"),
  existsSync:    notAvailable("existsSync"),
  mkdirSync:     notAvailable("mkdirSync"),
  statSync:      notAvailable("statSync"),
};

export default fs;
export { fs, promises };
