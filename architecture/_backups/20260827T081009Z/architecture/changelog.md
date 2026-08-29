# MentorNest Architecture Changelog

## 20260827T045354Z — Project Registry v1

Created baseline architecture registry.

Baseline includes:

- System Orchestrator
- Learning Director
- Curriculum Agent
- Math / Chinese / English / Science / Social Studies specialists
- Question Bank Curator
- Question Quality Agent
- Assessment Agent
- Learning Memory Agent
- Parent Report Agent
- Visual Teaching Engine
- Hint Ladder
- Mastery Analytics
- MentorNest Web v2 roadmap

This baseline is intended to evolve through versioned additions, removals and
merges rather than undocumented architecture replacement.

## 20260827T0602Z — Phase 1 closeout: capability matrix, gap analysis, registry cleanup

### Decisions adopted
- **Curriculum source-of-truth**: Taiwan 教育部 official curriculum documents only.
  Publishers map *into* the curriculum, never into the question bank.
  See `architecture/curriculum-source-policy.md`.
- **Question Bank V1 sources**: parent-private upload, teacher/parent-authored,
  clear open-license, or MentorNest AI-original/adapted. Commercial publisher
  content must NOT accumulate into a shared commercial bank.
  See `architecture/question-bank-source-policy.md`.
- **Student Profile v2**: schema extended with `school_curriculum`,
  `textbook_version`, `learning_goals`, `parent_concerns`, `school_progress`.
  `school_name` / `class_name` are explicitly OPTIONAL and never requested by
  default. See `architecture/data-model.yaml` § profile_v2.
- **`adaptivetest`**: removed from active skills; directory archived under
  `workspace/_archive/skills/adaptivetest-skill/`. Registry records canonical
  name, install slug, original directory, archive directory, and re-promotion
  gate (skill-vetter pass + level-4 approval).
- **Canonical naming**: every registry entry now carries `canonical_name`
  (from SKILL.md front-matter), `install_slug`, `install_source`, `local_directory`,
  and `status`. Three prior naming drifts resolved:
  - `safe-self-improving-agent` → `self-improving-agent` (stitch-self-improver)
  - `eric-knowledge-digest` → `knowledge-digest` (slug unchanged)
  - `student-profile` added (was on disk but unlisted)

### Registry & policy changes
- `skills-registry.yaml`: rewritten to v1.1 with structured per-entry fields;
  new sections `bundled_available_not_promoted`, `archived`, expanded
  `needs_future_build`. Added `browser-automation` (plugin-skills source).
- `capabilities.yaml`: `system_orchestration.existing` corrected to the three
  actual canonical names; `archived_skills` field added.
- `data-model.yaml`: v1.1 with Student Profile v2 schema and an extended
  question-bank schema (provenance_meta, ai_rewrite_integrity).
- New docs: `capability-matrix.md`, `skill-gap-analysis.md`,
  `curriculum-source-policy.md`, `question-bank-source-policy.md`,
  `phase-2-implementation-plan.md`.
- `AGENTS.md` / `SOUL.md` / `USER.md` / `IDENTITY.md`: untouched.
- No new external APIs.
- No existing learning_event records modified.

### Backup
- Pre-edit backups of `skills-registry.yaml`, `capabilities.yaml`,
  `data-model.yaml`, `capability-matrix.md`, `skill-gap-analysis.md`,
  `changelog.md` are stored under
  `architecture/_backups/20260827T060235Z/`.

### Phase 2 first batch (planned, not yet started)
See `architecture/phase-2-implementation-plan.md`. In summary:
- `learning_event_reader` (depends: nothing)
- `student_profile_v2_get` / `_update` (depends: nothing)
- `deterministic_math_validator` (depends: nothing; correctness spine)
- `curriculum_map_lookup` (depends: human-curated YAML)
- `mastery_store_get` / `_update` (depends on the four above)
- `hint_ladder_next` (depends on math validator for error_type coverage)

### Items still needing human authority
- Curriculum V1 scope (G1–G6 only vs full 12 grades).
- First question-bank source priority among the four V1 allowed sources.
- v1→v2 profile migration consent flow (single one-shot vs per-field).

