# MentorNest Agent Capability Matrix

Status: Phase 1 — System foundation (active)
Owner: system-orchestrator
Method: Project Registry v1 + live inspection of `/home/node/.openclaw/workspace/`, `/home/node/.openclaw/plugins/`, `/app/skills/`. No production changes.

## Legend

| Symbol | Meaning |
|---|---|
| ✅ ready | Capability exists and is wired into the agent runtime |
| ◐ partial | Some scaffolding exists; missing production-grade pieces |
| ❌ missing | Declared in registry, no implementation found |
| 🟦 planned | Roadmap phase, not yet started |
| ⛔ blocked | Requires policy/credential/architecture decision |

## 1. Master matrix — Agent × Capability

Status reflects (a) registry declaration and (b) what the runtime actually exposes today.

| Agent | Profile & Memory | Practice Gen | Error Diag | Visual Teaching | Curriculum / Progress | Mastery Model | Question Bank | Quality & License | Assessment | Parent Report | Local STT | TTS / Pronunciation | System / Orchestration |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| system-orchestrator | — | — | — | — | — | — | — | — | — | — | — | — | ◐ partial |
| learning-director | ✅ ready | — | — | — | ❌ missing | ❌ missing | ❌ missing | — | ❌ missing | ❌ missing | — | — | — |
| curriculum-agent | ✅ ready | — | — | — | ❌ missing | — | — | — | — | — | — | — | — |
| math-specialist | ✅ ready | ✅ ready | ✅ ready | ◐ partial | — | ◐ partial | ❌ missing | — | — | — | — | — | — |
| chinese-specialist | ✅ ready | — | — | ◐ partial | — | ◐ partial | ❌ missing | — | — | — | — | — | — |
| english-specialist | ✅ ready | — | — | ◐ partial | — | ◐ partial | ❌ missing | — | — | — | ✅ ready | ❌ missing / ❌ missing | — |
| science-specialist | ✅ ready | — | — | ◐ partial | — | ◐ partial | ❌ missing | — | — | — | — | — | — |
| social-studies-specialist | ✅ ready | — | — | ◐ partial | — | ◐ partial | ❌ missing | — | — | — | — | — | — |
| question-bank-curator | — | — | — | — | — | — | ❌ missing | — | — | — | — | — | — |
| question-quality-agent | — | — | — | — | — | — | — | ❌ missing | — | — | — | — | — |
| assessment-agent | ✅ ready | — | — | — | — | ◐ partial | ❌ missing | — | ❌ missing | — | — | — | — |
| learning-memory-agent | ✅ ready | — | — | — | — | — | — | — | — | — | — | — | — |
| parent-report-agent | ✅ ready | — | — | — | ❌ missing | — | — | — | — | ❌ missing | — | — | — |

Notes:
- ✅ in *Profile & Memory* = the custom plugin `mentornest-learning` exposes `student_profile_get`, `student_profile_update`, `learning_record_append`; this is the spine every teaching agent inherits.
- ◐ in *Visual Teaching* = only `diagram-maker` (general SVG/HTML/Excalidraw) exists; the subject-specific visual primitives (`fraction_bar`, `number_line`, `bar_model`, `safe_math_renderer`) are still missing.
- ◐ in *Mastery Model* = `adaptive-learning` provides FSRS scheduling for flashcard apps, but there is no persistent server-side mastery model keyed by student_id × knowledge_point × subskill with confidence and `review_due`.

## 2. Per-agent professional skill stack

Each specialist agent must own a curated stack, not a renamed generic prompt.

### 2.1 system-orchestrator
**Owned by:** MentorNest itself (this role).
**Stack:**
- `mentornest-system-orchestrator` (current skill)
- `Skill Finder` (ClawHub + Skills.sh discovery)
- `skill-vetter` (security review before install)
- `self-evolving-skills` (turn recurring solutions into new skills)
- `spike` (throwaway prototypes; bundled gateway skill)
- `skill-creator` (bundled; SKILL.md authoring)
- `taskflow` (bundled; durable multi-step orchestration)

**Gaps in stack:**
- service-registry enforcement at write time
- automated change-plan generation
- regression harness against the custom plugin
- rollback manager for low-risk production edits
- deployment adapter for mentornest-web (Zeabur)

### 2.2 learning-director
**Stack today:** none (role not implemented).
**Stack needed:**
- reading learning_event stream (`data/learning-records/*.jsonl`) — no current reader
- cross-subject weakness aggregator
- prerequisite-gap detector
- weekly strategy planner
- recommendation emitter consumed by `parent-report-agent`

This is the single largest capability gap in Phase 2.

### 2.3 curriculum-agent
**Stack today:** none.
**Stack needed:**
- Taiwan K-12 curriculum map (grade × publisher × unit × knowledge_point)
- textbook-version normalizer
- confirmed-vs-inferred progress tracker
- exam-scope parser

Critical: no curriculum source-of-truth exists; we cannot separate "school-aligned" from "general" progress without it.

### 2.4 math-specialist
**Owned tools (verified):** `generate_practice_set`, `classify_math_error`, `student_profile_get`, `student_profile_update`, `learning_record_append`.
**Stack today:**
- `mentornest-tutor` (tutoring workflow)
- `Homework`, `Learning`, `Studying`, `Flashcards` (general pedagogy)
- `study-buddy`, `adaptive-learning` (practice + FSRS scheduling — but FSRS here is flashcard-app level, not mastery-store level)
- `diagram-maker` (general diagrams only)
- `knowledge-digest` (textbook → quiz/mindmap pipeline)
- `classify_math_error` (custom tool) — covers 1–2 dimensions of error taxonomy; needs full taxonomy

**Gaps in stack:**
- deterministic math validator (symbolic / numeric equivalence) — `missing · critical`
- `fraction_bar`, `number_line`, `bar_model` visual primitives — `missing`
- safe math renderer for MentorNest Web (LaTeX/JSX-safe) — `missing`
- geometry primitives (compass / protractor / shape canvas) — `missing`
- word-problem decomposition engine (bar-model → equation) — `missing`
- ratio / proportion visualizer — `missing`

### 2.5 chinese-specialist
**Stack today:**
- `mentornest-tutor`
- `Homework`, `Learning`, `Studying`, `Flashcards`
- `study-buddy` (text → quiz)
- `knowledge-digest` (textbook → summary)
- `diagram-maker` (lightweight diagrams for rhetoric/mindmaps)

**Gaps in stack:**
- Traditional Chinese reading comprehension diagnostician (specific error types: 主旨, 推論, 詞義, 文法, 修辭)
- composition scaffolding (outline → paragraph → 修辭 feedback)
- 字詞 / 成語 / 修辭 spaced repetition pool keyed to grade + publisher
- character / handwriting feedback (Phase 6 — `future`)

### 2.6 english-specialist
**Stack today:**
- `mentornest-tutor`
- `Homework`, `Learning`, `Studying`, `Flashcards`
- `study-buddy`, `Flashcards`
- `mentornest-stt` (English via SenseVoice multilingual)
- `knowledge-digest`

