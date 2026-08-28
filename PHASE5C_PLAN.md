# Phase 5C — Complete Child Learning Session

> **Status**: IN PROGRESS (started 20260827T2304Z)
> **Depends on**: Phase 5A + 5B (SHIPPED; do not redesign)
> **Working dir**: `mentornest-web-v2/` (separate from production mentornest-web)
> **Engine authority**: all learning/mastery/question/voice logic stays in
> `plugins/mentornest-learning/`. Web v2 is presentation + keystroke
> dispatch + a11y chrome only.

## Three internal milestones

### 5C-1 Child Learning Session (THIS ROUND TARGET)
**Outcome**: child opens Home → Learning Director picks next learning action →
Verified Bank lookup → Subject Specialist + presentation_request → Web v2
renderer → deterministic validation → hint / visual teaching → feedback →
adaptive next question → session completion → learning record + mastery
evidence write → session summary.

Supported interactions (already built in 5A/5B):
- `multiple_choice_basic` (Phase 5A)
- integer / decimal / fraction input via `NativeMathKeypad` (Phase 5B)
- math SVG: `fraction_bar` / `number_line` / `area_model` (Phase 5B)

Explicitly NOT in 5C-1: drag/drop / matching / ordering / handwriting.

Session rules (locked):
- One main instructional step / question at a time.
- Short child-facing copy (G3-G4 ≤ ~24 字/句; G5-G6 ≤ ~36 字/句).
- Representation switch > adding explanation.
- No sibling comparison.
- Age profile controls **presentation only**, not mastery/difficulty.
- G5-G6 UI stays mature and concise.

Adaptive behavior (must demonstrate):
- correct first attempt → progress normally
- wrong first attempt → conceptual hint
- repeated wrong → visual representation switch
- mastered KP → move forward
- weak KP / error pattern → more targeted practice

Next-question selection comes from existing Learning Director / mastery /
question ecosystem — NOT UI-side random logic.

Data writes (real session contract):
- `learning_record_append` (per attempt)
- `mastery_evidence` via `mastery_engine_v2.record_attempt` (per correct /
  mastered)
- `school_progress` write on session completion
- All writes go through plugin (no UI-side ledger)
- Tests use fake student IDs (`student_t_phase5c_*`) + cleanup
- Production student data (student_001 / student_002) untouched

### 5C-2 Open response + Voice (after 5C-1 green)
- `short_answer` (text)
- `explain_thinking` (long-form)
- open oral response
- English reading / speaking hooks
- Local SenseVoice STT (sherpa-onnx int8) — no cloud fallback
- Voice is NOT the default for multiple-choice selection
- Local TTS where pedagogically useful
- Do not block on R5 (G1-G2 voice persona) — defer

### 5C-3 Parent Summary v1 (after child session works)
- what was studied
- KP / curriculum alignment
- mastery / evidence change
- first-attempt correctness
- hint usage
- error patterns
- strengths + areas needing review
- recommended next learning action
- License provenance OUT of child UI; IN for parent/admin
- Informational only; MUST NOT modify mastery

## Acceptance gates (apply per milestone)

For each of mobile / tablet / desktop:
- axe: 0 critical + 0 serious (moderate/minor reported)
- keyboard-only flow across full session
- focus management between questions
- ARIA + live feedback
- reduced motion
- default / high-contrast / color-vision-safe modes
- session resume / reload behavior
- error / retry states

Production invariants at every SHIP gate:
- `mentornest-learning` plugin regression: still 1558/1558
- Production mentornest-web HTML MD5 unchanged
  (`dbb08728c4b213a1ca7ba55c6261b1d6`)
- Workspace data MD5s unchanged
- No `student_t_phase5c_*` artifacts in `/home/node/.openclaw/workspace/data`

## Deployment rule

Phase 5C continues to live in `mentornest-web-v2/`. At 5C-1 acceptance we
deploy a **separate Web v2 preview service / domain** so human testers can
open it on Mac / iPhone / iPad. **Do not cut production traffic**.

## Out of scope this round (Phase 5C)
- handwriting
- cloud OCR / cloud STT
- matching / ordering / drag-drop
- large Storybook expansion
- production cutover

## Still-owed human decisions (unchanged from Phase 5A/5B)
- R4 handwriting tech (Phase 6)
- R5 G1-G2 default TTS voice_id (deferred)
- R8 local → SaaS upgrade timing (deferred)
- R9 PDF parser library (Phase 5B/C — still owed)

## Verification integrity
No tool, no verification claim. PASS counts, file existence, line counts,
MD5 hashes, manifest counts, runtime state, completion status may ONLY be
reported when directly observed. UNVERIFIED values marked explicitly.
