// src/math-rendering/svg-sanitizer.mjs
//
// Phase 5B — Pure SVG sanitizer for MathVisualRenderer.
//
// Extracted from MathVisualRenderer.tsx so it can be unit-tested with
// node --test directly (no TypeScript transpilation needed for tests).
//
// Whitelist rules:
//   - Allowed tags: svg, g, title, desc, defs, rect, circle, ellipse, line,
//     polyline, polygon, path, text, tspan, marker, clipPath,
//     linearGradient, radialGradient, stop, pattern, use, symbol, switch.
//   - Allowed attributes: id, class, x, y, x1..y2, cx, cy, r, rx, ry,
//     width, height, d, points, viewBox, preserveAspectRatio, fill, stroke,
//     transform, text-anchor, font-*, xmlns, role, tabindex, focusable,
//     aria-hidden/label/describedby, marker-*, offset, stop-*, gradient-*,
//     clip-path, mask, filter.
//   - Stripped: <script>, <style>, <foreignObject>, style="..." attribute,
//     on* event handlers, data-* attributes.

export const ALLOWED_TAGS = new Set([
  "svg", "g", "title", "desc", "defs",
  "rect", "circle", "ellipse", "line", "polyline", "polygon", "path",
  "text", "tspan",
  "marker", "clipPath", "linearGradient", "radialGradient", "stop",
  "pattern", "use", "symbol", "switch",
]);

export const ALLOWED_ATTRS = new Set([
  "id", "class",
  "x", "y", "x1", "y1", "x2", "y2",
  "cx", "cy", "r", "rx", "ry",
  "width", "height",
  "d", "points", "viewbox", "preserveaspectratio",
  "fill", "fill-rule", "fill-opacity",
  "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-opacity",
  "opacity", "color",
  "transform", "text-anchor", "font-size", "font-family", "font-weight",
  "xmlns", "role", "tabindex", "focusable", "aria-hidden", "aria-label", "aria-describedby",
  "marker-start", "marker-mid", "marker-end",
  "offset", "stop-color", "stop-opacity", "gradient-units", "gradient-transform",
  "clip-path", "mask", "filter",
]);

export function filterAttrs(rawAttrs) {
  const allowed = [];
  const attrRe = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;
  while ((m = attrRe.exec(rawAttrs)) !== null) {
    const name = m[1];
    // SVG attribute names are case-sensitive (viewBox, preserveAspectRatio,
    // gradientTransform, etc.).  We whitelist by lowercased form but emit
    // the original case in the output so the browser accepts it.
    const nameLower = name.toLowerCase();
    if (!ALLOWED_ATTRS.has(nameLower)) continue;
    allowed.push(` ${name}=${m[2]}`);
  }
  return allowed.join("");
}

export function sanitizeSvg(input) {
  if (typeof input !== "string") return { ok: false, reason: "not-a-string" };
  if (!input.includes("<svg")) return { ok: false, reason: "missing-svg-tag" };
  if (!input.includes("</svg>")) return { ok: false, reason: "missing-svg-close" };

  let s = input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");

  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  let m;
  let lastIndex = 0;
  const out = [];
  while ((m = tagRe.exec(s)) !== null) {
    out.push(s.slice(lastIndex, m.index));
    const tag = m[1].toLowerCase();
    const rest = m[0];
    lastIndex = tagRe.lastIndex;
    if (!ALLOWED_TAGS.has(tag)) {
      continue;
    }
    const filteredAttrs = filterAttrs(m[2]);
    const isClose = rest.startsWith("</");
    out.push(isClose ? `</${tag}>` : `<${tag}${filteredAttrs}>`);
  }
  out.push(s.slice(lastIndex));
  const sanitized = out.join("");

  const cleaned = sanitized
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\sstyle\s*=\s*"[^"]*"/gi, "")
    .replace(/\sstyle\s*=\s*'[^']*'/gi, "");

  if (!cleaned.includes("<svg") || !cleaned.includes("</svg>")) {
    return { ok: false, reason: "sanitization-removed-structure" };
  }
  return { ok: true, sanitized: cleaned };
}
