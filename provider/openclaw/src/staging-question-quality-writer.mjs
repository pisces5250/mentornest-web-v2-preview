import fs from "node:fs/promises";
import path from "node:path";

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
  writeFile = fs.writeFile, mkdir = fs.mkdir, realpath = fs.realpath,
} = {}) {
  if (config.environment !== "staging" || config.productionDataAllowed !== false) throw new Error("staging_only_writer");
  if (!question || question.verification_status !== "candidate") throw new Error("candidate_required");
  if (!SAFE_ID.test(question.id) || !question.id.startsWith("q.synthetic.")) throw new Error("synthetic_question_id_required");
  if (!SAFE_ID.test(question.subject) || !Number.isInteger(question.grade) || question.grade < 1 || question.grade > 12) throw new Error("invalid_question_target");
  if (!SAFE_ID.test(question.knowledge_point) || !SAFE_ID.test(question.answer_key_version)) throw new Error("invalid_question_identity");
  if (question.provenance?.source_class !== "AI_ORIGINAL" || question.provenance?.license !== "AI_ORIGINAL") throw new Error("staging_provenance_required");
  if (!Array.isArray(question.choices) || question.choices.length < 2 || question.choices.length > 6) throw new Error("invalid_choices");
  if (!question.choices.includes(question.expected_answer)) throw new Error("answer_not_in_choices");
  if (new Set(question.choices.map(String)).size !== question.choices.length) throw new Error("duplicate_choices");
  validateSpecialistChoiceMetadata(question);
  const verified = {
    ...question,
    verification_status: "verified",
    quality: {
      authority: "question_quality_agent_verify",
      gate_version: "staging-synthetic-v1",
      stages_passed: ["structure", "provenance", "answer-key", "choice-dedupe", "subject-specialist", "staging-isolation"],
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
    return { written: true, question_id: question.id, authority: "question_quality_agent_verify" };
  } catch (error) {
    if (error?.code === "EEXIST") return { written: false, question_id: question.id, authority: "question_quality_agent_verify" };
    throw error;
  }
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
