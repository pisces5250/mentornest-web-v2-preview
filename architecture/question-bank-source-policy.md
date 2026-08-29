# Question Bank Source / License Policy

Owner: system-orchestrator
Status: Adopted 2026-08-27
Scope: All question ingestion paths feeding `raw_question_pool` → `verified_question_bank` → `personalized_practice_pool`.

## 1. Allowed sources for the SHARED verified bank (V1)

A question may enter the shared `verified_question_bank` only if it originates from one of the following:

### 1.1 Parent-private upload
- Uploaded by a verified MentorNest parent into their own family scope.
- Stays in the per-family practice pool by default.
- Becomes "shared" only if the parent explicitly toggles sharing with the MentorNest community AND the question passes `question-quality-agent`.
- Storage: per-family raw_question_pool; never copied into a shared bank without explicit opt-in.

### 1.2 Teacher / parent-authored
- Authored by a verified teacher or parent with declared authorship.
- Author identity is hashed before storage (no raw PII in the bank).
- Subject to license declaration (`CC-BY-4.0`, `CC-BY-SA-4.0`, `CC0`, or `MentorNest-Internal-Use-Only`).
- Default license for parent/teacher contributions is `MentorNest-Internal-Use-Only`.

### 1.3 Clear open-license
- Source documents with explicit open license (CC-BY, CC-BY-SA, CC0, public domain).
- License text must be archived alongside the question (URL + snapshot hash).
- Attribution must be preserved if required by the license.
- Curated by `question-bank-curator`; quality-checked by `question-quality-agent`.

### 1.4 MentorNest AI original / adapted
- Generated or rewritten by MentorNest agents.
- AI-original questions: license = `MentorNest-Internal-Use-Only`.
- AI-adapted questions: source must be one of 1.1, 1.2, 1.3, or 1.4; `ai_rewrite_integrity` field records `none | partial | full`.
- AI-adapted from a non-allowed source is forbidden — see § 2.

## 2. Forbidden sources

The shared verified bank MUST NOT accept:

- Commercial publisher content (textbooks, workbooks, exam papers, mock-test books).
- Content from cloud-only / locked / paywalled repositories.
- Content scraped from any site whose terms forbid redistribution.
- Any content whose `source_license` is unknown, ambiguous, or non-commercial-only (unless the source itself is non-commercial).
- OCR'd reproductions of commercial content. Vision OCR kept local is acceptable as an *input tool*; its outputs are not promotable to the shared bank unless the underlying source is allowed by § 1.

If a question's source is uncertain, it goes to `raw_question_pool` with `verified = false` and is never served to a student until resolved.

## 3. Per-question metadata (mandatory)

Already in `data-model.yaml: question_bank.question.fields`. Adding one more field for V1:

- `source`: enum: `parent_upload | teacher_authored | open_license | ai_original | ai_adapted | unknown`
- `source_license`: free-form string (CC identifier, internal-use marker, etc.)
- `commercial_use_allowed`: bool — **default false in V1**
- `attribution_required`: bool
- `provenance_meta.ingested_by`: same enum as `source`
- `provenance_meta.original_author`: hashed parent/teacher id, or `ai`

## 4. Per-question quality gates (question-quality-agent)

Before promotion from `raw_question_pool` to `verified_question_bank`:

1. Source verification — `source_license` is one of the allowed values; commercial content rejected.
2. Answer verification — `answer` is correct; for math, the deterministic math validator is authoritative (see Phase 2 plan).
3. Uniqueness — semantic duplicate detection against the existing bank.
4. Difficulty calibration — at least N=10 empirical responses or a calibrated model estimate.
5. Missing assets — every referenced image / diagram / audio file exists.
6. License / commercial-use review — final human-readable verdict written to the question record.

A failed gate sends the question back to `raw_question_pool` with the failure reason; the question is never silently dropped.

## 5. Family practice pool vs shared bank

- Family practice pool: questions ingested by the family, used by that family, possibly with relaxed quality gates (parent may want to use them anyway). Still must respect § 1 (allowed sources) at ingest time.
- Shared verified bank: questions that pass § 4 and are marked shareable.

A question can move from family pool to shared bank only on explicit parent/teacher opt-in + quality gate pass.

## 6. Personalization (personalized_practice_pool)

- Built per `(student_id, knowledge_point, difficulty_band)` from the verified bank.
- Honors FSRS scheduling where applicable.
- Honors `school_alignment` from the curriculum map (Phase 2).
- Never references `raw_question_pool` directly — only verified + family-allowed sources reach a student.

## 7. Audit and retention

- Every question has an immutable `question_id` and a full provenance chain.
- Question records are append-only; corrections create a new question record with `supersedes` pointer.
- No question is silently deleted from the shared bank; retirement creates a tombstone with reason.
- Audit log lives under `architecture/audit/question-bank.md` (Phase 4 deliverable).

## 8. Cross-references

- `policies.yaml: question_bank_policy` — system-level rules this policy refines.
- `data-model.yaml: question_bank` — schema.
- `skill-gap-analysis.md § 3 C5` — curator agent.
- `skill-gap-analysis.md § 3 C6` — quality agent.
- `architecture/curriculum-source-policy.md` — knowledge_point grounding.

## 9. Decisions still owed (cross-ref)

- First-bank source priority — see `skill-gap-analysis.md § 9 item 7`.
