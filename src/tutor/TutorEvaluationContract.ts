// src/tutor/TutorEvaluationContract.ts
//
// Phase 6A — Shared tutor evaluation contract.
//
// Common envelope for tutor decisions across subjects. Phase 6A only
// ships the English read-aloud evaluator, but the shape is intentionally
// subject-agnostic so future Math / Chinese / Science / Social Studies
// specialists can produce the same envelope.
//
// Front-end and back-end both import from this file. The contract
// describes what a child should see (one overall judgement + a short
// summary + up to N teaching points), not how a specialist arrives at
// the answer.
//
// Hard rules (enforced by reviewers; not by code):
//   1. Specialists MUST NOT issue a verdict harsher than "close" when
//      the underlying transcript or response signal is unreliable.
//      They should flag retry_recommended and let the child try again.
//   2. teaching_points is intentionally bounded (≤ 3). Anything more
//      overwhelms a child.
//   3. confidence is the specialist's own self-reported reliability in
//      [0, 1]; it MUST drop below 0.5 when the source signal (e.g. STT
//      transcript) is noisy. Front-end UI uses confidence to choose
//      between "show feedback" and "ask the child to try again".
//   4. summary is one short, child-friendly Traditional Chinese
//      sentence — no jargon, no system wording.

export type TutorOverallResult =
  | "good"          // everything matches; well done
  | "close"         // most of it matches; a small slip
  | "needs_work"    // several misses; retry is recommended
  | "unclear";      // signal is too noisy to make a fair call

/**
 * A single concrete teaching point. Designed to be rendered as a
 * one-line card with an optional example.
 */
export interface TutorTeachingPoint {
  /** Stable id, e.g. "EN-READ-OMIT-sun". */
  code: string;
  /** Short label, e.g. "漏字". */
  label: string;
  /** One-sentence explanation in Traditional Chinese (zh-TW). */
  explanation: string;
  /** Optional concrete example, e.g. '"...I see the ___ ..."'. */
  example?: string;
}

/**
 * A specific word the child omitted, added, or substituted.
 * `position` is 0-based index in the normalised expected text token
 * list, used by UI for highlighting (future use).
 */
export interface TutorWordDiff {
  /** Word in the expected text. */
  expected: string;
  /** What the child said instead (null = omitted). */
  actual: string | null;
  /** 0-based expected-token index. */
  position: number;
}

/**
 * Common envelope returned by any subject specialist when evaluating
 * one child response.
 */
export interface TutorEvaluation {
  overall_result: TutorOverallResult;
  /** Child-friendly one-sentence summary (zh-TW). */
  summary: string;
  /** Words present in expected but missing from transcript. */
  omitted_words: TutorWordDiff[];
  /** Words in transcript not present in expected. */
  extra_words: TutorWordDiff[];
  /** Words that were substituted (matched by alignment). */
  substituted_words: TutorWordDiff[];
  /** Up to 3 most actionable teaching points. */
  teaching_points: TutorTeachingPoint[];
  /** Whether the child should re-attempt this same prompt. */
  retry_recommended: boolean;
  /** Specialist's self-reported confidence in [0, 1]. */
  confidence: number;
  /** ISO timestamp of when the specialist produced the eval. */
  evaluated_at: string;
}

/**
 * Input handed to a specialist. `reading_comparison` is the
 * deterministic layer-A output; the specialist can use it but is not
 * forced to. `transcript_confidence` is the STT pipeline's reported
 * confidence in [0, 1].
 */
export interface TutorEvaluationRequest {
  student_id: string;
  knowledge_point: string;
  age_band: "G1-G2" | "G3-G4" | "G5-G6" | "G7+";
  /** The reading passage or sentence the child was supposed to read. */
  expected_text: string;
  /** Child's STT transcript (already child-confirmed if applicable). */
  transcript: string;
  /** Optional STT pipeline confidence. Null = unknown. */
  transcript_confidence: number | null;
  /** Layer-A deterministic comparison result (canonical form). */
  reading_comparison: ReadingComparison;
}

/**
 * Deterministic reading-comparison result (Layer A). Subject-agnostic
 * and reproducible. Both the front-end `readingComparison` and the
 * server-side `lib/reading-comparison` produce this exact shape.
 */
