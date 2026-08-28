// src/vite-shims/fs-promises.mjs
//
// Browser shim for `node:fs/promises` and `node:fs`.  Used by the plugin's
// storage layer (question_store, mastery_store, learning_event_reader).
//
// The Web v2 adapter does NOT touch the filesystem directly.  All
// authoritative writes happen server-side in the production plugin via
// the OpenClaw tool surface.  The browser shim exists so the import chain
// resolves and Rollup can build the bundle.  Any accidental call from the
// browser will throw — which is correct (browser code must NOT persist
// learning evidence itself).

const notAvailable = (op) => () => {
  throw new Error(
    `vite-shim: node:fs.${op}() is not available in the browser bundle. ` +
    `Persistence happens server-side via mentornest-learning plugin tools.`
  );
};

const fs = {
  readFile:   notAvailable("readFile"),
  writeFile:  notAvailable("writeFile"),
  mkdir:      notAvailable("mkdir"),
  rename:     notAvailable("rename"),
  unlink:     notAvailable("unlink"),
  readdir:    notAvailable("readdir"),
  stat:       notAvailable("stat"),
  access:     notAvailable("access"),
};

export default fs;
export { fs };
