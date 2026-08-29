# Curriculum Source Policy

Owner: system-orchestrator
Status: Adopted 2026-08-27
Scope: All MentorNest curriculum-related artifacts (curriculum map, school_progress tracking, textbook mapping, question bank grounding).

## 1. Source-of-truth hierarchy

For any claim about "what a grade X student in Taiwan should know":

1. **Taiwan official curriculum documents** (教育部 十二年國民基本教育課程綱要 / 各領域綱要 / 議題融編). Authoritative.
2. **MentorNest internal mapping table** (curriculum map YAML). Translates (1) into our knowledge_point taxonomy. Authored by humans, reviewed by an internal educator. Not authoritative on its own — must always cite the upstream curriculum document.
3. **Publisher textbook tables of contents** (康軒 / 南一 / 翰林 / etc.). Used ONLY for mapping reference (publisher edition → grade × semester × unit → which curriculum knowledge_points it covers). Publisher content is never copied into a shared MentorNest question bank.
4. **Teacher / parent / student reported progress**. Confirmed progress only when the reporter is the parent or teacher (or a verified test). Inferred progress otherwise. Always tagged with `confirmed_vs_inferred_progress_tracker`.

Tier 1 and 2 are mandatory. Tier 3 is mapping only. Tier 4 is the user-side signal that flows through `learning-memory-agent`.

## 2. What counts as "official curriculum"

A document is acceptable as Tier 1 if it is published by:

- 教育部 (Ministry of Education)
- 國家教育研究院 (NAER)
- 各直轄市 / 縣市政府教育局 (only when explicitly aligned to the central curriculum)

Anything else — including private tutoring chains, AI-generated curricula, or overseas curricula — must be tagged with `source = "non-official"` and NEVER used as a primary source for `school_progress.confirmed_progress`.

## 3. Knowledge-point taxonomy rules

- Every knowledge_point has a stable id (e.g. `math.G5.FRAC.add-unlike-denom`).
- Each knowledge_point must cite which curriculum document and section it is grounded in.
- Curriculum map YAML files live under `architecture/curriculum/` (Phase 2 deliverable).
- Schema is versioned; never rewrite a YAML in place. Add a new versioned file and update the index.

## 4. Publisher mapping rules

A `textbook_version` mapping is acceptable if and only if:

- The publisher is named explicitly.
- The edition and volume are recorded (no ambiguity).
- Each mapped knowledge_point is grounded in Tier 1.
- The mapping file is stored under `architecture/textbook-mappings/<publisher>/<edition>/<volume>.yaml`.
- The mapping file does NOT contain any verbatim publisher content (no question text, no passages, no images from the book).

## 5. Question-bank interaction

The curriculum map and publisher mappings exist to:

- Tag questions in the question bank with the right `knowledge_points` and `school_alignment`.
- Provide `school_progress` baselines for the parent-report-agent.
- Drive `generate_practice_set` selectors.

They must NOT exist to legitimize copying publisher content. The question bank has its own source policy in `architecture/question-bank-source-policy.md`, and Tier 3 (publisher content) is explicitly excluded from the shared verified bank.

## 6. What curriculum-agent must not do

- Invent curriculum facts. If a knowledge_point is not grounded in Tier 1, it is `unverified`.
- Infer `confirmed_progress` from learning_event stream alone — that produces `inferred_progress` only.
- Compare siblings or cohorts. Per `policies.yaml: child_privacy.student_data.sibling_comparison: forbidden`.
- Promote publisher content into the question bank.

## 7. Phase 2 deliverable

Curriculum map v0: elementary only (G1–G6, five core subjects), Tier 1 only, no Tier 3 mappings yet. Loaded as `architecture/curriculum/tw-12yrc-g1-g6-v0.yaml`. Subject to human-curator authoring; the orchestrator will not auto-populate it.

## 8. Decisions still owed (cross-ref)

- Junior-high (G7–G9) coverage scope — see `skill-gap-analysis.md § 9 item 6`.
