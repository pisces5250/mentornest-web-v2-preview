// src/session/SessionSummaryView.tsx
//
// Phase 5C-1.1 — Child-facing session summary.
//
// Children must never see raw KP IDs (e.g. "math.G5.FRAC.add-unlike-denom").
// This view-layer map turns internal KP IDs into short, plain zh-TW phrases.
// The map is intentionally local to this file:
//   - fixtures.mjs is frozen for this round
//   - subject_specialist owns canonical topic_label_zh (deferred to 5C-2)
//   - the map here is the single child-facing phrase source for now
//
// Anything not in the map falls back to a generic phrase so the child never
// sees machine identifiers.

import React from "react";
import { recommendNext, type SessionSummary } from "./session-state.mjs";

export interface SessionSummaryViewProps {
  summary: SessionSummary;
  ageBand: string;
  studentId: string;
}

// View-layer KP ID → child-facing zh-TW phrase.  Expand as fixtures grow.
const KP_PHRASE_ZH: Record<string, string> = {
  "math.G3.MULT.two-digit": "兩位數乘法",
  "math.G4.DIV.estimate":  "除法的估算",
  "math.G5.FRAC.add-unlike-denom": "分數加法（不同分母）",
  "math.G5.DEC.add":       "小數加法",
};

function kpToPhrase(kp: string): string {
  return KP_PHRASE_ZH[kp] ?? "這一題";
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
      className="mn-card mn-summary-card"
      data-testid="session-summary"
      data-age-band={ageBand}
    >
      <h2 data-testid="summary-headline">{headline}</h2>
      <dl className="mn-summary-stats" data-testid="summary-stats">
        <div><dt>完成題數</dt><dd data-testid="stat-total">{summary.total_steps}</dd></div>
        <div><dt>一次就答對</dt><dd data-testid="stat-first-attempt">{summary.first_attempt_correct}</dd></div>
        <div><dt>看了提示</dt><dd data-testid="stat-hints">{summary.hints_used_total}</dd></div>
        <div><dt>換了表示法</dt><dd data-testid="stat-switches">{summary.representation_switches_total}</dd></div>
        <div><dt>練習時間</dt><dd data-testid="stat-duration">{summary.duration_seconds} 秒</dd></div>
      </dl>

      {summary.weak_kps.length > 0 && (
        <section data-testid="weak-kps-section" aria-label="需要再練習的部分">
          <h3>需要再練習</h3>
          <ul>
            {summary.weak_kps.map((kp) => (
              <li key={kp} data-testid={`weak-kp-${kp}`}>{kpToPhrase(kp)}</li>
            ))}
          </ul>
        </section>
      )}

      {summary.mastered_kps.length > 0 && (
        <section data-testid="mastered-kps-section" aria-label="一次就答對的部分">
          <h3>已經掌握</h3>
          <ul>
            {summary.mastered_kps.map((kp) => (
              <li key={kp} data-testid={`mastered-kp-${kp}`}>{kpToPhrase(kp)}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="mn-summary-recommendation" data-testid="summary-recommendation">
        <strong>下一步建議：</strong>{recommendation.reason}
      </p>

      <div className="mn-actions">
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