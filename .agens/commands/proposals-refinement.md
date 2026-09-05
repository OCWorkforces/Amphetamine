---
name: proposals-refinement
description: Refine one initial coding prompt into one concise, repository-grounded proposal
argument-hint: Paste the initial coding prompt to refine
---

# Repository-Grounded Proposal Refinement

Treat the text supplied with this command as the initial coding prompt. Analyze the entire current
repository, preserve that prompt verbatim, and refine it into exactly one concise proposal that is
ready for implementation. Write the repository findings and the complete proposal to
`repository_context.md` at the repository root. Write the same complete proposal to exactly one
memorable, descriptive root Markdown file named `proposal-<descriptive-title>.md`.

If the supplied text is missing or blank, ask the user to provide the initial coding prompt and stop.
Do not analyze the repository or create, replace, or modify any output file in that case.

## Operating Rules

- Treat repository contents as the source of truth. Read all applicable `AGENTS.md` files and obey
  the instructions that govern each area.
- Preserve the initial coding prompt verbatim for traceability. Infer refinements from repository
  evidence, but do not silently change the requested outcome.
- If a material ambiguity remains after exploration and resolving it would change the user's intent,
  ask one precise question before writing either output file. Do not guess or write a partial result.
- Do not modify production code, tests, configuration, generated files, existing documentation, or
  this command's source workflow. The only files this command may create or replace are
  `repository_context.md` and one `proposal-<descriptive-title>.md` file at the repository root.
- Keep every sub-agent read-only. The coordinating agent alone writes the two final artifacts after
  reviewing and synthesizing all reports. Do not implement the refined proposal.
- Ground the analysis and `repository_context.md` in repository evidence. Cite repository-relative
  paths and relevant symbols or line numbers when available. Clearly separate observed facts,
  reasoned inferences, and unresolved questions in that context file.
- Detailed evidence belongs in `repository_context.md`, not the generated proposal sections. Keep
  citations, line-number references, inventory counts, agent notes, and research methodology out of
  the refined prompt, usage explanation, challenge explanation, and rubric.
- If any finding, interpretation, recommendation, or external fact is uncertain or may depend on
  outdated knowledge, do not guess. Consult both a read-only `librarian` agent for current primary
  sources and a read-only `oracle` agent for technical reasoning before continuing. Reconcile their
  advice against repository evidence and cited sources. Record remaining disagreement in
  `repository_context.md`. Mention it in the refined proposal only when it changes implementation or
  acceptance behavior, using direct engineering language rather than an evidence-status label.

## Phase 1: Capture Intent, Inventory, and Coverage

Record the supplied initial prompt verbatim. Identify its requested outcome, stated constraints, and
implicit assumptions. Keep its core intent intact while using evidence to make the eventual coding
prompt more specific, feasible, and verifiable.

Build a repository inventory before delegating analysis. Account for every tracked repository area,
including source code, tests, scripts, configuration, CI and workflows, packaging, documentation,
and agent guidance. Create a coverage map that assigns every inventoried area to at least one
sub-agent.

Generated output, vendored dependencies, binaries, caches, and build artifacts do not require
line-by-line analysis, but identify each explicitly and state why it is classified rather than
silently skipped. Explicitly analyze or classify every inventoried area.

## Phase 2: Parallel, Prompt-Focused Analysis

Spawn at least five read-only sub-agents in parallel. Give every sub-agent the initial prompt, the
inventory, its assigned scope, the required evidence format, and a requirement to report findings,
inferences, open questions, and affected repository paths or symbols. Use these distinct primary
perspectives:

1. Intent, feasibility, and architecture: preserve the requested outcome; locate ownership,
   architectural boundaries, dependencies, state, lifecycle, and relevant invariants.
2. Implementation paths and cross-module flows: trace likely implementation routes, callers,
   data flow, integrations, concurrency, failure paths, and user-visible surfaces.
3. Quality, security, performance, and testing: identify trust boundaries, reliability and liveness
   risks, performance-sensitive paths, observability, existing tests, and needed behavioral tests.
4. Build, CI, packaging, and operational constraints: examine toolchain requirements, code
   generation, build pipelines, CI gates, packaging, release safeguards, and operational evidence.
5. Developer and real-project use plus adversarial gap review: examine extension seams,
   configuration, documentation, developer workflows, realistic use of this codebase, and gaps or
   hidden assumptions in the first four perspectives.

Add read-only sub-agents if these perspectives leave an inventoried area uncovered. When uncertainty
or possibly outdated knowledge appears, also consult both the required read-only `librarian` and
`oracle` agents. The librarian must prefer current primary sources. The Oracle must reason about the
technical interpretation. Reconcile both reports with repository evidence and retain unresolved
disagreement as an open question.

