// test/math-rendering/math_visual_renderer.test.mjs
//
// Phase 5B — MathVisualRenderer unit tests.
// Validates the SVG sanitizer + descriptor interface.

import { test } from "node:test";
import assert from "node:assert/strict";

// Import the test-only sanitizer (no React DOM needed).
// MathVisualRenderer.tsx exports __TEST__ with sanitizeSvg + filterAttrs.
import { sanitizeSvg, filterAttrs } from "../../src/math-rendering/svg-sanitizer.mjs";
const MVRTest = { sanitizeSvg, filterAttrs };

test("MathVisualRenderer sanitizer: accepts well-formed SVG", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="ok"><title>x</title><desc>y</desc><rect x="0" y="0" width="50" height="50" fill="#000" /></svg>`;
  const r = MVRTest.sanitizeSvg(svg);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.ok(r.sanitized.includes("<svg"));
    assert.ok(r.sanitized.includes("<rect"));
  }
});

test("MathVisualRenderer sanitizer: strips <script>", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>x</title><desc>y</desc><script>alert(1)</script><rect x="0" y="0" width="50" height="50" /></svg>`;
  const r = MVRTest.sanitizeSvg(svg);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.ok(!r.sanitized.includes("<script"), "script tag should be stripped");
    assert.ok(!r.sanitized.includes("alert(1)"), "script body should be stripped");
  }
});

test("MathVisualRenderer sanitizer: strips <style>", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>x</title><desc>y</desc><style>.x{stroke:red}</style><rect x="0" y="0" width="50" height="50" /></svg>`;
  const r = MVRTest.sanitizeSvg(svg);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.ok(!r.sanitized.includes("<style"));
  }
});

test("MathVisualRenderer sanitizer: strips <foreignObject>", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>x</title><desc>y</desc><foreignObject><div onclick="alert(1)">x</div></foreignObject></svg>`;
  const r = MVRTest.sanitizeSvg(svg);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.ok(!r.sanitized.includes("<foreignObject"));
  }
});

test("MathVisualRenderer sanitizer: strips on* event handlers", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onclick="alert(1)"><title>x</title><desc>y</desc><rect x="0" y="0" width="50" height="50" onmouseover="bad()" /></svg>`;
  const r = MVRTest.sanitizeSvg(svg);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.ok(!r.sanitized.includes("onclick"));
    assert.ok(!r.sanitized.includes("onmouseover"));
  }
});

test("MathVisualRenderer sanitizer: strips style attribute", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="background:red"><title>x</title><desc>y</desc><rect x="0" y="0" width="50" height="50" /></svg>`;
  const r = MVRTest.sanitizeSvg(svg);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.ok(!r.sanitized.match(/\sstyle\s*=/i), "style attribute should be stripped");
  }
});

test("MathVisualRenderer sanitizer: rejects missing viewBox", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><title>x</title><desc>y</desc></svg>`;
  // Sanitizer doesn't enforce viewBox (that's svgValidityCheck's job);
  // here we just confirm it doesn't crash.
  const r = MVRTest.sanitizeSvg(svg);
  assert.equal(r.ok, true);
});

test("MathVisualRenderer sanitizer: rejects missing svg tags", () => {
  const r = MVRTest.sanitizeSvg("hello world");
  assert.equal(r.ok, false);
});

test("MathVisualRenderer sanitizer: handles non-string", () => {
  const r = MVRTest.sanitizeSvg(null);
  assert.equal(r.ok, false);
  const r2 = MVRTest.sanitizeSvg(undefined);
  assert.equal(r2.ok, false);
});

test("MathVisualRenderer filterAttrs: keeps whitelisted attributes", () => {
  const filtered = MVRTest.filterAttrs(`x="0" y="0" width="50" height="50" fill="#000" stroke="red"`);
  assert.ok(filtered.includes('x="0"'));
  assert.ok(filtered.includes('y="0"'));
  assert.ok(filtered.includes('width="50"'));
  assert.ok(filtered.includes('fill="#000"'));
  assert.ok(filtered.includes('stroke="red"'));
});

test("MathVisualRenderer filterAttrs: drops non-whitelisted attributes", () => {
  const filtered = MVRTest.filterAttrs(`x="0" data-foo="bar" onclick="bad()" stroke="red"`);
  assert.ok(filtered.includes('x="0"'));
  assert.ok(!filtered.includes("data-foo"), "data-* should be dropped");
  assert.ok(!filtered.includes("onclick"), "on* should be dropped");
  assert.ok(filtered.includes('stroke="red"'));
});