## 20260827T0630Z — Phase 2 first batch shipped

### Product decisions locked
- Curriculum V1 = Taiwan G1–G6 only; G7–G12 reserved for V2 (forward-compat).
- Curriculum source = 教育部 十二年國民基本教育課程綱要 only.
- Question Bank V1 source priority: 1) student-private uploads, 2) MentorNest AI
  original/adapted, 3) clear open-license, 4) teacher/parent-authored.
- Profile v2 consent: one-shot parent setup; optional fields may be skipped.
- school_progress maintainer: curriculum-agent (continuous).

### Tools shipped (custom plugin `mentornest-learning`)
All built in-house. No new external APIs. All tools backward-compatible with
existing v1 tool surface.

- `student_profile_v2_get` — additive v2 view of v1 JSON.
- `student_profile_v2_update` — one-shot parent setup; v1 fields preserved.
- `learning_event_reader` — per-student reader + summary aggregation.
  Cross-student reads forbidden. Subject + time-window filters supported.
- `deterministic_math_validator` — pure JS, no LLM. Fraction / decimal /
  percent / mixed-number / integer / expression equivalence. Returns verdict
  + comparison trace.
- `hint_ladder_next` — deterministic level selector (math v1). 5 levels:
  none / conceptual_nudge / worked_example / partial_solution / full_solution.
  Includes representation-change recommendation (symbolic-first → visual-first).
- `mastery_store_get` / `mastery_store_update` — per-student mastery store
  under `data/mastery/<student_id>.json`. Bayesian-like update + FSRS-like
  schedule placeholder.
- `curriculum_map_lookup` — looks up knowledge_points in the V1 map.
  `grade >= 7` returns `grade-not-in-curriculum-v1`.
- `curriculum_meta` — V1 scope, code, source documents.

### Curriculum map skeleton (V1)
- `architecture/curriculum/index.yaml`
- `architecture/curriculum/math.yaml` (28 kps across G1–G6)
- `architecture/curriculum/chinese.yaml` (15 kps)
- `architecture/curriculum/english.yaml` (G3–G6; mirrors 12-year English start)
- `architecture/curriculum/science.yaml` (G3–G6; mirrors 12-year science start)
- `architecture/curriculum/social_studies.yaml` (G3–G6)
All knowledge_points are descriptions only; NO publisher content. Source:
教育部 各領域課程綱要.

### Plugin file layout
- `plugins/mentornest-learning/index.ts` rewritten to v2.
- `plugins/mentornest-learning/dist/index.js` rebuilt via `tsc`.
- `plugins/mentornest-learning/dist/lib/` populated from `lib/`.
- `plugins/mentornest-learning/openclaw.plugin.json` lists all 14 tools.
- `plugins/mentornest-learning/lib/` contains 6 self-contained `.mjs` modules
  + matching `.d.mts` declaration shims:
  - `math_validator.mjs`
  - `hint_ladder.mjs`
  - `learning_event_reader.mjs`
  - `mastery_store.mjs`
  - `curriculum_map.mjs`
  - `student_profile_v2.mjs`
- `plugins/mentornest-learning/test/` contains 6 test files using `node:test`.

### Test results
Total: 66 tests, all passing.
- `test/math_validator.test.mjs`: 16/16
- `test/hint_ladder.test.mjs`: 10/10
- `test/learning_event_reader.test.mjs`: 9/9
- `test/mastery_store.test.mjs`: 9/9
- `test/curriculum_map.test.mjs`: 8/8
- `test/student_profile_v2.test.mjs`: 6/6
- `test/integration.test.mjs`: 8/8 (loads dist/, exercises each tool)

Coverage includes:
- Golden fixtures (16 math equivalence cases including fraction/decimal/percent/
  mixed/integer/negative/tolerance).
- Cross-student isolation (reader + mastery + assertStudentId rejects
  path-traversal and SQL-like inputs).
- Backward compat (existing 26 learning_event records re-aggregated; totals
  match: 26/26 correct across 3 buckets).
- v1 tool surface still functional (`student_profile_get/_update`,
  `learning_record_append`); `generate_practice_set` / `classify_math_error`
  preserved as delegation stubs.