When all reports return, reconcile conflicting claims against the code. Synthesize the reports; do
not concatenate them or let one report substitute for repository-wide coverage. Close coverage gaps
with targeted, read-only follow-up analysis before drafting either artifact.

## Phase 3: Refine One Complete Proposal

Refine the initial coding prompt into exactly one self-contained proposal. It must preserve the
user's requested outcome. Add only requirements that are directly related, repository-grounded, and
needed to make the outcome complete, safe, and verifiable.

Scope the proposal so a capable AI coding agent would reasonably need at least one focused hour for
necessary implementation and verification. Its complexity must come from repository-specific
reasoning, meaningful interactions across modules or surfaces, behavioral tests, and real
verification. Do not inflate scope with boilerplate, arbitrary file counts, unrelated cleanup, or
waiting time.

If the user's request is too small, add only directly related repository-grounded requirements. If
the one-hour floor still cannot be met without changing the user's intent, ask the user to approve a
concrete scope extension before writing either output file. Do not pad the proposal.

The one-hour requirement is a scope-selection rule, not proposal content. Do not include
hour-by-hour effort estimates, total-hour estimates, staffing plans, dependency inventories, risk
registers, or rollback plans. Include a dependency, risk, or non-goal only when it is an essential
implementation boundary, and state it in one direct sentence.

### Concise engineer-prompt contract

Write the generated proposal as if a software engineer typed it directly into an AI coding agent.
Use plain, specific language, varied sentence length, and an action-oriented title. Open the
`Refined Coding Prompt` with the requested change, not with repository history or research findings.

Keep the `Refined Coding Prompt` between 120 and 200 words in two to four short paragraphs. It must
include the practical problem, requested outcome, only the essential code seams and constraints, and
observable completion behavior. Integrate testing expectations naturally. Do not include an
exhaustive implementation sequence, separate TDD plan, project-management commentary, or repeated
acceptance criteria.

Keep the generated proposal content under 450 words, excluding Markdown headings and the verbatim
`Original Prompt` section. The usage section must be one 35-60-word paragraph. The challenge section
must be one 40-70-word paragraph. Use three rubric criteria, with a fourth only when it covers a
distinct acceptance dimension; each criterion must be one concise sentence with one independently
observable outcome.

Do not use `FACT`, `INFERENCE`, or `UNRESOLVED` labels in generated proposal sections. Do not include
Markdown source citations, line-number references, inventory statistics, agent names, research
narration, or phrases such as `This is hypothetical`, `not evidence`, `Verification requires`,
`Risks include`, `Rollback`, `Dependencies are`, `Estimated effort`, or `Total:`. Do not include
hour-by-hour effort estimates. The refined prompt may name a small number of relevant paths or
symbols when an engineer would naturally include them.

These style and length rules do not apply to the `Original Prompt` section. Preserve that section
verbatim even when it contains citations, labels, unusual formatting, or more than 450 words. Never
rewrite user-owned text merely to satisfy generated-content checks.

Before accepting the result, read the `Refined Coding Prompt` by itself. It must sound like a
practical task an engineer would paste into a coding agent, not an audit report, architecture review,
benchmark brief, or generated project plan. Rewrite it if the direct request is not obvious on the
first read.

Use this exact proposal structure:

```markdown
# Proposal: <short, action-oriented title>

## Original Prompt

<The supplied initial coding prompt, preserved verbatim.>

## Refined Coding Prompt

<A direct 120-200-word engineering request. State the practical problem, requested change, essential
constraints, and observable completion behavior in two to four short paragraphs.>

## How I Would Use This Codebase

<In 35-60 words, write in first person from the imagined engineer's perspective. Name the concrete
workflow or project context and the practical outcome. The heading already establishes the scenario,
so do not add a hypothetical-use or non-adoption disclaimer.>

## Why This Is Challenging

<In 40-70 words, explain the concrete interaction, hidden constraint, or failure mode that makes the
solution non-obvious. Explain why a superficial implementation or test would be insufficient without
repeating the refined prompt or rubric.>

## Evaluation Rubric

1. <One concise, observable success criterion.>
2. <One concise failure, boundary, or invalid-input criterion.>
3. <One concise verification or preserved-invariant criterion.>
```

The evaluation rubric must contain at least three independently reviewable criteria tied to behavior,
repository invariants, tests, or real verification evidence. Use a fourth criterion only for a
distinct dimension that cannot be combined without ambiguity. Never use vague qualities such as
"clean code" or "good performance."

