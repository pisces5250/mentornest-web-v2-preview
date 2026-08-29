# MentorNest Skill Gap Analysis

Status: Phase 1 — System foundation (active)
Owner: system-orchestrator
Method: Cross-reference of Project Registry (capabilities.yaml, agents.yaml, skills-registry.yaml, policies.yaml) against live installed skills, plugins, models, and data. No production changes. No skill installs.

## 1. Priority framework

Each gap is scored on:
- **Impact** — how many downstream agents/children benefit
- **Risk if absent** — silent wrong answers, fabricated mastery, child-data exposure, parent misreport
- **Buildability** — buy (existing skill) vs build (custom)

Priority buckets:
- **Critical** — blocks Phase 2 or causes silent correctness/privacy failure
- **High** — blocks a roadmap phase or specialist completion
- **Medium** — feature gap, not a correctness gap
- **Low** — nice-to-have

## 2. Critical gaps

### C1. Learning Director — no implementation
**Registry:** `agents.yaml: learning-director`, `capabilities.yaml: learning_director (missing · critical)`
**Reality:** zero files dedicated to this role; no readers over the learning_event stream exist.
**Why critical:** Parent-report-agent and assessment-agent both consume director output. Without it, the system has no longitudinal analysis at all — every "weekly report" would be a hand-waving LLM summary.
**Buy or build:** **Build**. This is a private learning-history analysis layer; no off-the-shelf skill will respect MentorNest's data model (`student_id` isolation, `confirmed_vs_inferred`, no sibling comparison).
**Sub-capabilities needed:**
- learning_event stream reader (per student)
- cross-subject weakness aggregator
- prerequisite-gap detector
- weekly strategy emitter

### C2. Curriculum Agent + Taiwan curriculum mapping — no implementation
**Registry:** `capabilities.yaml: curriculum_tracking (missing · critical), taiwan_curriculum_mapping (missing · high)`
**Reality:** student profiles have empty `publisher` and `current_unit` for every subject for both students. No curriculum source-of-truth.
**Why critical:** Without it, "school alignment" is fiction — the system cannot honestly distinguish a child's confirmed classroom progress from generic practice.
**Buy or build:** **Build (data + thin agent)**. There is no suitable existing skill (Taiwan-specific curriculum is not generic). Build a structured curriculum map (grade × publisher × unit × knowledge_points) plus a textbook-mapping utility. This must be authored from primary sources (教育部 / 各版本課綱) by a human curator — the agent must not invent curriculum facts.
**Policy note:** touches `policies.yaml` indirectly via the `confirmed_progress` vs `inferred_progress` separation — that separation must be enforced.

### C3. Deterministic math validator — no implementation
**Registry:** `agents.yaml: math-specialist.required_capabilities.deterministic_math_validator`, `capabilities.yaml: deterministic_math_validation (missing · critical)`
**Reality:** `generate_practice_set` returns questions; nothing verifies student answers symbolically. `classify_math_error` exists but is classification-only.
**Why critical:** Without deterministic validation, "correct/incorrect" on math answers is a free-text LLM judgement — exactly the failure mode `core_principles` forbids ("LLMs diagnose and teach; they should not invent objective mastery evidence").
**Buy or build:** **Build**. Options:
- SymPy-backed equivalence checker (fractions, expressions, equations) — pure Python, child-data safe.
- nlesolver-style numeric checker for word problems.
- Bar-model validator (structural check against expected diagram).
**Implementation path:** new internal tool `math_validate_answer({question, student_answer, expected, question_type})` exposed via the `mentornest-learning` plugin. Low risk: pure function, no external calls.

### C4. Question Bank (3-layer) — no implementation
**Registry:** `capabilities.yaml: question_bank (missing · critical)`, `data-model.yaml: question_bank.layers`, `policies.yaml: question_bank_policy`
**Reality:** `raw_question_pool`, `verified_question_bank`, `personalized_practice_pool` are declared but empty. `generate_practice_set` ships pre-baked questions, not bank-driven.
**Why critical:** Every subject specialist that wants non-trivial practice needs this. The current `generate_practice_set` cannot answer: "give me 3 grade-5 fractions questions at difficulty 0.4 from 康軒 ch.3 that student_001 has not seen".
**Buy or build:** **Build**. No external skill is going to ingest Taiwan publisher PDFs and respect the licensing model in `policies.yaml`. Adjacent but **not sufficient**: `adaptivetest` (third-party, cloud, child-data conflict — see §6).
**Sub-capabilities:**
- raw question pool store (immutable, provenance metadata mandatory)
- curator agent (see C5)
- quality agent (see C6)
- verified bank API
- personalized selector (consumed by `generate_practice_set`)

