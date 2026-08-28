// src/views/App.tsx
//
// Phase 5C-1.1 — Child UI shell.
//
// App-level responsibilities:
//   - Render the warm, quiet header (no Phase / preview / debug wording)
//   - Mount the Settings gear (color mode + future accessibility controls)
//   - Mount ColorModeController (single source of truth for [data-mode])
//   - Render the Child Home (today tab) — only entry point children see
//
// Phase 5A / 5B vertical slices (MultipleChoiceBasic, G5FractionAddUnlikeDenom)
// are NOT exposed in the child UI; they are imported from /test only.

import React, { useRef, useState } from "react";
import { ChildHome } from "../session/ChildHome";
import { FIXTURE_G5_FRAC } from "../session/fixtures.mjs";
import { ColorModeController } from "../components/ColorMode";
import { SettingsDialog, type ColorMode } from "../components/SettingsDialog";

// Phase 5C-1.1 acceptance runs use fixtures because the local Verified Bank
// is empty in this sandbox.  PRODUCTION deployments will use the real bank.
const USE_FIXTURES = true;

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement | null>(null);

  return (
    <ColorModeController>
      {({ mode, setMode }) => (
        <div className="mn-app-shell">
          <header className="mn-app-header mn-app-header--quiet" role="banner">
            <div className="mn-app-header__brand" aria-hidden="true">
              <span className="mn-app-header__brand-mark">M</span>
            </div>
            <h1 className="mn-app-header__title">MentorNest</h1>
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
                {/* Gear glyph — no mascot, geometric, weight-2 stroke */}
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                  <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2"/>
                  <path
                    d="M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1 -2.1"
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </header>
          <main className="mn-app-main">
            <ChildHome
              studentId="student_t_phase5c_session"
              ageBand="G5-G6"
              defaultSubject="math"
              defaultKnowledgePoint="math.G5.FRAC.add-unlike-denom"
              sessionStorageKey="mentornest.session.v1"
              useFixtures={USE_FIXTURES}
              fixtureSteps={USE_FIXTURES ? FIXTURE_G5_FRAC : undefined}
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
      )}
    </ColorModeController>
  );
}