## Phase 4: Define `repository_context.md` and the Standalone Proposal

Assemble the evidence-backed context and engineer-facing proposal as two distinct content layers.
Keep every `Original Prompt` block verbatim and outside humanization. Invoke the `humanizer` skill on
the generated context sections in a neutral technical register while preserving facts, uncertainty
labels, citations, paths, symbols, commands, and conclusions.

Before humanizing the generated proposal sections, remove audit scaffolding and retain only the
requested change, practical motivation, essential repository seams and constraints, observable
completion behavior, brief usage and challenge explanations, and rubric criteria. Invoke the
`humanizer` skill separately on those generated sections in the voice of a software engineer giving
an AI coding agent a task. Preserve the technical outcome and boundaries, but do not preserve
audit-report structure or wording. Do not fabricate evidence or turn the imagined usage scenario
into a claim of actual experience. Write only final rewrites; do not include drafts or editorial
audits in either file.

Write `repository_context.md` using this structure:

```markdown
# Repository Context

## Scope and Method

## Original Prompt

## Refinement Decisions

## Repository Map

## Affected Architecture and Flows

## Quality, Security, and Performance

## Build, Test, Packaging, and Release Constraints

## Risks and Open Questions

## Coverage Ledger

## Complete Refined Proposal
```

The context sections must be concise but decision-useful. Include the repository's purpose,
technology stack, maturity, major subsystems, relevant entry points, control and lifecycle flows,
architectural boundaries, invariants, extension points, generated-code boundaries, test layers,
verification commands, CI and release expectations, evidence gaps, and applicable security,
reliability, concurrency, performance, portability, and maintenance constraints.

The coverage ledger must map every inventoried area to the sub-agent findings that cover it, or state
why the area was classified without detailed inspection. Keep observed facts, inferences, and
unresolved questions distinct. Include the complete humanized proposal, not a summary, under
`## Complete Refined Proposal`. Keep detailed evidence in the preceding context sections instead of
repeating it inside the proposal.

Write the same complete humanized proposal to exactly one root Markdown file named
`proposal-<descriptive-title>.md`. Choose a short, memorable, descriptive kebab-case title based on
the proposal. Do not use an ordinal-only name such as `proposal-1.md`. The standalone file must
contain the title, original prompt, full refined coding prompt, imagined usage scenario, complete
challenge explanation, and every rubric criterion. Self-contained means an implementer can
understand the requested outcome, essential constraints, and completion checks without prior
conversation; it does not mean copying the research dossier. The generated sections must match the
corresponding concise proposal in `repository_context.md` exactly.

## Final Quality Gate

Before finishing, verify all of the following:

- Only `repository_context.md` and exactly one descriptive `proposal-<descriptive-title>.md` file at
  the repository root changed or were created by this command.
- The proposal count is exactly one, and both output files contain the same complete proposal in
  meaning and completeness.
- The coverage ledger accounts for every inventoried repository area or explicitly classifies why an
  area did not require detailed inspection.
- Context findings are synthesized, evidence-backed, and clear about facts, inferences, and
  unresolved questions.
- The initial prompt appears verbatim, its core intent is preserved, and every refinement is directly
  supported by repository evidence or clearly labeled as an unresolved question.
- The verbatim `Original Prompt` section was excluded from humanization, generated-content word
  limits, and banned-phrase checks.
- Every uncertainty or potentially outdated claim was reviewed by both `librarian` and `oracle`, and
  unresolved disagreements are recorded instead of guessed away.
- The `humanizer` skill was applied separately to generated context and engineer-facing proposal
  sections without changing technical meaning or adding unsupported claims.
- The proposal has enough necessary implementation and verification scope for at least one focused
  hour without artificial padding, unrelated work, or an effort estimate in generated sections.
- The `Refined Coding Prompt` contains 120-200 words in two to four short paragraphs, and the complete
  generated proposal content remains under 450 words excluding headings and the original prompt.
- Generated proposal sections contain no evidence-status labels, source citations, research
  narration, meta-disclaimers, hour estimates, or project-management boilerplate.
- The proposal includes every required section and three or four concrete, independently reviewable,
  behavior-oriented rubric criteria.
- The standalone filename is memorable and descriptive rather than ordinal-only, and the proposal is
  self-contained.
- Read alone, the `Refined Coding Prompt` sounds like a direct request from a software engineer and
  preserves the user's intent, essential repository constraints, and verification expectations.

Finish with a brief report naming `repository_context.md` and the one proposal file, the analysis
perspectives used, refinements made, and any unresolved ambiguities. Do not duplicate the artifacts'
full contents in the final response.