**Gaps in stack:**
- local TTS for read-aloud / shadowing — `missing · medium`
- pronunciation assessment (phoneme-level scoring) — `missing · medium`
- phonics progression (K–G3) tied to phonics skills
- grammar error taxonomy
- listening drill pipeline (audio → comprehension question)

### 2.7 science-specialist
**Stack today:**
- `mentornest-tutor`
- `Homework`, `Learning`, `Studying`
- `knowledge-digest` (this is the strongest existing primitive)
- `diagram-maker` (concept maps, process diagrams)

**Gaps in stack:**
- variable-control reasoning scaffolding
- experiment simulator (interactive)
- chart-reading grader (table/line/bar)
- cause-effect diagram library specific to elementary science

### 2.8 social-studies-specialist
**Stack today:**
- `mentornest-tutor`
- `Homework`, `Learning`, `Studying`
- `knowledge-digest`
- `diagram-maker` (timelines, maps)

**Gaps in stack:**
- Taiwan / regional history knowledge graph
- map-reading interactive canvas
- source-comparison grader (primary vs secondary)
- timeline authoring tool

### 2.9 question-bank-curator
**Stack today:** none.
**Stack needed:**
- raw question ingestion pipeline (PDF / image / OCR / text)
- knowledge-point classifier (taxonomy-aware)
- source/license extractor
- deduplication engine (text + semantic)
- segmentation (passage + sub-question)

Note: `knowledge-digest` and `adaptivetest` are adjacent but neither is suitable as the curator's engine — `knowledge-digest` is summary-oriented; `adaptivetest` requires an external API key.

### 2.10 question-quality-agent
**Stack today:** none.
**Stack needed:**
- deterministic answer validator (math expression equivalence; multiple-choice uniqueness)
- difficulty calibrator (model fit on empirical p-value)
- duplicate detector (semantic)
- license / commercial-use reviewer (writes verdict into `question.verified` and `question.source_license`)

### 2.11 assessment-agent
**Stack today:** `classify_math_error` (math-only), `generate_practice_set` (math-only), shared `student_profile_*` tools.

**Gaps in stack:**
- mastery check engine (multi-subject, knowledge-point + subskill)
- retention check (spacing schedule → recall test)
- difficulty calibration feedback loop
- cross-subject diagnostic assessment composer

### 2.12 learning-memory-agent
**Stack today:**
- `mentornest-learning` custom plugin (verified, 5 tools)
- student-profile skill (workflow rules; not a tool provider)
- `learning_record_append` (event append to per-student JSONL)

**Status:** production-grade. The data spine is in place.

### 2.13 parent-report-agent
**Stack today:** none.
**Stack needed:**
- longitudinal reader over learning_event stream
- weekly aggregation (mastery delta, error pattern frequency, review queue, school alignment)
- pattern recognizer (recurring gap vs occasional mistake)
- tone-controlled report generator (warm, non-comparative, zh-TW)

## 3. Shared engines (cross-agent)

These belong to the *platform*, not any single specialist. Specialists consume them; no specialist owns them.

| Engine | Status | Owner | Notes |
|---|---|---|---|
| visual-teaching-engine | ◐ partial | platform | `diagram-maker` covers generic diagrams; subject primitives missing |
| hint-ladder | ❌ missing | platform | Declared in `project.yaml`; no implementation |
| mastery-analytics | ◐ partial | platform | FSRS exists in `adaptive-learning`, but no server-side mastery store |
| answer-normalization | ❌ missing | platform | Required for deterministic math validator |
| question-bank | ❌ missing | platform | Three-layer model declared in `data-model.yaml`; no engine |
| local-stt | ✅ ready | platform | `mentornest-stt` + SenseVoice-Small int8; verified |

## 4. Custom plugin tool surface (verified live)

Source: `/home/node/.openclaw/plugins/mentornest-learning/openclaw.plugin.json`
Total: **43 tools** as of 2026-08-27T0809Z (Phase 2 fourth batch).

### v1 (preserved, backward compat)

```
student_profile_get               → learning-memory-agent (read)
student_profile_update            → learning-memory-agent (write, profile only)
learning_record_append            → learning-memory-agent (write, events only)
generate_practice_set             → math-specialist (math only)
classify_math_error               → math-specialist (math only)
```

### Phase 2 first batch

```
student_profile_v2_get            → learning-memory-agent
student_profile_v2_update         → learning-memory-agent
learning_event_reader             → learning-memory-agent
deterministic_math_validator      → math-specialist
hint_ladder_next                  → math-specialist
mastery_store_get                 → mastery-engine (v1)
mastery_store_update              → mastery-engine (v1)
curriculum_map_lookup             → curriculum-agent
curriculum_meta                   → curriculum-agent
```

### Phase 2 second batch

```
question_bank_curator_curate      → question-bank-curator
question_quality_agent_verify     → question-quality-agent (ONLY path into Verified)
question_quality_agent_dedupe_check→ question-quality-agent (read-only)
verified_bank_lookup              → assessment-agent (ONLY retrieval interface)
verified_bank_count               → assessment-agent
generate_practice_set_v2          → math-specialist (bank-first; math-only)
parent_setup_schema_validate      → learning-memory-agent
parent_setup_schema_copy          → learning-memory-agent (zh-TW strings)
```

### Phase 2 third batch

```
math_specialist_independent_verify      → math-specialist
question_bank_coverage_report           → question-bank-curator
ai_question_authoring_orchestrator_run  → question-bank-curator
ai_question_authoring_plan              → question-bank-curator
learning_director_cross_subject_weakness_aggregator → learning-director
learning_director_prerequisite_gap_detector          → learning-director
learning_director_weekly_strategy_emitter            → learning-director
```

### Phase 2 fourth batch (2026-08-27T0809Z)

```
mentornest_question_author_production   → mentornest-question-author (production AI)
school_progress_get                     → curriculum-agent
school_progress_update_confirmed        → curriculum-agent
school_progress_infer                   → curriculum-agent
school_progress_promote_to_confirmed    → curriculum-agent
confirmed_vs_inferred_progress_tracker  → curriculum-agent
school_alignment                        → curriculum-agent
textbook_mapping_engine                 → curriculum-agent
mastery_engine_v2_update_from_evidence   → mastery-engine
mastery_engine_v2_annotate_school_alignment → mastery-engine
mastery_engine_v2_error_pattern_aggregation → mastery-engine
mastery_engine_v2_retention_signal      → mastery-engine
mastery_engine_v2_list_evidence         → mastery-engine
mastery_engine_v2_get                   → mastery-engine
```

### Phase 3 — Subject Specialists + Unified Contract (2026-08-27T1100Z, SHIPPED)

Total Phase 3 tools: **73** (Math 11 + Chinese 11 + English 16 + Science 11 + Social Studies 13 + Unified Contract 11). Plugin manifest total: **116**.

