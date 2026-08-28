// src/views/App.tsx
//
// Phase 5C-1.1 Round 4 — Quiet Graph app shell.
//
// App-level responsibilities:
//   - Mount <GridBackground /> as the page-wide decorative grid layer
//   - Render the quiet header (brand mark + MentorNest + progress + gear)
//   - Mount Settings modal (gear)
//   - Mount ColorModeController
//   - Render the Child Home — only entry point children see
//
// No learning/mastery/validation/question-selection/hint-escalation/
// session-state lives here.

import React, { useRef, useState } from "react";
import { ChildHome } from "../session/ChildHome";
import { FIXTURE_G5_FRAC } from "../session/fixtures.mjs";
import { FIXTURE_P5C2 } from "../session/fixtures_p5c2.mjs";
import { ColorModeController } from "../components/ColorMode";
import { SettingsDialog, type ColorMode } from "../components/SettingsDialog";
import { GridBackground } from "../components/GridBackground";

const USE_FIXTURES = true;
const ALL_FIXTURES = [...FIXTURE_G5_FRAC, ...FIXTURE_P5C2];

// Phase 5C-2 acceptance: ?qtype=open_response|voice_response|english
// maps to a fixture step_id so the acceptance script can target a
// specific question_type without rebuilding the session flow.
function resolveAcceptanceOverride(): { kp: string; stepId: string } | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const qtype = params.get("qtype");
  if (!qtype) return null;
  const map: Record<string, { kp: string; stepId: string }> = {
    open_response: { kp: "math.G5.FRAC.add-unlike-denom", stepId: "p5c2_open_text_g5_001" },
    voice_response: { kp: "math.G5.FRAC.add-unlike-denom", stepId: "p5c2_open_voice_g5_001" },
    english_voice: { kp: "english.G5.READ.passage-read-aloud", stepId: "p5c2_eng_read_g5_001" },
  };
  return map[qtype] || null;
}

const acceptance = resolveAcceptanceOverride();

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);

  return (
    <ColorModeController>
      {({ mode, setMode }) => (
        <>
          <GridBackground />
          <div className="mn-app-shell">
            <header className="mn-app-header" role="banner">
              <div className="mn-app-header__brand">
                <span className="mn-app-header__brand-mark" aria-hidden="true">M</span>
                <h1 className="mn-app-header__title">MentorNest</h1>
              </div>
              <div className="mn-app-header__progress" aria-hidden="true">
                {/* Reserved for desktop-only step progress; hidden until
                 *  the session view is active.  Visible space here lets
                 *  the grid carry through evenly. */}
              </div>
              <div className="mn-app-header__actions">
                <button
                  ref={gearRef}
                  type="button"
                  className="mn-app-header__gear"
                  aria-label="顯示設定"
                  aria-haspopup="dialog"
                  aria-expanded={settingsOpen}
                  onClick={() => setSettingsOpen(true)}
                  data-testid="settings-gear"
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                    <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                    <path
                      d="M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1 -2.1"
                      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </header>
            <main className="mn-app-main">
              <ChildHome
                studentId="student_t_phase5c_session"
                ageBand="G5-G6"
                defaultSubject={acceptance ? (acceptance.stepId.startsWith("p5c2_eng_") ? "english" : "math") : "math"}
                defaultKnowledgePoint={acceptance ? acceptance.kp : "math.G5.FRAC.add-unlike-denom"}
                sessionStorageKey="mentornest.session.v1"
                useFixtures={USE_FIXTURES}
                fixtureSteps={USE_FIXTURES ? ALL_FIXTURES : undefined}
                forcedStepId={acceptance?.stepId}
              />
            </main>
            <SettingsDialog
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              currentMode={mode}
              onModeChange={(m: ColorMode) => setMode(m)}
              returnFocusRef={gearRef}
            />
          </div>
        </>
      )}
    </ColorModeController>
  );
}