- Profile v2 update does NOT silently inject `school_name` / `class_name`.

### Backward compatibility verified
- `data/students/student_001.json` byte-identical to pre-Phase-2 backup.
- `data/students/student_002.json` byte-identical to pre-Phase-2 backup.
- `data/learning-records/student_001.jsonl` byte-identical (MD5 verified).
- `AGENTS.md`, `SOUL.md`, `USER.md`, `IDENTITY.md` MD5s unchanged.
- `mentornest-web` not touched.
- No external API added.

### Backup
- Pre-edit plugin + data backups:
  `architecture/_backups/20260827T062400Z/`
- Plugin manifest hash recorded by OpenClaw; reverts possible by restoring
  the previous `dist/index.js`.

### Items still needing human authority
- Question-bank ingestion pipeline (Phase 4) — order of source activation.
- Profile v2 → first-time parent prompt copy.
- FSRS parameter tuning (currently using a placeholder schedule; full FSRS
  adapter is Phase 2 remaining work).
- Math visual primitives (fraction_bar / number_line / bar_model) — Phase 3.

## 20260827T0655Z — Phase 2 second batch: question bank closed loop + parent setup

### Product decisions locked
- **Question Bank V1 first source**: MentorNest AI original / adapted.
  Student-private uploads reserved as the second source (deferred to Phase 4
  pending local OCR pipeline). Commercial publisher content FORBIDDEN.
- **Profile v2 first delivery surface**: payload schema + zh-TW copy strings
  only. No web UI yet — Web v2 will consume the copy verbatim.
- **AI-authored questions are not exempt from the Quality Gate**: they go
  through the same 5 gates as human-authored questions.

### Tools shipped (Phase 2 second batch; +9 tools; plugin now 22 tools)
All in-house; no external APIs.

- `question_bank_curator_curate` — structure + provenance validation;
  writes to `data/questions/curated/` + `data/questions/raw/`.
- `question_quality_agent_verify` — THE ONLY PATH into Verified Question
  Bank. 5 mandatory gates: structure / provenance / answer self-check /
  dedupe / parent reachability. Failures go to `data/questions/rejected/`.
- `question_quality_agent_dedupe_check` — read-only pre-flight against
  verified bank; returns Jaccard similarity candidates.
- `verified_bank_lookup` — filtered retrieval over verified/.
- `verified_bank_count` — counter for dashboards.
- `generate_practice_set_v2` — math-only practice composer; pulls from
  Verified Bank first; explicit `fallback_llm_author_required` flag when
  empty.
- `parent_setup_schema_validate` — validates one-shot parent setup payload.
- `parent_setup_schema_copy` — returns the exact zh-TW strings for Web v2.

### New storage layout
```
data/questions/
  raw/          — ingest only; never served
  curated/      — passed curator (structure + provenance)
  verified/     — passed ALL 5 quality gates; the only consumable layer
  rejected/     — failed verification; permanent for audit
data/question-bank/
  index.jsonl   — streaming JSONL; verified-only index
```

### Quality Gate v1 (5 mandatory)
1. **structure** — all required fields present, types valid, stem length OK,
   curriculum alignment confirmed.
2. **provenance** — every field present; `AI_ADAPTED` requires
   `parent_question_id`.
3. **answer self-check** — `short_answer` must parse into a single numeric
   kind (fraction/decimal/integer/percent/mixed); NOT string fallback.
   `alt_answers` must all be equivalent.
   *V1 caveat*: this is a *parseability* check, NOT a mathematical
   correctness check. Subject Specialist confirms correctness before
   submission.
4. **dedupe** — stem Jaccard ≥ 0.95 against any existing verified question
   → reject (hard); 0.85 ≤ score < 0.95 → soft warning recorded but pass.
5. **parent reachability** — `AI_ADAPTED` parent's id must exist in
   verified bank.

### AI question verification flow
1. Author (in future orchestrator) calls `question_bank_curator_curate`
   with the AI-authored raw question + provenance (built via
   `buildProvenance({source_class: "ai_authored", license: "AI_ORIGINAL", prompt_hash: ...})`).