```
# Phase 3-A — Math Specialist v2 + Visual Engine (11 tools)
math_error_taxonomy_lookup              → math-specialist
math_visual_engine_render               → math-specialist  (text descriptor only)
math_hint_ladder_v2_next                → math-specialist
word_problem_decomposer_analyze         → math-specialist
word_problem_decomposer_match_template  → math-specialist
math_prerequisite_chain_get             → math-specialist
math_prerequisite_weakest               → math-specialist
math_specialist_diagnose                → math-specialist  (pure JS, no LLM)
math_specialist_build_teaching_plan     → math-specialist
math_specialist_decide                  → math-specialist
math_specialist_emit_evidence           → math-specialist  (append-only ledger, never mastery)

# Phase 3-B — Chinese Specialist v1 (11 tools)
chinese_error_taxonomy_lookup           → chinese-specialist  (ZH-* codes)
chinese_curriculum_lookup_kp            → chinese-specialist
chinese_curriculum_list_for_grade       → chinese-specialist
chinese_subskill_classify               → chinese-specialist
chinese_hint_ladder_next                → chinese-specialist
chinese_specialist_diagnose             → chinese-specialist
chinese_specialist_build_teaching_plan  → chinese-specialist
chinese_specialist_decide               → chinese-specialist
chinese_specialist_emit_evidence        → chinese-specialist
chinese_classify_grammar_error          → chinese-specialist
chinese_phonetic_lookup                 → chinese-specialist  (注音; no TTS)

# Phase 3-C — English Specialist v1 + STT interface (16 tools)
english_error_taxonomy_lookup           → english-specialist  (EN-* codes)
english_curriculum_lookup_kp            → english-specialist
english_curriculum_list_for_grade       → english-specialist
english_subskill_classify               → english-specialist
english_hint_ladder_next                → english-specialist
english_specialist_diagnose             → english-specialist
english_specialist_build_teaching_plan  → english-specialist
english_specialist_decide               → english-specialist  (8 paths)
english_specialist_emit_evidence        → english-specialist
english_stt_transcribe_audio            → english-specialist  (interface; local SenseVoice)
english_stt_evaluate_pronunciation      → english-specialist  (interface; no cloud TTS)
english_specialist_text_rewrite         → english-specialist  (deterministic, no LLM)
english_specialist_vocab_drill          → english-specialist
english_specialist_grammar_drill        → english-specialist
english_specialist_listening_practice   → english-specialist
english_specialist_speaking_practice    → english-specialist

# Phase 3-D — Science Specialist v1 (11 tools)
science_error_taxonomy_lookup           → science-specialist  (SCI-* codes)
science_specialist_diagnose             → science-specialist
science_specialist_analyze_experiment   → science-specialist  (variable control)
science_specialist_interpret_chart_table → science-specialist
science_specialist_interpret_diagram    → science-specialist
science_specialist_decide               → science-specialist  (experiment_simulation, ...)
science_specialist_emit_evidence        → science-specialist
science_hint_ladder_next                → science-specialist
science_curriculum_lookup_kp            → science-specialist
science_curriculum_list_for_grade       → science-specialist
science_subskill_classify               → science-specialist

# Phase 3-E — Social Studies Specialist v1 (13 tools)
social_studies_error_taxonomy_lookup    → social-studies-specialist  (SS-* codes)
social_studies_specialist_diagnose      → social-studies-specialist
social_studies_specialist_analyze_timeline    → social-studies-specialist
social_studies_specialist_analyze_map         → social-studies-specialist
social_studies_specialist_analyze_causality   → social-studies-specialist
social_studies_specialist_compare_sources     → social-studies-specialist
social_studies_specialist_interpret_demographic_chart → social-studies-specialist
social_studies_specialist_decide        → social-studies-specialist
social_studies_specialist_emit_evidence → social-studies-specialist
social_studies_hint_ladder_next         → social-studies-specialist
social_studies_curriculum_lookup_kp     → social-studies-specialist
social_studies_curriculum_list_for_grade→ social-studies-specialist
social_studies_subskill_classify        → social-studies-specialist

# Phase 3-F — Unified Subject Contract + Dispatcher (11 tools)
subject_v1_contract_version             → learning-director-v2
subject_v1_validate_request             → learning-director-v2
subject_v1_validate_response            → learning-director-v2
subject_specialist_dispatch             → learning-director-v2  (5-subject router)
subject_specialist_capability_report    → learning-director-v2
cross_subject_merge_decisions           → learning-director-v2
learning_director_v2_dispatch_next_step → learning-director-v2
learning_director_v2_capability_report  → learning-director-v2
subject_v1_request_template             → learning-director-v2
subject_v1_response_template            → learning-director-v2
subject_v1_dispatch_examples            → learning-director-v2
```

**Phase 3 invariants verified:**
- Each subject uses its OWN error-code prefix: MATH-* / ZH-* / EN-* / SCI-* / SS-*. No cross-subject leakage.
- Each subject emits its OWN evidence_payload schema (`math-specialist-evidence-v1`, `chinese-specialist-evidence-v1`, ...). Unified Contract dispatcher preserves schemas verbatim — no generic tutor merging.
- All `*_specialist_emit_evidence` tools APPEND to `data/mastery-evidence/<id>.jsonl` (append-only). NEVER touch `data/mastery/<id>.json`.
- Math validator: pure JS, no LLM.
- English STT: interface only; production uses local SenseVoice-Small int8 (skills/mentornest-stt). Cloud STT explicitly forbidden.
- Live `data/learning-records/student_001.jsonl` line count UNCHANGED (26) across Phase 3 (A+B+C+D+E+F).
- Protected MD5s UNCHANGED: AGENTS / SOUL / USER / IDENTITY.

## 5. Discrepancies — Registry vs environment

These are facts the orchestrator found, not opinions.

> Resolution status as of 2026-08-27 registry cleanup (see changelog).

