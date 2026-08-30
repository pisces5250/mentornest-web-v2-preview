import React from "react";

export type TutorSubject = "math" | "english" | "chinese" | "science" | "social_studies";

export interface SpecialistRepresentationData {
  subject: TutorSubject;
  kind: string;
  title: string | null;
  content: string;
  items: string[];
  aria_label: string | null;
}

const KINDS: Record<TutorSubject, ReadonlySet<string>> = {
  math: new Set(["equation_steps", "number_line", "fraction_bar", "worked_example"]),
  english: new Set(["model_sentence", "pronunciation", "vocabulary", "conversation"]),
  chinese: new Set(["character_structure", "reading_strategy", "sentence_pattern", "text_evidence"]),
  science: new Set(["observation_evidence", "causal_model", "variable_control", "concept_model"]),
  social_studies: new Set(["timeline", "map_context", "source_evidence", "perspective"]),
};

const SUBJECT_LABEL: Record<TutorSubject, string> = {
  math: "數學老師的表示",
  english: "英文老師的示範",
  chinese: "國文老師的引導",
  science: "自然老師的證據",
  social_studies: "社會老師的脈絡",
};

export function isKnownRepresentation(data: SpecialistRepresentationData): boolean {
  return KINDS[data.subject].has(data.kind);
}

/** 僅呈現 specialist 已提供的內容；未知 kind 不推測、不補寫。 */
export function SpecialistRepresentation({ data }: { data: SpecialistRepresentationData }) {
  if (!isKnownRepresentation(data)) return null;
  const detail = subjectDetail(data);
  return (
    <section
      className={`mn-specialist-representation mn-specialist-representation--${data.subject}`}
      data-testid={`specialist-representation-${data.subject}`}
      data-kind={data.kind}
      aria-label={data.aria_label || SUBJECT_LABEL[data.subject]}
    >
      <h3>{data.title || SUBJECT_LABEL[data.subject]}</h3>
      {detail}
    </section>
  );
}

function rows(data: SpecialistRepresentationData) {
  return data.items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>);
}

function subjectDetail(data: SpecialistRepresentationData): React.ReactNode {
  switch (data.subject) {
    case "math":
      return <><p className="mn-specialist-representation__math-expression">{data.content}</p>{data.items.length > 0 && <ol aria-label="解題步驟">{rows(data)}</ol>}</>;
    case "english":
      return <><blockquote lang="en">{data.content}</blockquote>{data.items.length > 0 && <ul aria-label="英文語言重點">{rows(data)}</ul>}</>;
    case "chinese":
      return <><blockquote lang="zh-Hant">{data.content}</blockquote>{data.items.length > 0 && <ul aria-label="文句線索">{rows(data)}</ul>}</>;
    case "science":
      return <dl><dt>觀察或證據</dt><dd>{data.content}</dd>{data.items.length > 0 && <><dt>檢查順序</dt><dd><ol>{rows(data)}</ol></dd></>}</dl>;
    case "social_studies":
      return <><p>{data.content}</p>{data.items.length > 0 && <ol aria-label="時間、地點或資料脈絡">{rows(data)}</ol>}</>;
  }
}