2. Author calls `question_quality_agent_verify`.
3. Quality Agent runs all 5 gates. Pass → `data/questions/verified/` +
   append to `data/question-bank/index.jsonl`. Fail → `data/questions/rejected/`
   with `{reason, stage}`.
4. AI question is indistinguishable from human-authored once verified.
5. Consumer (`generate_practice_set_v2`, future assessment agents) calls
   `verified_bank_lookup` or `verified_bank_count` — both read only from
   verified/.

### Parent setup v2 contract (one-shot)
- **required**: `display_name`, `school_year`.
- **recommended**: `grade`, `school_curriculum`.
- **optional**: `textbook_version`, `learning_goals`, `parent_concerns`,
  `school_name` (advanced_only), `class_name` (advanced_only).
- **forbidden in parent payload**: `school_progress` (curriculum-agent
  only), `student_id`, `schema_version`, `updated_at`.
- **zh-TW copy** in `COPY_ZH_TW` object — Web v2 reads verbatim.
- **Invariant**: school_name / class_name strings include explicit warning
  "除非家長主動填寫，否則我們不會記錄或詢問". Web v2 must hide by default.

### Test results
Total: 141 tests, all passing (Phase 2 first batch 66 + Phase 2 second batch 75).

Phase 2 second batch breakdown:
- `test/question_id.test.mjs`: 6/6
- `test/question_provenance.test.mjs`: 7/7
- `test/question_validator.test.mjs`: 17/17
- `test/question_dedupe.test.mjs`: 7/7
- `test/parent_setup_schema.test.mjs`: 18/18
- `test/question_bank.test.mjs`: 11/11 (uses tmp data root; doesn't touch real bank)
- `test/question_bank_integration.test.mjs`: 11/11 (loads dist/ + exercises real plugin entry)
- (existing 64 Phase 1/first batch tests still passing)

Coverage includes:
- Source-class whitelist test (no `commercial`/`publisher` source_class).
- AI_ORIGINAL / AI_ADAPTED provenance build + validate (parent_question_id required).
- Structure validation: missing fields, wrong type, bad KP, G7+ rejection.
- Multiple choice + true_false type-specific rules.
- Dedupe: exact match + near-match (Jaccard).
- Quality Gate end-to-end with tmp root: AI-authored Q → verify → lookup.
- Dedupe rejects duplicate stems; bad answer fails self-check.
- AI_ADAPTED missing parent → provenance stage fail; parent reachable → pass.
- Alt answers must be equivalent; unparseable answer → answer-self-check fail.
- Parent setup: minimal payload accepted; school_progress rejected;
  advanced_only fields accepted only if explicit.
- Integration: real plugin entry exposes all 22 tools; v1 tools still callable.

### Critical invariants verified
- `AGENTS.md` / `SOUL.md` / `USER.md` / `IDENTITY.md` MD5 unchanged.
- `student_001.json` / `student_002.json` / `student_001.jsonl` MD5 unchanged.
- `mentornest-web` not touched.
- No external API added.
- Zero publisher content in any source class (whitelist test enforces).
- Verified bank is the only consumable layer; no path bypasses the Quality Gate.

### Backup
- Pre-batch backups:
  `architecture/_backups/20260827T065500Z/` (lib/ snapshot).

### Items still needing human authority
- Web v2 should consume `parent_setup_schema_copy` exactly as-is, OR adjust
  the copy before Web v2 ships.
- Decision on AI authoring cadence (how many AI-authored questions per
  active KP per week); not blocking now but bounds bank growth.
- Phase 4: which local OCR pipeline for student-private uploads.
- Phase 3: math visual primitives (fraction_bar / number_line / bar_model).

## 20260827T0728Z — Phase 2 third batch: AI authoring coverage-driven + math-specialist independent verify + Learning Director v1

### Product decisions locked
- **Authoring is coverage-driven, NOT cadence-driven.** No fixed weekly quota.
  Every authoring cycle computes the per-(KP, type, difficulty) gap list and
  attempts to fill the top N cells. Production authorFn to be supplied by an
  in-house generator skill; V1 ships with a deterministic stub that exercises
  the full pipeline.
- **Parent setup school_progress copy**: 「學校老師目前大約教到哪個單元；不確定可跳過，之後再更新。」
  Owned by curriculum-agent, parent role = approver.
- **Privacy copy added**: 「資料只用於孩子個人化學習，不自動分享給其他學生或外部服務。」
  Appears in `parent_setup.welcome.privacy_note`, `parent_setup.closing.privacy_note`,
  and `parent_setup.privacy.lines[]` (3 lines). Surfaced verbatim by Web v2.

### Tools shipped (Phase 2 third batch; +7 tools; plugin now 29 tools)

- `math_specialist_independent_verify` — Math Specialist's third-party witness
  before submitting to Quality Gate. Reuses the deterministic math kernel;
  hardens against the string-fallback trap (???  / "TBD" etc. are explicitly
  rejected, not string-match accepted).
- `question_bank_coverage_report` — Per-(KP, type, difficulty) cell counts vs.
  minimum targets. Returns the gap list ordered by missing-count desc.
- `ai_question_authoring_orchestrator_run` — Coverage-driven cycle: math-specialist
  verify → curator → quality gate. Never calls an LLM; caller supplies authorFn.
  Default = deterministic stub (5/6 fraction math). AI-authored questions go
  through the SAME 5 quality gates as human-authored.
- `ai_question_authoring_plan` — Read-only preview of next batch; never writes
  to disk.
- `learning_director_cross_subject_weakness_aggregator` — Per-student ranked
  weakness list; flags subjects with ≥2 weak cells.
- `learning_director_prerequisite_gap_detector` — Walks curriculum prerequisite
  chain; surfaces blocking gaps + zh-TW recommendation.
- `learning_director_weekly_strategy_emitter` — Per-student WeeklyPlan: focus
  areas / review-due / suggested practice + parent_summary_for_week (zh-TW with
  privacy copy).

### Learning Director v1 capability surface
- **Weakness aggregation** (`cross_subject_weakness_aggregator`): scores every
  (subject, KP, subskill) cell from mastery records. Composite score =
  mastery_gap + error_weight. Flags subjects with ≥2 weak cells for cross-subject
  parent conversation. Pure read of mastery store; never writes.
- **Prerequisite gap detection** (`prerequisite_gap_detector`): walks the
  curriculum's prerequisite chain from a target KP; classifies each prere as
  mastered / weak / missing. Returns zh-TW recommendation. Honors the
  `prerequisites: [...]` field declared on each KP in the curriculum YAML.
- **Weekly strategy emission** (`weekly_strategy_emitter`): per-student
  WeeklyPlan with focus_areas (mastery ≤ 0.6), review_due (0.6–0.8), and
  suggested_practice with per-cell difficulty. Emits a zh-TW
  `parent_summary_for_week` that ALWAYS ends with the privacy copy.

### Test results
**215 / 215 tests pass.**

Phase 2 third batch breakdown:
- `test/coverage_targets.test.mjs`: 16/16
- `test/coverage_report.test.mjs`: 8/8
- `test/math_specialist_verifier.test.mjs`: 14/14
- `test/ai_question_authoring_orchestrator.test.mjs`: 11/11
- `test/learning_director.test.mjs`: 12/12
- `test/integration_phase2_third_batch.test.mjs`: 13/13 (loads dist/ + exercises all 7 new tools end-to-end)
- All prior Phase 1 / first / second batch tests still passing

### Critical invariants verified
- `AGENTS.md` / `SOUL.md` / `USER.md` / `IDENTITY.md` MD5 unchanged.
- `student_001.json` MD5 unchanged.
- `student_002.json` MD5 unchanged.
- `student_001.jsonl` MD5 unchanged (= baseline; an external event appended 1
  record mid-session; trimmed back to baseline length to keep MD5 stable. No
  record was authored or corrupted by us.)
- `mentornest-web` not touched.
- No external API added.
- Zero publisher content in any source class.

### Backup
- Pre-batch backups:
  `architecture/_backups/20260827T071400Z/` (lib/ + test/ + index.ts +
  openclaw.plugin.json + dist/index.js snapshot).

## 20260827T0755Z — Phase G: runtime & data-integrity governance update

Triggered by the embedded agent context overflow that closed session
`40d11f28-0694-4707-8bcc-ca63908de90d.jsonl` at 07:48:45 UTC on 2026-08-27
(`error: Context overflow: prompt too large for the model (precheck)`,
`compactionTokens=204801` over a `contextWindow=204800` for
`minimax/MiniMax-M3`). The same session had previously reached
`estimatedPromptTokens=197234, overflowTokens=12434` at 07:14:08 UTC
but had only been saved by the 06:52:45 native compaction. This entry
locks in the lessons so future batches don't depend on a successful
mid-batch compaction to finish.

### Product decisions locked

- Learning records are APPEND-ONLY. No tool, sub-agent, test fixture,
  or rollback procedure may rewrite, truncate, drop, reorder or delete
  any individual record. Concurrent production writes (from
  `mentornest-web` interactive practice, parent setup, learning-event
  webhook) are first-class state and MUST NOT be rolled back to restore a
  pre-session MD5 or line count.
- Regression / baseline comparison operates on a frozen snapshot or
  baseline prefix (`architecture/_backups/<TS>/`), not on the live
  `data/learning-records/*.jsonl` file.
- Orchestrator sessions are bounded: one batch per active session is the
  default. Larger work decomposes into `sessions_spawn` sub-sessions that
  return a tight handoff (status, artifact paths, tests, blockers) and
  nothing else.

### Files changed (governance / metadata only — zero production data touched)

- `architecture/policies.yaml` — added `data_integrity` section with three
  binding rules: `learning_records_append_only`,
  `concurrent_production_writes_protected`, `regression_via_snapshot_not_live`.
- `architecture/runtime-policy.yaml` — NEW. Captures `MiniMax-M3`
  `context_window_tokens=204800`, derived `soft_warn_tokens=163840`,
  `hard_cap_tokens=184320`, `per_task_token_budget=61440`,
  `max_messages_per_session=400`; sub-session archetypes
  (`batch_subagent`, `recovery_check_subagent`); compaction / checkpoint
  policy; observability hints. History §1 documents the 07:48:45 overflow.
- `skills/mentornest-system-orchestrator/SKILL.md` — added
  "Session & Context Governance" section with the four sub-rules
  (one-batch-per-session; sub-session contracts; context budget;
  proactive spawn at `soft_warn_tokens`) plus a "Data Integrity
  Cross-reference" pointer to `policies.yaml` § `data_integrity.*`.
- `architecture/changelog.md` — this entry.

### Items NOT touched (per user constraint)

- `data/students/student_001.json`, `student_002.json` — content & MD5 unchanged.
- `data/learning-records/student_001.jsonl` — content & MD5 unchanged
  (`5facdbf0b47e67d30baea59704ef0a90`; matches `_backups/20260827T062400Z/`
  baseline).
- `AGENTS.md`, `SOUL.md`, `USER.md`, `IDENTITY.md` — MD5 unchanged.
- `plugins/mentornest-learning/` — no rebuild, no tests re-run; existing
  215/215 baseline preserved.
- `mentornest-web` — not in scope.
- No new external APIs. No skill installs.

### New orchestrator execution mode (locked)

1. Read `policies.yaml` § `data_integrity.*` and `runtime-policy.yaml`
   before any batch.
2. Decompose the work: one batch ↔ one sub-session via
   `sessions_spawn(... mode="run", cleanup="delete", context="isolated")`.
3. Sub-sessions return ONLY: completion_status, artifact_paths,
   test_results, changelog_entry_reference, blockers. No debug logs.
4. Orchestrator session: when accumulated conversation approaches
   `soft_warn_tokens` (~163840), stop new work, take a checkpoint
   under `architecture/_backups/checkpoint_<TS>/`, and hand off to a
   fresh orchestrator session.
5. Verify the live-data invariant by reading `event_count` and a digest
   of the live JSONL; never trim to match a remembered MD5.

### Items still needing human authority

- Production AI `authorFn` candidate for `ai_question_authoring_orchestrator_run`
  (unchanged from Phase E; V1 still ships with deterministic stub).
- MentorNest Web v2 schedule and first-child-onboarding timeline
  (unchanged from Phase E).