1. **`skills-registry.yaml` referenced `safe-self-improving-agent`** but the actual installed skills in this category are `self-evolving-skills`, `self-improving-agent-c` (`self-improvement`), and `stitch-self-improver` (`self-improving-agent`). The literal name `safe-self-improving-agent` did not exist on disk. — **Resolved**: registry now uses canonical `self-improving-agent` (stitch-self-improver) + `self-improvement` (self-improving-agent-c).
2. **`skills-registry.yaml` listed `eric-knowledge-digest`** as `shared_ready`; the on-disk directory is `knowledge-digest/` and its SKILL.md front-matter `name:` is `knowledge-digest`. Same skill, different identifier. — **Resolved**: registry canonical name is `knowledge-digest`; `install_slug` keeps the original `eric-knowledge-digest` slug so any external references do not break.
3. **`skills-registry.yaml` did not list `student-profile`** even though `skills/student-profile/SKILL.md` is present and AGENTS.md explicitly references it. — **Resolved**: added to `shared_ready` (workflow-only; not a tool provider).
4. **`skills-registry.yaml` did not list `adaptivetest`**; the third-party `adaptivetest-skill` was installed and calling `https://adaptivetest-platform-production.up.railway.app/api` with `ADAPTIVETEST_API_KEY`. — **Resolved (user decision 2026-08-27)**: archived to `workspace/_archive/skills/adaptivetest-skill/`; registry records canonical name, install_slug, original directory, archive directory, and the re-promotion gate.
5. **`capabilities.yaml` `system_orchestration.existing`** listed `safe-self-improving-agent`. — **Resolved**: replaced with the three actual canonical names.
6. **`agents.yaml` mentions `required_capabilities`** for `math-specialist` and `preferred_tools` for `english-specialist**, but no registry currently enforces or even inventories those tool lists. — **Open**: see decisions appendix below; will become part of Phase 2 implementation plan.
7. **Two students on disk but profile data is thin**: `student_001` (奐奐, grade 5) has artifacts from a fraction-addition lab; `student_002` (靚靚) has grade=null. No publisher, no current_unit stored for either. Curriculum-agent cannot function until this is populated — by the parent, not by the agent. — **Schema fixed**: Student Profile v2 schema drafted in `data-model.yaml` § profile_v2. Existing student JSON files intentionally not migrated automatically (would touch learning data); migration gated on parent opt-in.

## 5a. Decisions adopted 2026-08-27

See changelog for the full list. Summary:

- **Curriculum source-of-truth**: Taiwan 教育部 official curriculum documents only; publishers map *into* the curriculum, never *into* the bank.
- **Question Bank**: V1 shared bank accepts only parent-private upload, teacher/parent-authored, clear open-license, or MentorNest AI-original/adapted content. Commercial publisher content is not accumulated into a shared commercial bank.
- **Student Profile v2**: extends schema with `school_curriculum`, `textbook_version`, `learning_goals`, `parent_concerns`, `school_progress`. `school_name` / `class_name` are explicitly OPTIONAL and never requested by default.
- **`adaptivetest`**: archived from active skills; recorded in registry § `archived`.
- **Canonical naming**: registry `canonical_name` matches each SKILL.md front-matter `name:`; `install_slug` and `local_directory` are recorded alongside so external links survive.
- **No SOUL / USER / IDENTITY / AGENTS edits**.
- **No new external APIs**.
- **No modification to existing learning_event records**.

## 6. Cross-agent vs specialist isolation

Must be **shared (platform-level)** — every agent depends on it:
- student profile + learning_event persistence (already shared)
- local STT (already shared, kid-safe)
- hint-ladder, mastery-analytics, answer-normalization, question-bank (declared shared but not yet built)
- knowledge-digest, diagram-maker, study-buddy, adaptive-learning, Flashcards (pedagogy primitives — usable by any subject agent)

Must be **specialist-isolated** — wrong to share:
- `generate_practice_set` — today is math-only; do not let other specialists reuse the same tool definition. Each subject needs its own practice-set composer that respects subject-specific question_type taxonomy (e.g. chinese 成語 vs math word problem).
- `classify_math_error` — math-specific; the name says so. Other subjects need their own classifiers with their own error taxonomies.
- math visual primitives (fraction_bar, bar_model, number_line) — semantically meaningful only in math contexts; sharing them risks misuse in chinese/english.
- subject knowledge graphs — chinese idiom graph, english phonics graph, science concept graph must not bleed into each other.

Reusable but **gated**:
- `adaptive-learning` (FSRS scheduler) is reusable for any subject's review queue, but only if the persistence layer is shared. Today it ships its own JSON store — must be refactored to read/write the canonical learning_event stream.
- `knowledge-digest` is reusable for any subject for "textbook → summary" but the output quiz generator is generic; subject specialists must post-process its output, not consume it raw.

## 7. Readiness snapshot (one-line)

**Phase 3 shipped 2026-08-27 — subject specialists now GREEN.**

- **Green (production-ready):** learning-memory-agent · local-STT platform engine · **math-specialist (Phase 3-A)** · **chinese-specialist (Phase 3-B)** · **english-specialist (Phase 3-C)** · **science-specialist (Phase 3-D)** · **social-studies-specialist (Phase 3-E)** · **learning-director-v2 (Phase 3-F)** · question-bank-curator · question-quality-agent · assessment-agent
- **Yellow (functional but incomplete):** system-orchestrator (regression harness + rollback manager still TODO) · learning-director v1 (superseded by v2 but not removed)
- **Red (declared but unimplemented):** curriculum-agent (read-only working; bulk promotion + staleness expiry TODO) · parent-report-agent (deferred until ≥2 weeks mastery data)

## 8. Phase 3.5 + Phase 4A readiness snapshot — 2026-08-27T1131Z

### Phase 3.5 shipped (2026-08-27T1118Z)
- **Math Visual Engine v1 (SVG-first)**: `math_visual_engine_render` + `math_visual_engine_render_text_only` (3 SVG concepts: fraction_bar, number_line, bar_model). Inline styles only. Theme hook **deferred to Phase 5 / Child Learning Experience Designer**.
- **Local TTS (sherpa-onnx-tts priority)**: `tts_synthesize`, `tts_list_voices`, `tts_status`, `tts_hash_text`. Cloud TTS forbidden.
- **Legacy mastery backfill**: `mastery_backfill_dry_run`, `_apply`, `_status`, `_rollback`, `_classify_event`. Human-curated mapping table at `architecture/data/legacy_event_mapping.yaml` (24 convert + 2 exclude).
- **Curriculum TTL/stale lifecycle**: `school_progress_inferred_status`, `_mark_stale`, `_promote`, `_ttl_sweep`. Mark stale on age ≥ TTL; **never delete, never auto-promote to confirmed**.

### Phase 4A shipped (2026-08-27T1131Z)
- **Raw question ingestor** (`raw_question_ingest`): text / structured / pdf / image. PDF/image return `unsupported_in_round_4a` (no cloud OCR / no `pdf-parse` this round). **Pure module — no disk writes.**
- **Question segmenter** (`raw_question_segment`): short_answer / multiple_choice / true_false / fill_in_blank / essay / unknown. **Pure module — no disk writes.**
- **Ingestion contract**: only Raw Pool; Verified Bank writes remain the curator's job. Future PDF/image support requires Phase 4B/4C decision on OCR strategy.

### Plugin tools: 130 → 132
### Test totals: 1136 → 1253 (117 new Phase 4A tests; 0 failures)

### Production invariants preserved
- `data/learning-records/student_001.jsonl` MD5 `5facdbf0b47e67d30baea59704ef0a90` UNCHANGED (26 lines)
- `data/mastery-evidence/student_001.jsonl` MD5 `47ada0bdaabcab4683484427f581295c` UNCHANGED (168 lines)
- `data/mastery-evidence/student_002.jsonl` MD5 `4b8e844ed4e234aada339a656785a185` UNCHANGED (1 line)
- AGENTS / SOUL / USER / IDENTITY MD5 UNCHANGED
- `student_t_*` artifacts do NOT grow between consecutive suite runs (verified 2× back-to-back)

### Env naming locked (production must set both)
- `MENTORNEST_WORKSPACE` (required) — workspace root
- `MENTORNEST_DATA_DIR` (optional) — defaults to `<MENTORNEST_WORKSPACE>/data`

### Deferred agents / capabilities
- **child-learning-experience-designer** — formally added to baseline (architecture/agents.yaml, skills-registry.yaml); implementation deferred to Phase 5+ (mentornest-web v2)
- **Visual theme hook** — deferred to Phase 5 / Designer
- **PDF / image OCR** — deferred to Phase 4B/4C (cloud OCR decision pending)


## 8a. Phase 4B readiness snapshot — 2026-08-27T1518Z

### Phase 4B shipped (2026-08-27T1518Z) — KP classifier + License + Local PDF + pipeline closure
- **Knowledge Point classifier** (`kp_classify`): Taiwan G1-G6 curriculum V1; emits `{matched_kp, confidence, candidates[], status}`. Thresholds: `≥0.6` match; `0.3–0.6` `low_confidence`; `<0.3` `unknown`. **Low-confidence / unknown are REJECTED from Verified Bank promotion** (raw pool still keeps with that status).
- **Source license extractor** (`license_extract`): enum `PRIVATE / AI_ORIGINAL / AI_ADAPTED / CC0 / CC-BY / CC-BY-SA / UNKNOWN / COMMERCIAL_RESTRICTED`; publisher sniff for 翰林 / 康軒 / 南一 / Pearson / Oxford / McGraw-Hill / MIT / GPL / ©. Provenance always preserved.
- **License reviewer** (`license_review`): decision matrix `allow_shared | allow_private_only | requires_attribution | reject`. **`UNKNOWN` and `COMMERCIAL_RESTRICTED` are FORBIDDEN from shared Verified Bank.**
- **Local selectable-text PDF extraction**: `raw_question_ingest` extended with PDF byte-buffer path. If `pdf-parse` or `pdfjs-dist` is installed → `extraction_quality="full_text"`; else crude ASCII byte extraction → `extraction_quality="ascii_fallback"`. Scanned / image-only PDFs return `unsupported_in_round_4a`. **No cloud OCR; no Tesseract primary; no new npm deps this round.**
- **Raw → Verified pipeline** (`raw_question_ingest_full_pipeline`): ingest → segment → KP classify → license extract → license review → quality verify. Disposition enum: `accepted_into_verified_bank | rejected_by_kp | rejected_by_license | rejected_by_quality | unsupported_pdf`.
- **Single Verified Bank writer** (CRITICAL INVARIANT): only `question_quality_agent_verify` writes to `verified/`. `ai_question_authoring_orchestrator` and `raw_question_ingest_full_pipeline` both call it; signature extended, no parallel writer added.

### Plugin tools: 132 → 136 (4 new: kp_classify, license_extract, license_review, raw_question_ingest_full_pipeline)
### Test totals: 1253 → 1401 (148 new Phase 4B tests; 0 failures)

### Production invariants preserved (after Phase 4B integration)
- `data/learning-records/student_001.jsonl` MD5 `5facdbf0b47e67d30baea59704ef0a90` UNCHANGED (26 lines) — **legacy apply batch `bf_20260827T125900Z_38a828` preserved**
- `data/mastery-evidence/student_001.jsonl` MD5 `aacd412b51268f75b61b54ae6a590fad` UNCHANGED (192 lines — was 168 before legacy apply; legacy apply retained, NOT rolled back)
- `data/mastery-evidence/student_002.jsonl` MD5 `4b8e844ed4e234aada339a656785a185` UNCHANGED (1 line)
- AGENTS / SOUL / USER / IDENTITY MD5 UNCHANGED
- `student_t_*` artifacts do NOT grow between consecutive suite runs

### Deferred / owed
- **PDF OCR for scanned images** — still `unsupported_in_round_4a`; cloud OCR / Tesseract primary / ONNX-OCR remain explicitly FORBIDDEN by Phase 4B constraints.
- **Phase 5 install gate** — see `architecture/skill-gap-analysis.md § 10.8`. None of the 6 conditions met yet (React + Vite + TS scaffolding still pending).


## 9. Phase 4 architecture — Child Learning Experience Designer

### Agent added (architecture only)
- **canonical_name**: `child-learning-experience-designer`
- **status**: `architecture_only` (no runtime code in this round)
- **rows**: `architecture/agents.yaml` (row + responsibilities + cannot + handoff_contract)
- **rows**: `architecture/skills-registry.yaml` (agents_baseline_locked_pending_implementation spec)

### Capabilities owned by this agent
| Capability | Surface |
|---|---|
| presentation_request_v1 contract | subject_specialist → designer handoff |
| design_system_maintenance | `architecture/design/design-system.yaml` |
| age_appropriateness_review | `architecture/design/age-profiles.yaml` |
| usability_review | `architecture/design/interaction-patterns.yaml` |
| accessibility_review | `architecture/design/accessibility.yaml` |
| cognitive_overload_review | `architecture/design/accessibility.yaml#cognitive_load` |
| mobile_tablet_regression | (Phase 5+) design tokens responsive breakpoints |
| child_facing_copy_review | interaction-patterns.yaml#voice_interaction_ux + child_copy |

