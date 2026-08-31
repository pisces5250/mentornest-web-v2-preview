import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const SAFE_ID = /^[a-z0-9_.-]{3,100}$/i;
const SUBJECTS = Object.freeze({
  math: { schema: "math-specialist-evidence-v1", prefix: "MATH-" },
  english: { schema: "english-specialist-evidence-v1", prefix: "EN-" },
  chinese: { schema: "chinese-specialist-evidence-v1", prefix: "ZH-" },
  science: { schema: "science-specialist-evidence-v1", prefix: "SCI-" },
  social_studies: { schema: "social-studies-specialist-evidence-v1", prefix: "SS-" },
});

/**
 * Staging-only Question Quality writer。
 * 此入口不對 HTTP 暴露，只能把 image 內的 synthetic fixture 經完整最小 gate 寫入隔離 Verified Bank。
 */
export async function verifyAndWriteStagingQuestion(question, config, {
  writeFile = fs.writeFile, readFile = fs.readFile, mkdir = fs.mkdir, realpath = fs.realpath,
} = {}) {
  if (config.environment !== "staging" || config.productionDataAllowed !== false) throw new Error("staging_only_writer");
  if (!question || question.verification_status !== "candidate") throw new Error("candidate_required");
  if (!SAFE_ID.test(question.id) || !question.id.startsWith("q.synthetic.")) throw new Error("synthetic_question_id_required");
  if (!SAFE_ID.test(question.subject) || !Number.isInteger(question.grade) || question.grade < 1 || question.grade > 12) throw new Error("invalid_question_target");
  if (!SAFE_ID.test(question.knowledge_point) || !SAFE_ID.test(question.answer_key_version)) throw new Error("invalid_question_identity");
  if (question.provenance?.source_class !== "AI_ORIGINAL" || question.provenance?.license !== "AI_ORIGINAL") throw new Error("staging_provenance_required");
  if (question.type === "multiple_choice") {
    if (!Array.isArray(question.choices) || question.choices.length < 2 || question.choices.length > 6) throw new Error("invalid_choices");
    if (!question.choices.includes(question.expected_answer)) throw new Error("answer_not_in_choices");
    if (new Set(question.choices.map(String)).size !== question.choices.length) throw new Error("duplicate_choices");
    validateSpecialistChoiceMetadata(question);
  } else if (question.type === "voice_response") {
    validateEnglishReadAloudMetadata(question);
  } else if (question.type === "english_conversation") {
    validateEnglishConversationMetadata(question);
  } else {
    throw new Error("unsupported_question_type");
  }
  const contentDigest = `sha256:${createHash("sha256").update(stableJson(question)).digest("hex")}`;
  const receiptId = `qqr_${contentDigest.slice(7, 31)}`;
  const verified = {
    ...question,
    verification_status: "verified",
    quality: {
      authority: "question_quality_agent_verify",
      receipt_id: receiptId,
      content_digest: contentDigest,
      gate_version: "staging-synthetic-v1",
      stages_passed: ["structure", "provenance", "answer-key",
        question.type === "multiple_choice" ? "choice-dedupe"
          : question.type === "voice_response" ? "voice-rubric" : "conversation-rubric",
        "subject-specialist", "staging-isolation"],
    },
  };
  const canonicalRoot = await realpath(config.dataRoot);
  const namespaceRoot = path.dirname(config.verifiedBankRoot);
  let canonicalNamespace;
  try {
    canonicalNamespace = await realpath(namespaceRoot);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(namespaceRoot, { recursive: true });
    canonicalNamespace = await realpath(namespaceRoot);
  }
  if (canonicalNamespace !== canonicalRoot && !canonicalNamespace.startsWith(`${canonicalRoot}${path.sep}`)) {
    throw new Error("staging_verified_path_escape_rejected");
  }
  const directory = path.join(config.verifiedBankRoot, question.subject, `G${question.grade}`);
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, `${question.id}.json`);
  try {
    await writeFile(target, JSON.stringify(verified, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 });
    return { written: true, idempotent: false, question_id: question.id, authority: "question_quality_agent_verify", receipt_id: receiptId, content_digest: contentDigest };
  } catch (error) {
    if (error?.code === "EEXIST") {
      const existing = JSON.parse(await readFile(target, "utf8"));
      if (existing?.quality?.content_digest !== contentDigest) {
        const conflict = new Error("verified_question_conflict");
        conflict.code = "verified_question_conflict";
        conflict.status = 409;
        throw conflict;
      }
      return { written: false, idempotent: true, question_id: question.id, authority: "question_quality_agent_verify", receipt_id: existing.quality.receipt_id, content_digest: contentDigest };
    }
    throw error;
  }
}

