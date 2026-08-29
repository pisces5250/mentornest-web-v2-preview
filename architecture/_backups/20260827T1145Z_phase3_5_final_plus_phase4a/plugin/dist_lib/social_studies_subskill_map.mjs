// Social Studies Subskill Map v1 — deterministic keyword rules.
//
// Subskills are the primary axes the Social Studies Specialist uses to choose
// representation (timeline / map / chart / source comparison / text) and to
// route a student's error into the correct category.

const RULES = {
  // Order matters: more specific rules come first.
  timeline: ["TIMELINE", "TIME.", "CHRONOLOGICAL", "SIMULTANEOUS", "ORDERING"],
  causality: ["CAUSAL", "CAUSE", "EFFECT", "MULTI-CAUSE", "CHAIN"],
  source_comparison: ["SOURCE", "SRC.", "PRIMARY", "SECONDARY", "PERSPECTIVE", "DOCUMENT"],
  data_interpretation: ["DATA", "CHART", "STAT", "POPULATION", "GRAPH", "PYRAMID"],
  map: ["MAP.", "PATH", "ROUTE", "DISTANCE", "BORDER", "PATH-ROUTE"],
  geography: ["GEO.", "REGION", "GEOGRAPHY", "COMPASS", "CLIMATE", "RIVER", "OCEAN", "MOUNTAIN"],
  civics: ["CIVIC", "GOV.", "LAW", "RIGHTS", "DUTIES", "VOTE", "ELECTION"],
  culture: ["CULT", "ETHNIC", "RELIGION", "FESTIVAL", "CUSTOM", "LANGUAGE"],
  history: ["HIST", "DYNASTY", "ERA", "CENTURY", "WAR", "EMPEROR", "REVOLUTION"],
};

const ALL = Object.keys(RULES);

function has(kp, word) {
  return kp.toUpperCase().includes(word);
}

export function classifySocialStudiesSubskill({ knowledge_point }) {
  const kp = String(knowledge_point || "").toUpperCase();
  for (const [primary, words] of Object.entries(RULES)) {
    if (words.some((w) => has(kp, w))) {
      const secondary = ALL
        .filter((s) => s !== primary)
        .filter((s) => RULES[s].some((w) => has(kp, w)))
        .slice(0, 3);
      return { primary_subskill: primary, secondary_subskills: secondary };
    }
  }
  // Heuristic default: if the KP looks like a history/social topic by shape
  // (contains a dot-separated token), pick the closest rule by partial
  // overlap. Otherwise default to "history" because that's the most common
  // G3-G6 social studies topic in the curriculum.
  if (/^SOCIAL\./i.test(String(knowledge_point || ""))) {
    return { primary_subskill: "history", secondary_subskills: ["geography", "culture"] };
  }
  return { primary_subskill: "history", secondary_subskills: ["civics", "culture"] };
}

export function listSocialStudiesSubskills() {
  return ALL.slice();
}