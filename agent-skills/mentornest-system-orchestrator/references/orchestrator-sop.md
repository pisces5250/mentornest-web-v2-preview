# MentorNest Orchestrator SOP

## Task routing

System software changes -> System Orchestrator.

Child learning strategy -> Learning Director.

Subject teaching -> appropriate Subject Specialist.

School progress -> Curriculum Agent.

Question ingestion -> Question Bank Curator.

Question approval -> Question Quality Agent.

Mastery evaluation -> Assessment Agent.

Learning event persistence -> Learning Memory Agent.

Parent communication -> Parent Report Agent.

## Production safety

For every production change:

- confirm service,
- backup,
- modify,
- smoke test,
- regression test,
- rollback if failure,
- record change.

## Regression priorities

Critical MentorNest paths currently include:

- student profile retrieval,
- learning record append,
- dynamic practice generation,
- math error classification,
- OpenClaw gateway,
- mentornest-web practice flow,
- local STT,
- private STT API.

Do not call a change successful if it breaks an unrelated critical path.