function validateEnglishConversationMetadata(question) {
  const conversation = question.conversation;
  const specialist = question.specialist;
  if (question.subject !== "english"
    || question.type !== "english_conversation"
    || question.expected_answer !== undefined
    || question.answer_key_version !== "synthetic-conversation-v1"
    || !validSpeechText(question.stem, 240)
    || !validSpeechText(conversation?.greeting_zh, 240)
    || !Number.isInteger(conversation?.target_turn_count)
    || conversation.target_turn_count < 2
    || conversation.target_turn_count > 10
    || conversation.transcript_retention !== "none"
    || conversation.audio_retention !== "none"
    || conversation.local_voice_only !== true
    || specialist?.schema_version !== "english-conversation-specialist-v1"
    || specialist?.evidence_schema !== "english-specialist-evidence-v1"
    || specialist?.subskill !== "conversation"
    || specialist?.mode !== "guided_dialogue"
    || specialist?.evaluator !== "english_specialist_conversation_turn"
    || specialist?.completion_evidence !== "session_summary_only") {
    throw new Error("invalid_english_conversation_metadata");
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function validateEnglishReadAloudMetadata(question) {
  const specialist = question.specialist;
  if (question.subject !== "english" || question.type !== "voice_response"
    || typeof question.expected_answer !== "string" || !question.expected_answer.trim()
    || !validSpeechText(question.instruction_text, 160)
    || !validSpeechText(question.display_text, 240)
    || !validSpeechText(question.spoken_text, 240)
    || question.language !== "en-US"
    || canonicalSpeech(question.display_text) !== canonicalSpeech(question.spoken_text)
    || canonicalSpeech(question.expected_answer) !== canonicalSpeech(question.spoken_text)
    || specialist?.schema_version !== "english-read-aloud-specialist-v1"
    || specialist?.evidence_schema !== "english-specialist-evidence-v1"
    || specialist?.mode !== "read_aloud" || specialist?.rubric?.evaluator !== "deterministic_transcript_match"
    || specialist?.rubric?.low_reliability_result !== "unverifiable"
    || specialist?.rubric?.local_stt_only !== true || specialist?.rubric?.transcript_retention !== "none") {
    throw new Error("invalid_english_read_aloud_metadata");
  }
}

function validSpeechText(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength
    && !/[\u0000-\u001f\u007f<>]/u.test(value);
}

function canonicalSpeech(value) {
  return String(value).normalize("NFKC").trim().replace(/\s+/g, " ");
}

function validateSpecialistChoiceMetadata(question) {
  const policy = SUBJECTS[question.subject];
  const specialist = question.specialist;
  if (!policy || question.type !== "multiple_choice" || !specialist
    || specialist.schema_version !== `${question.subject}-choice-specialist-v1`
    || specialist.evidence_schema !== policy.schema || !SAFE_ID.test(specialist.subskill)
    || typeof specialist.correct_feedback !== "string" || !specialist.correct_feedback.trim()) {
    throw new Error("invalid_subject_specialist_metadata");
  }
  for (const choice of question.choices) {
    if (choice === question.expected_answer) continue;
    const diagnostic = specialist.distractors?.[choice];
    if (!diagnostic || !Array.isArray(diagnostic.error_codes) || diagnostic.error_codes.length === 0
      || diagnostic.error_codes.some((code) => typeof code !== "string" || !code.startsWith(policy.prefix))
      || typeof diagnostic.feedback !== "string" || !diagnostic.feedback.trim()
      || typeof diagnostic.hint !== "string" || !diagnostic.hint.trim()
      || !diagnostic.representation || !SAFE_ID.test(diagnostic.representation.kind)) {
      throw new Error("invalid_subject_specialist_metadata");
    }
  }
}
