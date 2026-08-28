// src/vite-shims/assert-strict.mjs
//
// Browser stub for `node:assert/strict`.  The production math_validator.mjs
// uses node:assert (precondition checks).  In the browser we replace it with
// a thin shim that throws on failure (matching assert.ok semantics) without
// pulling in node built-ins.
//
// This shim is wired in via vite.config.ts → resolve.alias.  It MUST stay
// in sync with node:assert/stict semantics for the assertions used by
// math_validator.mjs:
//   - assert.ok(value, msg)
//   - assert.equal(a, b, msg)
//   - assert.notEqual(a, b, msg)
//   - assert.deepEqual(a, b, msg)
//   - assert.fail(msg)
//   - assert.<anything>.ok/.equal/... (delegated via .strict)

function makeAssert(strict) {
  const a = {
    ok(value, msg) {
      if (!value) throw new Error(msg ?? "assert.ok failed");
    },
    equal(a, b, msg) {
      if (a !== b) throw new Error(msg ?? `assert.equal: ${a} !== ${b}`);
    },
    notEqual(a, b, msg) {
      if (a === b) throw new Error(msg ?? `assert.notEqual: ${a} === ${b}`);
    },
    deepEqual(a, b, msg) {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error(msg ?? `assert.deepEqual failed`);
      }
    },
    fail(msg) { throw new Error(msg ?? "assert.fail"); },
    strict: null,  // populated below
  };
  a.strict = strict ? a : makeAssert(true);
  return a;
}

const assert = makeAssert(false);
export default assert;