### Capabilities NOT owned
- judge_student_mastery → mastery_engine_v2
- modify_learning_records → learning_director
- decide_teaching_content → subject_specialists
- override_subject_specialist_diagnosis → forbidden

### Design Registry files (architecture/design/)
| File | Lines | Purpose |
|---|---|---|
| design-system.yaml | 135 | entry point + handoff contract + layers + invariants |
| design-tokens.yaml | 239 | typography, spacing, border_radius, sizes, colors, states, motion, touch target |
| age-profiles.yaml | 187 | G1-G2 / G3-G4 / G5-G6 / G7+ reserved |
| components.yaml | 150 | question_card, hint_panel, progress_bar, feedback_state, drag_drop, math_input, voice_input, handwriting_input (deferred) |
| interaction-patterns.yaml | 235 | 7 patterns + hint ladder + feedback FSM + voice UX + math input UX + handwriting placeholder |
| accessibility.yaml | 199 | WCAG AA + child-specific extensions + personalization guardrails |


## 10. Phase 4 web-v2 tech decisions (ratified 2026-08-27T1252Z)

| ID | Decision | Document |
|---|---|---|
| HD-WV2-1 | React + Vite + TypeScript | `architecture/design/design-system.yaml#human_decisions_20260827T1252Z` |
| HD-WV2-2 | Design tokens = CSS variables (`--mn-` prefix); no Tailwind this round; no npm split yet | `architecture/design/design-tokens.yaml#token_compilation` |
| HD-WV2-3 | Keyboard shortcuts supported (R / H / 1-9 / Enter / Space / Esc / ?) but NOT surfaced on-screen; G1-G4 disable entirely | `architecture/design/interaction-patterns.yaml#keyboard_shortcuts` |
| HD-WV2-4 | Color modes (default / high_contrast / color_vision_safe) are explicit user settings, NOT browser-autodetect | `architecture/design/accessibility.yaml#color_vision_modes` |
| HD-WV2-5 | NO fixed mascot v1: G1-G4 abstract icon + mild expression states; G5-G6 NO mascot; TTS voice unbound | `architecture/design/age-profiles.yaml` |
| HD-WV2-6 | Child usability research requires opt-in consent; product telemetry and research data are SEPARATE streams | `architecture/policies.yaml#child_research_consent_policy` |
| HD-WV2-7 | Phase 1 usability = local + parent-supervised; no SaaS (Maze / UserTesting / recording) | `architecture/policies.yaml#child_research_consent_policy.phase_1_usability_plan` |


---

## § 9 — Phase 4C readiness snapshot (SHIPPED 2026-08-27T1615Z)

### Shipped items
- 6 new lib modules: `question_coverage_analyzer`, `question_generation_planner`, `difficulty_controller`, `variation_generator`, `duplicate_detector`, `answer_verifier`
- 1 extended tool in place: `ai_authoring_orchestrator_run` (gained `runCoverageDrivenPlan(input)`); NOT added under a new name
- 8 test files, 157 new tests, all green
- Manifest: 136 → **142 tools**

