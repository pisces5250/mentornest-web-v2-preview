// Type declarations for math_visual_engine.mjs

export interface VisualDescriptor {
  primitive_id: string;
  descriptor: any;
  constraints_check: { ok: boolean; violations: string[] };
}

export interface SVGValidity {
  valid: boolean;
  reason?: string;
}

export interface SVGResult {
  svg: string;
  validity: SVGValidity;
}

export function renderFractionBar(input: {
  numerator: number;
  denominator: number;
  splits?: Array<{ from: number; to: number; label?: string }>;
  label?: string;
}): VisualDescriptor;

export function renderNumberLine(input: {
  from: number;
  to: number;
  marks: Array<{ value: number; label?: string; kind?: "tick" | "label" | "highlight" | "endpoint" }>;
  highlight?: number;
}): VisualDescriptor;

export function renderBarModel(input: {
  parts: Array<{ label: string; size: number }>;
  question_type: "part-part-whole" | "comparison" | "multiplication";
}): VisualDescriptor;

export function renderPercentageGrid(input: {
  percentage: number;
  rows?: number;
  cols?: number;
}): VisualDescriptor;

export function renderGeometryDiagram(input: {
  shape: "rectangle" | "square" | "circle" | "triangle";
  dimensions: Record<string, number>;
  annotations?: Array<{ role: string; label?: string }>;
}): VisualDescriptor;

export function renderUnitConversionDiagram(input: {
  from: { unit: string; value: number };
  to: { unit: string; value: number };
  kind: "length" | "weight" | "volume";
}): VisualDescriptor;

export function generateNumberLineSVG(opts: {
  from: number;
  to: number;
  marks?: Array<{ value: number; label?: string; kind?: string }>;
  highlight?: number | null;
}): SVGResult;

export function generateFractionBarSVG(opts: {
  numerator: number;
  denominator: number;
  splits?: Array<{ from: number; to: number; label?: string }>;
  label?: string | null;
}): SVGResult;

export function generateAreaModelSVG(opts: {
  rows?: number;
  cols?: number;
  label?: string | null;
}): SVGResult;

export function generateVisualSVG(primitive: string, descriptor: any): { svg: string | null; validity: SVGValidity };

export const VISUAL_PRIMITIVES: readonly string[];