export interface ReadingComparison {
  /** Normalised expected tokens (lowercase, punctuation stripped). */
  expected_tokens: string[];
  /** Normalised transcript tokens. */
  transcript_tokens: string[];
  /** Levenshtein-style edit distance between the two token lists. */
  edit_distance: number;
  /** coverage = 1 - edit_distance / max(len(expected), len(transcript)).
   *  In [0, 1]. Higher = closer match. */
  coverage: number;
  /** Words present in expected but missing from transcript. */
  omitted: TutorWordDiff[];
  /** Words in transcript not present in expected. */
  extra: TutorWordDiff[];
  /** Aligned substitutions. */
  substituted: TutorWordDiff[];
  /** Heuristic reliability in [0, 1]. Drops when STT confidence is low
   *  or transcript is far from expected length. */
  reliability: number;
  /** Normalisation strategy applied to both sides. */
  normalisation: {
    lowercase: boolean;
    collapse_whitespace: boolean;
    strip_punctuation: boolean;
    expand_contractions: boolean;
  };
}

/**
 * Outward-facing API error envelope for the tutor endpoint.
 * Front-end uses the `code` to decide retry vs. fail-fast.
 */
export interface TutorEvaluationError {
  ok: false;
  code:
    | "transcript_required"
    | "expected_required"
    | "student_required"
    | "specialist_unavailable"
    | "invalid_payload"
    | "timeout"
    | "unknown";
  /** Child-facing Traditional Chinese message. */
  message: string;
  retry_after_seconds?: number;
}

export interface TutorEvaluationResponse {
  ok: true;
  evaluation: TutorEvaluation;
}

/**
 * Type guard.
 */
export function isTutorEvaluationResponse(
  x: unknown,
): x is TutorEvaluationResponse {
  return (
    !!x &&
    typeof x === "object" &&
    (x as any).ok === true &&
    typeof (x as any).evaluation === "object"
  );
}

export function isTutorEvaluationError(
  x: unknown,
): x is TutorEvaluationError {
  return (
    !!x &&
    typeof x === "object" &&
    (x as any).ok === false &&
    typeof (x as any).code === "string"
  );
}