### Invariants verified end-to-end (in integration test)
- AI → Verified Bank ONLY via `question_quality_agent_verify` (single writer invariant)
- authorFn privacy fence (15 forbidden fields including student_id, display_name, audio, image, raw_learning_history)
- low-confidence KP (< 0.6) cannot be forced (planner default kp_confidence_floor=0.6)
- duplicate detection rejects before verifyQuestion
- answer_verifier fails closed on invalid/ambiguous answers
- generated content license = AI_ORIGINAL (orchestrator path); AI_ADAPTED only via variation_generator when seeded from human source
- no bulk cadence (default `max_new_questions=0`)
- sufficient coverage → empty plan; deficit coverage → only missing/under_covered KPs planned

### Test totals
- Phase 4C targeted: 157/157 PASS
- Full regression: 1558/1558 PASS, 0 failures

### Production invariants
- All 8 MD5 baselines UNCHANGED (learning-records / mastery-evidence / AGENTS / SOUL / USER / IDENTITY)
- Legacy backfill `bf_20260827T125900Z_38a828` RETAINED (24 entries)
- No student_t_phase4c_* artifacts leaked to production

### Deferred items (still owed)
- R9 PDF parser decision (Phase 4C kickoff)
- R10 license provenance UI (Phase 5)
- R11 PRIVATE lifecycle (Phase 4C kickoff)
- R1-R8 unchanged from prior registry


---

## § 10 — Phase 5A readiness snapshot (SHIPPED 2026-08-27T1655Z)

### Status history
- 20260827T1625Z — implementation_complete_acceptance_pending
- 20260827T1655Z — SHIPPED

### Acceptance evidence

#### A. Production mentornest-web unchanged
- Service: Zeabur `6a8eaa6e7d3d98c91024fb26` (separate pod)
- Endpoint: `http://10.43.188.51:3000/` (resolved via K8s SERVICE_PORT env var)
- HTML MD5: `dbb08728c4b213a1ca7ba55c6261b1d6` (35900 bytes, "MentorNest 練習室")
- Re-fetched at acceptance close: same MD5 ✓
- Phase 5A scaffold (`workspace/mentornest-web-v2/`) is a completely separate artifact
  (Vite + React + TS; 407-byte HTML + 157 KB JS bundle; title "MentorNest Web v2")

#### B. Real-browser acceptance (Playwright + axe-core)
- axe results: **0 critical, 0 serious, 0 moderate, 0 minor** across mobile/tablet/desktop
- Behavioral checks all pass:
  - Mobile (360×800): 1-col choice grid, 360×464 card
  - Tablet (768×1024): 2-col grid (361+361), card 768×316
  - Desktop (1280×800): 2-col grid (457+457), card 960×316
  - Roving tabindex: [0,-1,-1,-1]
  - Arrow keys + Space/Enter navigate + select
  - Tab+Tab+Enter submits and reveals feedback
  - live region (role=status aria-live=polite) present
  - radiogroup aria-labelledby=question-stem; radios aria-checked; hint toggle aria-expanded/aria-controls
  - All 6 touch targets ≥ 48px (G3-G4 minimum)
  - Color modes (default / high-contrast / color-vision-safe) all apply without axe violation
  - Correct/error/hint states carry icon glyph + text (R7 — never color alone)
  - prefers-reduced-motion collapses transitions to 0.01ms (verified as 1e-05s)
  - focus-visible ring always-on, 3px high-contrast outline

### Fixes applied during acceptance (component-only, not learning logic)
1. `color-contrast (serious)` on 看提示 button — white on `#4A90E2` = 3.29:1.
   Added `--mn-semantic_colors-roles-primary_button: #1d5fb6` (5.5:1 on white).
   Used by `.mn-button` and `.mn-choice-key`.
2. `listitem (serious)` — `<ul role="radiogroup">` confused axe.
   Changed container to `<div role="radiogroup">` with `<div>` choice cells.
   `role="radio"` preserved on each choice; aria semantics unchanged.

### Test totals
- Phase 5A targeted: 101/101 PASS (90 foundation + 11 vertical-slice)
- mentornest-learning full regression: 1558/1558 PASS (unchanged from Phase 4C)
- Production invariants: 8/8 byte-identical
- production mentornest-web HTML MD5: unchanged

### Bundle
- JS: 156.81 KB minified
- CSS: 8.86 KB minified
- HTML: 0.41 KB

### Out of scope this round (deferred)
- Phase 5B: matching / ordering / drag_drop patterns; dnd-kit wiring; Storybook stub; bundle budget checker; second real-browser audit
- Phase 5C: essay_open_response; real-device performance
- Phase 6: handwriting recognition
- Parent view

### Snapshot
- `architecture/_backups/20260827T1655Z_phase5a_acceptance/`

---

## § 11 — Phase 5B readiness snapshot (SHIPPED 2026-08-27T1725Z)

### Status history
- 20260827T1725Z — SHIPPED

### Scope
One complete G5 math tutoring flow:
- Topic: `math.G5.FRAC.add-unlike-denom`
- Question: `1/3 + 1/2 = ?`
- Expected answer: `5/6`
- Full flow: question → wrong answer (1/2) → hint level 1 (text) → wrong answer (1/3) → hint level 2 (fraction-bar SVG) → correct answer (5/6) → feedback

### Components shipped

#### MathVisualRenderer (controlled React wrapper)
- Engine authoritative: `plugins/mentornest-learning/lib/math_visual_engine.mjs::renderFractionBar / renderNumberLine / renderAreaModel / generateVisualSVG` is the ONLY SVG source.
- React only wraps with chrome (label, sr-only fallback, container).
- Sanitizer: `src/math-rendering/svg-sanitizer.mjs` — whitelist of tags + case-insensitive attribute matching, emits **case-sensitive** SVG (viewBox, preserveAspectRatio preserved).
- Wrappers carry `aria-hidden=true`; SR-only text describes the math.

#### NativeMathKeypad
- No MathLive.
- Supported value kinds: `empty | integer | decimal | fraction | fraction_partial | mixed | operator_expr`.
- Fraction UX: numerator / denominator field buttons, Tab swaps active field AND moves DOM focus.
- Keyboard equivalent: digits 0–9, decimal `.`, operators `+ − × ÷`, backspace, clear (Escape or button), Enter (submit).
- `clear` resets both `numeratorBuf` and `denominatorBuf`.

#### AnswerValidator
- Pass-through wrapper around `plugins/mentornest-learning/lib/math_validator.mjs::validateMathAnswer`.
- Accepts equivalent fractions (`1/2 == 2/4 == 3/6`) via gcd reduction.
- Deterministic verdict: `correct | incorrect | unverifiable`.

#### HintController
- Source: `plugins/mentornest-learning/lib/math_hint_ladder_v2.mjs::nextMathHint` (levels 1–4).
- Phase 5B escalation policy:
  - Wrong #1 → level 1 conceptual nudge (text-only)
  - Wrong #2 → level 2 fraction-bar SVG (for `math.G5.FRAC.add-unlike`, level 2 = `L2_FRAC_ADD_DIFF`)
  - Wrong #3+ → level 3 intermediate structure
