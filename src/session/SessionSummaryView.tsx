// src/session/SessionSummaryView.tsx
//
// Phase 5C-1.1 Round 5 — Quiet Graph Session Summary.
//
// Children must never see raw KP IDs.  View-layer KP→phrase map is the
// single child-facing source.  Anything not in the map falls back to a
// generic phrase so the child never sees machine identifiers.
//
// Quiet Graph language: stat cards in a responsive grid (1 col mobile,
// 2 col tablet, 5 col desktop); ✓ / ✗ mono-cap discs on KP rows;
// full-width primary "back to home" CTA centered; duration formatted
// human-friendly ("約 4 分鐘" not "14737 秒").  All formatting lives
// in the view; reducer is untouched.

import React from "react";
import { recommendNext, type SessionSummary } from "./session-state.mjs";

export interface SessionSummaryViewProps {
  summary: SessionSummary;
  ageBand: string;
  studentId: string;
}

const KP_PHRASE_ZH: Record<string, string> = {
  "math.G3.MULT.two-digit": "兩位數乘法",
  "math.G4.DIV.estimate":  "除法的估算",
  "math.G5.FRAC.add-unlike-denom": "分數加法（不同分母）",
  "math.G5.DEC.add":       "小數加法",
};

function kpToPhrase(kp: string): string {
  return KP_PHRASE_ZH[kp] ?? "這一題";
}

// Format seconds as a human-friendly zh-TW phrase.
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "少於 1 分鐘";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0 && minutes > 0) return `約 ${hours} 小時 ${minutes} 分`;
  if (hours > 0) return `約 ${hours} 小時`;
  if (minutes > 0) return `約 ${minutes} 分鐘`;
  return `${secs} 秒`;
}

// Small visual icons rendered inline as text (no SVG assets).
function CheckGlyph() {
  return (
    <span aria-hidden="true" data-glyph="check">✓</span>
  );
}
function CrossGlyph() {
  return (
    <span aria-hidden="true" data-glyph="cross">✗</span>
  );
}

export function SessionSummaryView(props: SessionSummaryViewProps) {
  const { summary, ageBand } = props;
  const recommendation = recommendNext(summary);

  const headline =
    summary.first_attempt_correct === summary.total_steps
      ? "今天全部一次就答對，太厲害了！"
      : summary.weak_kps.length === 0
      ? "今天練習結束，再接再厲。"
      : "今天有些題目需要再練習，明天再來挑戰。";

  return (
    <section
      className="mn-summary-card"
      data-testid="session-summary"
      data-age-band={ageBand}
    >
      <h2 data-testid="summary-headline">{headline}</h2>

      <dl className="mn-summary-stats" data-testid="summary-stats">
        <div className="mn-stat-card">
          <dt className="mn-stat-card__label">完成題數</dt>
          <dd className="mn-stat-card__value" data-testid="stat-total">{summary.total_steps}</dd>
        </div>
        <div className="mn-stat-card">
          <dt className="mn-stat-card__label">一次就答對</dt>
          <dd className="mn-stat-card__value" data-testid="stat-first-attempt">{summary.first_attempt_correct}</dd>
        </div>
        <div className="mn-stat-card">
          <dt className="mn-stat-card__label">看了提示</dt>
          <dd className="mn-stat-card__value" data-testid="stat-hints">{summary.hints_used_total}</dd>
        </div>
        <div className="mn-stat-card">
          <dt className="mn-stat-card__label">換了表示法</dt>
          <dd className="mn-stat-card__value" data-testid="stat-switches">{summary.representation_switches_total}</dd>
        </div>
        <div className="mn-stat-card">
          <dt className="mn-stat-card__label">練習時間</dt>
          <dd className="mn-stat-card__value" data-testid="stat-duration">{formatDuration(summary.duration_seconds)}</dd>
        </div>
      </dl>

      {summary.weak_kps.length > 0 && (
        <section data-testid="weak-kps-section" aria-label="需要再練習的部分">
          <h3>需要再練習</h3>
          <ul>
            {summary.weak_kps.map((kp) => (
              <li className="mn-kp-row" key={kp} data-testid={`weak-kp-${kp}`}>
                <span className="mn-icon-disc" data-tone="amber" aria-hidden="true">
                  <CrossGlyph />
                </span>
                <span className="mn-kp-row__label">{kpToPhrase(kp)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.mastered_kps.length > 0 && (
        <section data-testid="mastered-kps-section" aria-label="一次就答對的部分">
          <h3>已經掌握</h3>
          <ul>
            {summary.mastered_kps.map((kp) => (
              <li className="mn-kp-row" key={kp} data-testid={`mastered-kp-${kp}`}>
                <span className="mn-icon-disc" data-tone="moss" aria-hidden="true">
                  <CheckGlyph />
                </span>
                <span className="mn-kp-row__label">{kpToPhrase(kp)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mn-summary-recommendation" data-testid="summary-recommendation">
        <strong>下一步建議：</strong>{recommendation.reason}
      </p>

      <div className="mn-summary-cta-row">
        <button
          type="button"
          className="mn-button mn-button--primary"
          data-testid="back-to-home"
          onClick={() => window.location.reload()}
        >回到首頁</button>
      </div>
    </section>
  );
}