/** Helper: clamp confidence to [0, 1]. */
export function clampConfidence(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/** Helper: cap teaching_points to the contract maximum (≤ 3). */
export function capTeachingPoints<T extends TutorTeachingPoint>(
  points: T[],
): T[] {
  return points.slice(0, 3);
}

// ============================================================================
// Phase 6B — Conversational English Tutor (no verdict pop-up; tutor turn-taking)
//
// Difference from Phase 6A:
//   Phase 6A: child records + submits; specialist returns verdict + teaching
//             points; UI renders card.
//   Phase 6B: child presses "start"; tutor holds a real-time listening turn
//             via VAD; each silence boundary POSTs transcript to server;
//             server-side specialist decides the NEXT utterance the tutor
//             should SAY (acknowledge / ask_question / model_phrase /
//             correct_gently / extend / wrap_up).  No verdict card.
//
// Hard rules (defensive; enforced in conversation-manager.mjs + reviewed):
//   1. Per-session in-memory ring buffer, depth = 5 turns. Older turns are
//      evicted; transcript is NEVER persisted.
//   2. End-of-session summary is the ONLY thing written to the learning
//      record ledger; no per-turn transcript / audio / decision is written.
//   3. Wrap-up is opt-in via specialist decide; the child (not the system)
//      ends the session.
// ============================================================================

export type TutorTurnAction =
  | "acknowledge"      // short praise / encouragement
  | "ask_question"     // keep the conversation going
  | "model_phrase"     // show the child a correct exemplar
  | "correct_gently"   // soft correction + repeat target
  | "extend"           // push for more / deeper answer
  | "wrap_up";         // close the conversation (specialist-initiated)

/** Prompt spec surfaced in the UI (mostly for ask_question / extend). */
export interface TutorPromptSpec {
  /** Optional prompt text shown to the child on screen (zh-TW). */
  text?: string;
  /** Optional exemplar (e.g. for model_phrase / correct_gently). */
  exemplar?: string;
}

/** Decision produced by the English Specialist per turn. */
export interface TutorTurnDecision {
  action: TutorTurnAction;
  /** What the tutor says out loud (TTS text, zh-TW for G5 child). */
  utterance: string;
  /** Optional prompt / exemplar / correction target. */
  prompt?: TutorPromptSpec;
  /** Sub-skill the specialist is targeting (e.g. "vocab", "fluency"). */
  subskill: string;
  /** Specialist's own rationale (audit only). */
  rationale: string;
  /** Confidence in [0, 1]. Front-end may use it to soften UI. */
  confidence: number;
}

/** What the server returns for a turn request. */
export interface ConversationTurnResponse {
  ok: true;
  decision: TutorTurnDecision;
  /** Plain text for TTS (zh-TW). */
  tts_text: string;
  /** Optional pre-synthesised audio URL (TTS cache hit). */
  audio_url?: string;
  /** Echoed back for client-side state tracking. */
  turn_index: number;
  /** Echoed back so the client can confirm sync. */
  session_id: string;
}

/** Per-session state echoed back on every response. */
export interface ConversationSessionInfo {
  session_id: string;
  /** 0-based turn index. */
  turn_index: number;
  /** True once specialist decided "wrap_up" or child ended. */
  ended: boolean;
}

/** Start request/response. */
export interface ConversationStartRequest {
  student_id: string;
  knowledge_point: string;            // e.g. "english.G5.CONV.free-conversation"
  age_band: "G1-G2" | "G3-G4" | "G5-G6" | "G7+";
  /** Optional topic hint, e.g. "about my day" — passed to specialist. */
  topic?: string;
  /** Locale for STT (en-US / en-GB …). */
  locale?: "en-US" | "en-GB" | "en-AU" | "en-CA";
}

export interface ConversationStartResponse {
  ok: true;
  session: ConversationSessionInfo;
  /** Tutor's opening greeting (zh-TW). */
  greeting: string;
  /** Pre-synthesised audio for the greeting (optional). */
  greeting_audio_url?: string;
}

/** Per-turn request. */
export interface ConversationTurnRequest {
  session_id: string;
  transcript: string;
  turn_index: number;
  /** Optional STT confidence reported by the client. */
  transcript_confidence?: number | null;
}

/** End-of-session request/response. */
export interface ConversationEndRequest {
  session_id: string;
  /** Optional reason: child pressed end, or specialist wrap_up. */
  reason?: "child_ended" | "specialist_wrap_up";
}

export interface ConversationEndResponse {
  ok: true;
  session: ConversationSessionInfo;
  /** Summary written to the learning record (audit copy). */
  summary: ConversationSessionSummary;
}

/** Session-end observation submitted to the authoritative Learning Memory writer. */
export interface ConversationSessionSummary {
  student_id_hash: string;            // FNV-1a, 8 hex chars
  knowledge_point: string;
  session_duration_sec: number;
  turn_count: number;
  /** Sequence of specialist actions (e.g. ["acknowledge","ask_question"]). */
  specialist_actions: TutorTurnAction[];
  /** Aggregate dominant error code, or null. */
  dominant_error_code: string | null;
  /** Short summary text for parent / curriculum review. */
  summary: string;
}

/** Type guards for the conversational endpoints. */
export function isConversationStartResponse(
  x: unknown,
): x is ConversationStartResponse {
  return (
    !!x &&
    typeof x === "object" &&
    (x as any).ok === true &&
    typeof (x as any).session === "object" &&
    typeof (x as any).greeting === "string"
  );
}

export function isConversationTurnResponse(
  x: unknown,
): x is ConversationTurnResponse {
  return (
    !!x &&
    typeof x === "object" &&
    (x as any).ok === true &&
    typeof (x as any).decision === "object" &&
    typeof (x as any).tts_text === "string"
  );
}

export function isConversationEndResponse(
  x: unknown,
): x is ConversationEndResponse {
  return (
    !!x &&
    typeof x === "object" &&
    (x as any).ok === true &&
    typeof (x as any).summary === "object"
  );
}