- Caps at level 3; never reveals the final answer immediately.

### G5 presentation profile
- Mature, concise, no mascot, minimal decoration
- Tag badge + 1-line learning goal
- Single primary color (button only); body text uses default token
- Per `architecture/design/age-profiles.yaml::G5-G6.band.mascot_allowed: false`

### Acceptance evidence

#### A. Production mentornest-web unchanged
- Service: Zeabur `6a8eaa6e7d3d98c91024fb26` (separate pod, K8s service env)
- Endpoint: `http://10.43.188.51:3000/`
- HTML MD5: `dbb08728c4b213a1ca7ba55c6261b1d6` (re-fetched at acceptance close: same MD5 ✓)

#### B. Real-browser acceptance (Playwright + axe-core)
- axe results: **0 critical, 0 serious, 0 moderate, 0 minor** across mobile (360×800) / tablet (768×1024) / desktop (1280×800)
- Behavioral checks (all pass):
  - Keyboard-only fraction input: numerator click → type 1 → Tab → type 2 → submit → feedback visible → sr-status-g5 announces
  - Hint escalation: wrong #1 → `data-stage="text_only"` (visual count 0); wrong #2 → `data-stage="fraction_bar"` (2 SVGs)
  - Fraction validator accepts equivalent (1/2 wrong → 5/6 correct path)
  - ARIA labels: numerator=`分子`, denominator=`分母`, keypad=`數字鍵盤`, stem=`g5-stem` with `aria-labelledby`
  - Live region: `role="status" aria-live="polite"` present
  - Touch targets: 21 keypad keys, all ≥ 44px (G5-G6 minimum)
  - SVG a11y: 2 SVGs both have `xmlns`, `viewBox`, `<title>`, `<desc>`; wrappers `aria-hidden=true`; sr-only math text present

#### C. Regression
- mentornest-learning plugin: 1558/1558 PASS (unchanged)
- Phase 5A browser acceptance: still 0 critical + 0 serious axe violations
- Production data: 7/7 MD5 byte-identical
- No `student_t_phase5b_*` artifacts

### Fixes applied during acceptance (component-only, not learning logic)
1. **viewBox case preservation in sanitizer** — SVG attribute names are case-sensitive (`viewBox`, not `viewbox`). Sanitizer was lowercasing the output, stripping semantic value.
2. **Keypad digit dispatch combines numerator + denominator buffers** — typing "5" then Tab then "6" was leaving `state.value.kind === "fraction_partial"`, which made the submit button stay disabled.
3. **Keypad `clear` resets both buffers** — was only resetting the state machine, leaving stale buffer state.
4. **Tab key moves actual DOM focus** — Tab was changing `active_field` but not moving the browser's focus, so subsequent keystrokes went to the wrong target.
5. **Testid de-duplication** — `hint-panel` and `sr-status` were duplicated across MC and G5 slices; renamed to `sr-status-g5` / `sr-status-mc` and scoped selectors in the acceptance test.
6. **Vite resolve.alias for `node:assert/strict`** — `math_validator.mjs` uses node built-in `assert`; Vite bundled it as an undefined module. Added browser shim at `src/vite-shims/assert-strict.mjs` exposing `ok / equal / notEqual / deepEqual / fail` + `.strict` namespace.

### Test totals
- Phase 5A + 5B combined: **169/169 PASS** (Phase 5A 101 + Phase 5B 68)
- mentornest-learning full regression: 1558/1558 PASS (unchanged)

### Bundle (vs Phase 5A)
- JS: 188.99 KB (+32.18 KB)
- CSS: 16.00 KB (+7.14 KB)
- HTML: 0.41 KB (+0)

### Out of scope this round (deferred)
- dnd-kit wiring (matching / ordering / drag_drop patterns)
- Math keypad mixed-number UX (kind stub exists; UI deferred)
- Storybook expansion
- Parent view
- Handwriting recognition (Phase 6)

### Snapshot
- `architecture/_backups/20260827T1725Z_phase5b_closure/` (phase5a + phase5b browser acceptance JSONs + vite.config.ts + assert-strict shim + browser_acceptance_phase5b.mjs + prod-web-now.html)

---

## § 12 — Phase 5C-1 readiness snapshot (SHIPPED 2026-08-27T2345Z)

### What shipped (Phase 5C-1: Child Learning Session)
- `ChildHome` (data-testid `child-home`) — minimal entry: "start today's learning" + resume from localStorage snapshot
- `SessionView` (data-testid `session-view`) — owns the session state machine, dispatches submit / hint / retry / representation_switch / advance
- `QuestionRenderer` (data-testid `question-{step_id}`) — data-driven dispatcher:
  - `MultipleChoiceSubtree` for `multiple_choice` (with wrong-feedback + retry-button + skip-question paths)
  - `InputSubtree` for `fraction_input` / `integer_input` / `decimal_input` (NativeMathKeypad + MathVisualRenderer when phase ≥ hint_level_2)
  - `UnsupportedNotice` for `short_answer` / `true_false` / `matching` / `ordering` / `drag_drop` (deferred to 5C-2 / 5C-3 / Phase 6)
- `SessionSummaryView` (data-testid `session-summary`) — read-only post-session view
- `session-state.mjs` — pure state machine with `STEP_VERDICT`, `STEP_PHASE`, `SESSION_STATUS`, adaptive `nextPhase` policy
- `learning-director-adapter.mjs` — wraps `learning_director_v2.dispatchNextStep` + `verified_bank_lookup.lookupVerified`; production student IDs (`student_001` / `student_002`) REFUSED
- `fixtures.mjs` — 4-step fixture (MC G3 + fraction G5 + integer G4 + decimal G5) gated by `VITE_USE_FIXTURES`

### Adaptive behavior (verified via real browser)
- Correct first attempt → phase=`feedback` → advance
- Wrong first attempt → phase=`hint_level_1` → 看提示 button
- Click 看提示 → hints_used=1 → phase=`hint_level_2` → text-only conceptual hint via `nextMathHint`
- Click 看提示 again → hints_used=2 → text hint (L2)
- Click 看提示 third time → hints_used=3 → phase=`hint_level_3` → intermediate structure (L3)
- 4+ attempts → phase=`hint_level_3` retained (no skipping to answer)
- Representation toggle: `fraction_bar` ↔ `number_line` (and `bar_model` for integer/decimal)
- Mastery/weak KP: `recommend_next` returns `targeted_practice` when `weak_kps` is non-empty
- All choices come from existing Learning Director / Verified Bank / orchestrator (NO UI-side random logic)

### Tests
- 201/201 unit tests PASS in mentornest-web-v2 (foundation 90 + vertical-slice 34 + session 32 + input 28 + math-rendering 17)
- 6/6 real-browser behavioral guards PASS (full_session + reload_resume + retry + hint_escalation + representation_switch + summary)
- 1558/1558 plugin regression tests PASS (unchanged from Phase 5B)