### C5. Question Bank Curator — no implementation
**Registry:** `agents.yaml: question-bank-curator`, `skills-registry.yaml: needs_future_search.question-bank-curator.*`
**Sub-capabilities:** question parser, segmentation, metadata extraction, knowledge_point classifier, source/license extractor, deduplication.
**Buy or build:** **Build** the curator. **Consider buying** a generic OCR/PDF extraction primitive, but **must vet for child-image upload** (cf. `policies.yaml: do_not_install_without_review`). Candidates to evaluate in sandbox later:
- local PDF text extraction (pdftotext / pdfminer)
- vision OCR kept strictly local (the registry's `do_not_use_for_current_goal` already excludes paddleocr-cloud and pix2tex-non-commercial — keep that line).

### C6. Question Quality Agent — no implementation
**Registry:** `agents.yaml: question-quality-agent`, `capabilities.yaml: question_quality (missing · critical), question_license_tracking (missing · high)`
**Sub-capabilities:** deterministic answer verification, uniqueness check, difficulty review, missing-asset detection, license review.
**Buy or build:** Mostly **build**, except deterministic verification which depends on C3. License review is a human-in-the-loop checklist — agent produces a draft, human approves.

### C7. Parent Weekly Report — no implementation
**Registry:** `capabilities.yaml: parent_weekly_report (missing · critical)`, `agents.yaml: parent-report-agent`
**Reality:** parent-report-agent has no reader over learning_events and no aggregation logic.
**Why critical:** This is the parent-facing value surface of MentorNest. A bad report (sibling comparison, fabricated confidence, alarmist wording) directly violates `core_principles`.
**Buy or build:** **Build**. The output is governed by AGENTS.md / SOUL.md tone rules — no off-the-shelf summary skill will respect them. Must consume C1's strategy output and C3's verified mastery.

## 3. High-priority gaps

### H1. Subject visual primitives (math)
fraction_bar, number_line, bar_model, safe_math_renderer.
**Status:** ◐ partial (only `diagram-maker` general SVG/HTML exists).
**Buy or build:** **Build** the math-specific primitives. Do **not** try to make `diagram-maker` do it — it has no notion of equality, length, or partitions.
**Path:** dedicated math-visual-engine skill (single-responsibility, deterministic render). Reusable by `mentornest-web` v2.

### H2. Hint Ladder engine
**Registry:** `project.yaml: shared_engines`, `agents.yaml: math-specialist.responsibilities.hint_ladder`.
**Status:** declared but not implemented. Today hints come from the LLM.
**Why high:** Without a deterministic hint ladder, two children with identical errors get different scaffolds; review will be unfair.
**Buy or build:** **Build**. Ladder levels should be a function of `error_type` × `attempts` × `representation_used`. Pure-function design — easy to test.

### H3. Server-side Mastery Engine
**Registry:** `capabilities.yaml: mastery_engine (partial)`, `data-model.yaml: mastery.*`
**Reality:** `adaptive-learning` ships FSRS *flashcard-app* scheduling, not a persistent mastery store keyed by student × knowledge_point × subskill with `confidence`, `review_due`, `school_alignment`, `error_patterns`.
**Buy or build:** **Build the canonical store**, **adopt FSRS as the scheduler**. Don't ship a parallel mastery model.

### H4. Subject specialists beyond math
chinese / english / science / social-studies specialists have only the shared profile + memory tools. No subject-specific tool, no subject-specific skill stack.
**Buy or build:** Mostly **build** (subject pedagogy is the moat). Reuse `knowledge-digest` for textbook→quiz, but every specialist needs a thin own skill:
- chinese: 讀理解診斷, 修辭回饋, 作文鷹架
- english: 發音評量 (see M1), 文法錯誤分類
- science: 變因控制 reasoning, 圖表閱讀
- social-studies: 時間軸 / 地圖互動畫布

### H5. System orchestration tooling gaps
**Registry:** `capabilities.yaml: system_orchestration.missing`: service_registry_enforcement, automated_change_plan, regression_harness, rollback_manager, deployment_adapter.
**Why high:** without a regression harness, every orchestrator edit is a leap of faith; without rollback, level-3 changes become one-way. Phase 1 explicitly lists `agent_capability_matrix` and `skill_gap_analysis` as goals — this document satisfies both — but the harness/rollback pieces must land before the first level-3 production change.

### H6. Question license tracking
**Registry:** `capabilities.yaml: question_license_tracking (missing · high)`, `policies.yaml: question_bank_policy.commercial_system_requires`
**Buy or build:** **Build** — too tied to Taiwan publisher licensing to buy. Output: `source_license`, `commercial_use_allowed`, `attribution_required` flags on every question, enforced by `question-quality-agent`.

## 4. Medium-priority gaps

### M1. Local TTS + pronunciation assessment
**Registry:** `capabilities.yaml: tts (missing · medium), pronunciation_assessment (missing · medium)`, `agents.yaml: english-specialist.preferred_tools.future_tts`.
**Reality:** bundled gateway skill `sherpa-onnx-tts` is available — local-only. Pronunciation assessment has no candidate yet.
**Buy or build:** **Buy TTS** (`sherpa-onnx-tts` is local and child-safe; sandbox test, then enable behind a MentorNest wrapper). **Build pronunciation assessment** later — start with phoneme-confidence from SenseVoice (already produces emotion/event tags) and grow from there. Phoneme-level scoring is research-grade and can wait until english-specialist's other gaps are closed.

### M2. Geometry / measurement / data-handling primitives
For math and science. Required for elementary-grade units where ruler/protractor/shape-manipulation matter.

### M3. Math visual teaching: ratio/proportion, decimal, percentage, area/perimeter
Each is a content-pack on top of H1.

### M4. Handwriting canvas (deferred)
**Registry:** `capabilities.yaml: handwriting_math (future)`. No action this phase.

### M5. Service-registry enforcement
Read `services.yaml` before every level-3+ change and refuse on mismatch. Tooling-only, no child impact.

## 5. Low-priority / future

- MentorNest Web v2 (`capabilities.yaml: web_v2.partial`) — driven by Phase 5 roadmap.
- realtime voice, vision math input — Phase 6.
- `memory-wiki`, `memory-core` (bundled OpenClaw plugins) — currently disabled; not a MentorNest gap, an OpenClaw runtime choice.

## 6. Skill acquisition decisions

### Already adequate, no change
| Skill | Status | Use |
|---|---|---|
| mentornest-tutor | ready | tutoring workflow backbone |
| Homework / Learning / Studying / Flashcards | ready | general pedagogy primitives |
| study-buddy | ready | text → quiz pipeline |
| adaptive-learning | ready | FSRS scheduler (refactor target, not replace) |
| knowledge-digest | ready | textbook → quiz/slides/mindmap |
| mentornest-stt | ready | kid-safe local STT |
| diagram-maker | ready | generic diagrams |
| skill-finder, skill-vetter | ready | orchestrator meta-tools |
| self-evolving-skills | ready | convert recurring wins into skills |
| self-improving-agent / self-improvement | ready | capture errors and corrections |

### Candidates to evaluate later (sandbox only, do not install now)
| Candidate | Why interesting | Why risky |
|---|---|---|
| sherpa-onnx-tts (bundled) | local TTS, closes M1 | needs sandbox test for child-voice safety before wiring |
| spike (bundled) | throwaway prototypes for C3/C4 | none — pure orchestrator tool |
| skill-creator (bundled) | standardized SKILL.md authoring | none |
| taskflow (bundled) | durable multi-step jobs | none |

### Do **not** wire without explicit vetting
| Skill | Reason |
|---|---|
| adaptivetest (3rd party, installed) | requires `ADAPTIVETEST_API_KEY`; calls external API at `adaptivetest-platform-production.up.railway.app`. Per `policies.yaml`, child-data-upload paths require explicit approval. Currently no registry entry and no vetting record. Treat as untrusted. |
| any cloud STT | `policies.yaml: audio.cloud_fallback: forbidden` |
| chinese-handwriting-ocr / aidenwu0209-paddleocr-skills / pix2tex-production | already excluded by `skills-registry.yaml: known_do_not_use_for_current_goal` |

## 7. Build vs buy, by capability

| Capability | Decision | Rationale |
|---|---|---|
| Deterministic math validator | **Build** | Private correctness invariant; SymPy + thin wrapper |
| Mastery engine (persistence + scheduling) | **Build store + adopt FSRS** | Reuse `adaptive-learning` scheduler but own the store |
| Hint ladder | **Build** | Pure function over error_type × attempts |
| Math visual primitives | **Build** | Domain-specific; `diagram-maker` too generic |
| Curriculum map | **Build (data) + thin agent** | No off-the-shelf Taiwan-grade map |
| Question bank 3 layers | **Build** | Licensing + provenance require MentorNest ownership |
| Local TTS | **Buy (`sherpa-onnx-tts`)** | Local-only, child-safe |
| Pronunciation assessment | **Build (lightweight) later** | No suitable existing skill |
| Generic PDF / text extraction | **Build (local pdftotext/pdfminer)** | Privacy; do not send to cloud OCR |
| Adaptive test engine | **Build (own)**, do not adopt `adaptivetest` | External API + child-data conflict |
| Self-evolution meta-loop | **Adopt (`self-evolving-skills`)** | Already installed; align output with registry updates |
| System regression harness | **Build** | Mandatory before level-3 changes |

## 8. Recommended next implementation phase

Phase 1 is essentially complete: the registry exists, this matrix and gap analysis exist, the orchestrator skill is loaded.

**Recommended Phase 2 entry — Learning Intelligence, in this order:**

1. **Learning-event reader service (C1-a).** Pure-function reader over `data/learning-records/*.jsonl` that emits structured per-student summaries. This is the foundation that C1, C7, H3 all depend on. Lowest risk, highest reuse. Lives in the `mentornest-learning` plugin as new tools, no schema migration.
2. **Deterministic math validator (C3).** New internal tool behind a clear interface. Even before any other Phase 2 work, this immediately hardens the correctness of the existing `generate_practice_set` and `classify_math_error` flows. Required before mastery numbers can be trusted.
3. **Mastery store (H3-a).** New table/file keyed by `student_id × knowledge_point × subskill`, fed by `learning_record_append` and the new validator. Use FSRS as the scheduler; persist the rest ourselves.
4. **Hint-ladder engine (H2).** Pure function. Plugs directly into `math-specialist` and (later) other specialists.
5. **Curriculum-agent skeleton (C2-a).** Data shape only — load Taiwan grade/subject/knowledge_point taxonomy from a curated YAML. Empty at first, but unblocks every later curriculum-aware feature.

Items 1–4 close the loop from "child answers a question" to "we know what they have mastered" without any new child-facing surface and without any external service. Item 5 is the bridge to Phase 3 (subject specialists) and Phase 4 (question bank).

**Defer:**
- Parent weekly report (C7) until mastery store has ≥ 2 weeks of data per active student.
- Local TTS (M1) until english-specialist work actually begins; today sherpa-onnx-tts should be sandboxed but not promoted.
- All Phase 5/6 items.

## 9. Decisions still owed by the human

These are the items this analysis cannot decide alone; they require human authority per `policies.yaml`:

> Status as of 2026-08-27 (see changelog). Items 1, 2, 3, 4 are now resolved.
> Items remaining: 6 and 7.

1. ~~**Curriculum source authority.**~~ — **Resolved**: Taiwan 教育部 official curriculum documents are the only source-of-truth; publishers map into the curriculum, never into the bank. See `architecture/curriculum-source-policy.md`.
2. ~~**Question licensing posture.**~~ — **Resolved**: V1 shared bank accepts only (a) parent-private upload, (b) teacher/parent-authored, (c) clear open-license, (d) MentorNest AI-original or AI-adapted. Commercial publisher content must NOT be accumulated into a shared commercial bank. See `architecture/question-bank-source-policy.md`.
3. ~~**Student identity beyond nickname.**~~ — **Resolved**: `school_name` and `class_name` are explicitly OPTIONAL and never requested by default. Profile v2 schema adds the requested fields without requiring them; AGENTS.md / SOUL.md untouched.
4. ~~**adaptivetest verdict.**~~ — **Resolved (archived)**: directory moved to `workspace/_archive/skills/adaptivetest-skill/`; registry § `archived` records canonical name, slug, original location, archive location, archived-on date, and re-promotion gate (skill-vetter pass + level-4 approval).
5. ~~**Promotion of `student-profile` skill and `adaptivetest` into `skills-registry.yaml`.**~~ — **Resolved**: `student-profile` added as `shared_ready` (workflow-only). `adaptivetest` recorded under § `archived`.
6. **First curriculum map scope.** With Taiwan 12-year curriculum as source-of-truth, do we ship V1 with elementary-only (G1–G6) and defer junior-high (G7–G9), or ship all 12 grades at once? Elementary-only is far less authoring work and matches current active students.
7. **First question-bank source priority.** Among the four accepted V1 sources (parent-private, teacher/parent-authored, open-license, MentorNest AI), which do we prioritize ingesting in Phase 4? AI-generated has the lowest licensing risk but highest quality-agent workload; open-license has the lowest workload but requires curation.
