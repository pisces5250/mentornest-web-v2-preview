// src/views/App.tsx
//
// Phase 5C-1 — Adds the "Today's Learning" session view as the primary entry
// point.  Phase 5A / 5B slices remain accessible via a "preview" tab so the
// existing acceptance tests still pass.

import React, { useState } from "react";
import { MultipleChoiceBasic } from "../vertical-slice/MultipleChoiceBasic";
import { G5FractionAddUnlikeDenom } from "../vertical-slice/G5FractionAddUnlikeDenom";
import { ColorModeToggle } from "../components/ColorModeToggle";
import { ChildHome } from "../session/ChildHome";
import { FIXTURE_G5_FRAC } from "../session/fixtures.mjs";

// Phase 5C-1 acceptance runs use fixtures because the local Verified Bank
// is empty in this sandbox.  PRODUCTION deployments will use the real bank.
const USE_FIXTURES = true;

type Tab = "today" | "preview";

export function App() {
  const [tab, setTab] = useState<Tab>("today");

  return (
    <div className="mn-app-shell">
      <header className="mn-app-header">
        <h1 style={{ margin: 0, fontSize: "1.25rem" }}>MentorNest Web v2 — Phase 5C 預覽</h1>
        <nav className="mn-tabs" role="tablist" aria-label="預覽模式">
          <button
            role="tab"
            aria-selected={tab === "today"}
            aria-controls="tabpanel-today"
            id="tab-today"
            className={"mn-tab" + (tab === "today" ? " is-active" : "")}
            data-testid="tab-today"
            onClick={() => setTab("today")}
          >今日學習</button>
          <button
            role="tab"
            aria-selected={tab === "preview"}
            aria-controls="tabpanel-preview"
            id="tab-preview"
            className={"mn-tab" + (tab === "preview" ? " is-active" : "")}
            data-testid="tab-preview"
            onClick={() => setTab("preview")}
          >Phase 5A/5B 預覽</button>
        </nav>
        <ColorModeToggle />
      </header>
      <main className="mn-app-main">
        {tab === "today" ? (
          <section
            className="mn-section"
            role="tabpanel"
            id="tabpanel-today"
            aria-labelledby="tab-today"
            data-testid="tabpanel-today"
          >
            <ChildHome
              studentId="student_t_phase5c_session"
              ageBand="G5-G6"
              defaultSubject="math"
              defaultKnowledgePoint="math.G5.FRAC.add-unlike-denom"
              sessionStorageKey="mentornest.session.v1"
              useFixtures={USE_FIXTURES}
              fixtureSteps={USE_FIXTURES ? FIXTURE_G5_FRAC : undefined}
            />
          </section>
        ) : (
          <section
            className="mn-section"
            role="tabpanel"
            id="tabpanel-preview"
            aria-labelledby="tab-preview"
            data-testid="tabpanel-preview"
          >
            <h2 id="g5-section-title">G5 — 分數加法（異分母）</h2>
            <G5FractionAddUnlikeDenom />
            <hr className="mn-divider" />
            <h2 id="g3-section-title">G3-G4 — 選擇題</h2>
            <MultipleChoiceBasic />
          </section>
        )}
      </main>
    </div>
  );
}