### Real-browser acceptance (Playwright + axe-core 4.13.0)
- `test/a11y/browser_acceptance_phase5c1.mjs`
- Results: `/tmp/phase5c1_browser_acceptance.json`
- Viewports: mobile (360×800) / tablet (768×1024) / desktop (1280×800)
- axe: **0 critical + 0 serious + 0 moderate + 0 minor** across all 3 viewports
- Console errors: 0
- Reload-resume: Q1 visible after reload + `data-testid="session-resumed-notice"` shown
- Hint escalation: `data-stage="hint_level_2"` panel + `data-testid="math-visual"` count=1 after 1 wrong + 看提示

### Production invariants (re-verified at 2026-08-27T2345Z)
- `data/learning-records/student_001.jsonl` MD5 `5facdbf0b47e67d30baea59704ef0a90` ✓ unchanged
- `data/mastery-evidence/student_001.jsonl` MD5 `aacd412b51268f75b61b54ae6a590fad` ✓ unchanged
- `data/mastery-evidence/student_002.jsonl` MD5 `4b8e844ed4e234aada339a656785a185` ✓ unchanged
- AGENTS.md MD5 `fc0a1477c9bd6ae631cf2aea5ce75f1e` ✓ unchanged
- SOUL.md MD5 `e067ae104d26c5ca90679be0b23a4fe7` ✓ unchanged
- USER.md MD5 `9f90803726401fa166be4ab1ad848182` ✓ unchanged
- IDENTITY.md MD5 `d165c2d42796d1f41455020b31785def` ✓ unchanged
- `production mentornest-web HTML` MD5 `dbb08728c4b213a1ca7ba55c6261b1d6` ✓ unchanged (35900 bytes)

### Bundle (vs Phase 5B)
- JS: 283.70 KB (+94.71 KB)
- CSS: 17.50 KB (+1.50 KB)
- HTML: 0.41 KB (+0)

### Out of scope this round (deferred to Phase 5C-2 / 5C-3)
- `short_answer` (text input with rubric matching)
- `explain_thinking` (open response)
- Voice input (SenseVoice STT) + TTS prompts
- Parent Summary view (5C-3)
- License provenance UI in parent view
- dnd-kit wiring (matching / ordering / drag_drop)
- Handwriting recognition (Phase 6)

### Snapshot
- `architecture/_backups/20260827T2345Z_phase5c1_closure/`

---

## § 13 — Agent Professional Autonomy Refactor (SHIPPED 2026-08-28T1651Z)

### Goal
Restore professional judgment space to every specialist agent.  Existing
implementation is NOT a constraint; existing architecture is a baseline, not
a prison.  Hard Invariants remain binding; everything else is professional
autonomy.

### Two-tier rule system (now codified in `agents.yaml` v1.1)
- **Hard Invariants** (each agent's `cannot:` block): child safety, privacy,
  data integrity, security, licensing, accessibility hard requirements,
  cross-agent authority boundaries, explicit human product decisions.
- **Professional Autonomy** (each agent's `professional_autonomy:` block):
  guidance for orchestrator / peers, NOT restrictions.  Specialists may
  legitimately exceed these when the professional case is strong.

### Orchestrator rule change
1. Specialist / designer / domain agent FIRST delivers its best professional
   proposal.
2. Orchestrator reviews against Hard Invariants only.
3. If a Hard Invariant is violated, point to which one and request revision.
4. Do NOT pre-empt specialist exploration with implementation micro-rules.

### Per-agent changes (summary; full text in `agents.yaml` v1.1)

| Agent | What was loosened | New Hard Invariant (was missing) |
|---|---|---|
| child-learning-experience-designer | Removed `decide_teaching_content` ambiguity; `trade_accessibility_for_aesthetics` clarified as "bypass WCAG AA / ≥44px / keyboard reachability" — designer can still weigh aesthetics in trade | Same as before + "no mixing learning content with unrelated tracking" |
| system-orchestrator | New responsibilities: specialist_proposal_review, hard_invariant_enforcement | Cannot pre-emptively restrict a specialist's professional proposal before delivery |
| learning-director | May redesign tutoring sequence, switch representation, select specialist strategy | Cannot reach into a specialist's taxonomy to mutate it |
| curriculum-agent | May propose better curriculum mapping / reorganize topic hierarchy / change progression model | Cannot override official curriculum source-of-truth; cannot auto-promote inferred→confirmed |
| math-specialist | Was missing `cannot` block entirely (over-freedom risk).  Now has: may freely decide strategy / representation / new error codes / new hint levels / new lesson structure | Cannot directly write mastery; cannot override other subject's taxonomy; cannot use cloud STT/OCR |
| chinese-specialist | Same as math | Cannot directly write mastery; cannot override other subject's taxonomy |
| english-specialist | Same as math | Cannot directly write mastery; cannot override other subject's taxonomy; cannot use cloud STT/TTS |
| science-specialist | Same as math | Cannot directly write mastery; cannot override other subject's taxonomy |
| social-studies-specialist | Same as math | Cannot directly write mastery; cannot override other subject's taxonomy |
| question-bank-curator | May redesign coverage strategy / generation mix / question-type distribution | Cannot bypass Verified Bank gate; cannot bypass license/provenance rules |
| question-quality-agent | May adjust quality heuristics / add subject-specific verification / add new dimensions | Cannot bypass single-writer invariant; cannot bypass license/provenance rules |
| assessment-agent | May propose new assessment interpretation / better evidence aggregation | Cannot directly override mastery engine; cannot modify raw learning_event streams |
| learning-memory-agent | May reorganize memory structure / propose better long-term summaries | Cannot modify raw production records (append-only / raw data preservation are Hard Invariants) |
| parent-report-agent | May freely design communication structure / decide summary format | Cannot expose unnecessary child data; cannot modify mastery |

### `policies.yaml` changes
- `skills_policy.visual_theme_hook` status: `deferred_to_web_v2_and_child_learning_experience_designer` → `owned_by_child_learning_experience_designer` (shipped 2026-08-28).
- Removed forbid: `"Subject specialists MUST NOT propose color/typography changes"`.  Specialists may now propose when a teaching need motivates; designer integrates with accessibility guardrails.

### What was NOT touched (Hard Invariants preserved)
- `AGENTS.md` / `SOUL.md` / `USER.md` / `IDENTITY.md` MD5 UNCHANGED.
- All `data/learning-records/*.jsonl` and `data/mastery-evidence/*.jsonl` UNCHANGED.
- Verified Bank single-writer invariant PRESERVED (only `question_quality_agent_verify` writes).
- License / provenance / commercial-use rules PRESERVED.
- Cloud STT / OCR / TTS / child-data external transfer rules PRESERVED.
- All production student IDs (`student_001` / `student_002`) REFUSAL rule in adapter PRESERVED.
- WCAG AA, keyboard reachability, ≥44px touch target, color-vision-safe variant PRESERVED.

### Runtime code impact
- **NONE.**  This refactor is registry-only.  No runtime files modified.
- Future runtime changes will be proposed by each agent under its new
  `professional_autonomy` block, reviewed by orchestrator against Hard Invariants.

### Snapshot
- `architecture/_backups/20260828T165128Z_agent_autonomy_refactor/` (agents.yaml + policies.yaml + capability-matrix.md + changelog.md pre-edit snapshots)

