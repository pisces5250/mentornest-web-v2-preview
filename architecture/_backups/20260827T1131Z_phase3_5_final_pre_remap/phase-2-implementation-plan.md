# Phase 2 — Learning Intelligence Implementation Plan

Owner: system-orchestrator
Status: Adopted 2026-08-27
Goal: Close the loop from "child answers a question" → "MentorNest knows what they have mastered, with confidence, without inventing facts."

## 1. Scope and non-goals

In scope:
- Persistent mastery store keyed by student × knowledge_point × subskill
- Deterministic math answer validator (the most critical correctness invariant)
- Server-side learning_event reader that all longitudinal features depend on
- Hint-ladder engine (math first; reusable for other specialists)
- Curriculum map skeleton (Taiwan, elementary only, V1)

Out of scope for Phase 2 (deferred):
- Parent weekly report (C7) — needs ≥ 2 weeks of mastery data per active student first.
- Local TTS — english-specialist work not started yet.
- Question bank ingestion pipeline — Phase 4.
- Web v2 UI changes — Phase 5.

## 2. First-batch tools to build (all custom, in-house)

These are the NEW tools we will build into the `mentornest-learning` plugin. None of them are external APIs.

### Tool 2.1 — `learning_event_reader`
- Reads `data/learning-records/<student_id>.jsonl` and emits structured per-student summaries.
- Pure function: takes `(student_id, time_window, group_by)` → returns events + aggregates.
- Required by: learning-director (C1), assessment-agent (mastery check), parent-report-agent (C7).
- Privacy: never reads across students; cross-student calls are explicitly forbidden by the tool surface.
- Risk: low. No schema migration; pure reader.

### Tool 2.2 — `deterministic_math_validator`
- Validates a student's answer against an expected answer across multiple representations.
- SymPy-backed expression equivalence (fractions, polynomials, equations).
- Numeric equivalence for word problems (with tolerance + unit checks).
- Structural validator for bar-model questions (matches diagram structure to expected).
- Input: `(question_type, expected_answer, student_answer, problem_metadata)` → `correctness_verdict`.
- Required by: math-specialist, question-quality-agent, assessment-agent.
- This is the correctness spine of every math flow going forward. Without it, every "correct" in learning_event is an LLM opinion.
- Risk: low. Pure function, no external calls, deterministic.

### Tool 2.3 — `mastery_store_get` / `mastery_store_update`
- New persistent store at `data/mastery/<student_id>.json` keyed by `subject × knowledge_point × subskill`.
- Fields per data-model.yaml: `mastery`, `confidence`, `last_seen`, `review_due`, `school_alignment`, `error_patterns`.
- `update` is fed by `learning_record_append` + `deterministic_math_validator` verdicts.
- Scheduler: adopts FSRS from `adaptive-learning` skill (refactor: the FSRS scheduler is a pure function over a card; we reuse its parameters, store the schedule locally).
- Risk: low (new file, additive). Migration from existing 26 events is one-shot at first run; learning_event records are untouched.

### Tool 2.4 — `hint_ladder_next`
- Pure function: `(error_type, attempts_so_far, representation_used, knowledge_point)` → next hint level.
- Levels: `none | conceptual_nudge | worked_example_step | partial_solution | full_solution`.
- Deterministic rules + small LLM hint *generation* (text only), but level selection is deterministic.
- First release: math error taxonomy only (`concept_misunderstanding`, `calculation_error`, `careless_error`, `missed_condition`, `unit_conversion`, `bar_model_error`, `fraction_operation_error`, ...).
- Required by: math-specialist (H2).
- Risk: low. Pure function.

### Tool 2.5 — `curriculum_map_lookup`
- Reads `architecture/curriculum/*.yaml` and answers: `(grade, subject, knowledge_point)` → `(curriculum_doc_id, section, knowledge_point_id, sibling_points)`.
- First content: empty schema + index file. Populated by a human curator (see § 5).
- Required by: curriculum-agent (C2), school_progress tracker, question-bank-curator (grounding).
- Risk: low (additive; empty at first).

### Tool 2.6 — `student_profile_v2_get` / `student_profile_v2_update`
- Reads / writes the new schema (grade, school_curriculum, textbook_version, learning_goals, parent_concerns, school_progress).
- Backward-compatible with v1 readers.
- Will replace the existing `student_profile_*` tools over time; for V2 both stay live.
- Existing student JSON files are NOT migrated automatically (would touch learning data). Migration is parent opt-in via Parent Mode.
- Risk: low (new tool surface; existing files untouched).

## 3. Build order and dependencies

```
Step 1 ─ Tool 2.1 learning_event_reader         (no deps; needed by everything else)
Step 2 ─ Tool 2.6 student_profile_v2_*          (independent; lets parents populate new fields)
Step 3 ─ Tool 2.2 deterministic_math_validator  (independent; hardened correctness)
Step 4 ─ Tool 2.5 curriculum_map_lookup         (independent; empty data at first)
Step 5 ─ Tool 2.3 mastery_store_*               (depends on 2.1 + 2.2 + 2.5)
Step 6 ─ Tool 2.4 hint_ladder_next              (depends on 2.2 for error_type coverage)
```

Steps 1, 2, 3, 4 can land in any order. Steps 5 and 6 follow.

## 4. Verification per tool

For every tool:
- Unit tests in `services/mentornest-learning/test/<tool>.test.ts`.
- A "golden fixture" dataset under `services/mentornest-learning/test/fixtures/`.
- Regression smoke: re-run existing 26 learning_events through the new tools and confirm aggregates match hand-computed totals.
- Privacy smoke: confirm cross-student reads are rejected by the tool surface.

Tools do not ship unless all four pass.

## 5. Human-required work (cannot be automated)

- **Curriculum map authoring.** The YAML files under `architecture/curriculum/` are written by a human curator referencing 教育部 documents. The orchestrator will not fabricate knowledge_points.
- **Hint-level rubrics.** The mapping from `error_type × attempts` to hint level is pedagogical; the orchestrator drafts it, a human approves.
- **Parent opt-in for v1→v2 profile migration.** Profile migration only happens after a parent confirms via Parent Mode.

## 6. Rollback strategy

Each tool is a separate plugin export. Rollback = disable that tool in `openclaw.plugin.json` (or remove its registration in `dist/index.js`). No migration required because nothing destructive happens — mastery store is new file; profile v2 fields are additive.

For the mastery store specifically, the rollback path is:
1. Stop `mastery_store_update` from being called.
2. Existing `learning_record_append` events remain intact and re-runnable.
3. `data/mastery/<student_id>.json` files can be deleted without losing any learning evidence.

## 7. Cross-references

- `architecture/skills-registry.yaml: needs_future_build` — the authoritative list of skills / tools to build, updated as each Phase 2 tool ships.
- `architecture/capabilities.yaml` — capability statuses will move from `missing` to `ready` as tools ship.
- `architecture/curriculum-source-policy.md` — rules for Tool 2.5 content.
- `architecture/question-bank-source-policy.md` — Phase 4, depends on Tool 2.5.
- `architecture/changelog.md` — every shipped tool records here.

## 8. Decisions still owed

- Curriculum V1 scope: G1–G6 only vs full 12 grades (item 6 in skill-gap-analysis § 9).
- First question-bank source priority (item 7 in skill-gap-analysis § 9).
- Whether parent opt-in for v1→v2 profile migration is a single one-shot prompt or a per-field consent.
