---
name: proposals-v1.3
description: Analyze the repository and produce three concise, challenging engineering prompts
---

# Repository Analysis and Challenge Proposals

Analyze the entire current repository, then write the findings and three concise, challenging coding
prompts to `repository_context.md` in the repository root. This file is the durable context for the
next steps.

## Operating Rules

- Treat the repository contents as the source of truth. Read all applicable `AGENTS.md` files and
  obey the instructions that govern each area.
- Do not modify production code, tests, configuration, generated files, or existing documentation.
  The only files this command may create or replace are `repository_context.md` and the three
  per-proposal Markdown files required below.
- Keep every sub-agent read-only. The coordinating agent alone writes the final artifact after it
  has reviewed and synthesized all reports.
- Ground the analysis and `repository_context.md` in repository evidence. Cite repository-relative
  paths and relevant symbols or line numbers when available. Clearly label inferences and unresolved
  ambiguities in that context file.
- Detailed evidence belongs in `repository_context.md`, not the proposal files. Keep citations,
  line-number references, inventory counts, agent notes, and research methodology out of proposals.
- If any finding, interpretation, recommendation, or external fact is uncertain or may depend on
  outdated knowledge, do not guess. Consult both a read-only `librarian` agent for current primary
  sources and a read-only `oracle` agent for technical reasoning before continuing. Reconcile their
  advice against the repository and cited sources; record remaining uncertainty in
  `repository_context.md`. Mention it in a proposal only when it changes implementation or acceptance
  behavior, using direct engineering language rather than an evidence-status label.
- Do not implement any of the proposed prompts.

## Phase 1: Inventory and Coverage

Build a repository inventory before delegating analysis. Account for every tracked repository area,
including source code, tests, scripts, configuration, CI/workflows, packaging, documentation, and
agent guidance.

Create a coverage map that assigns every inventoried area to at least one sub-agent. Generated output,
vendored dependencies, binaries, caches, and build artifacts do not require line-by-line analysis,
but identify them explicitly and explain why they are classified rather than silently skipping
them.

## Phase 2: Parallel Analysis

Spawn at least five sub-agents in parallel, with distinct primary perspectives:

1. Architecture and dependency boundaries: module responsibilities, dependency direction, shared
   contracts, control flow, state ownership, and architectural invariants.
2. Product and runtime behavior: user-facing capabilities, lifecycle paths, integrations, data
   flow, concurrency, failure handling, and platform-specific behavior.
3. Quality, security, and performance: validation and trust boundaries, resource/liveness risks,
   performance-sensitive paths, test strategy, test gaps, and observability.
4. Build and delivery: toolchain, code generation, build pipelines, CI, packaging, release gates,
   and operational constraints.
5. Developer and real-project use: public or reusable seams, extension points, configuration,
   developer ergonomics, documentation quality, and how the repository could serve as the basis
   for a real project.

Give each sub-agent the repository inventory, its assigned scope, the required evidence format, and
a requirement to report both findings and open questions. Add more sub-agents if the inventory has
important areas that these perspectives do not cover.

When all reports return, reconcile conflicting claims against the code. Synthesize them; do not
paste reports together or let one report substitute for repository-wide coverage. Close coverage
gaps with targeted follow-up analysis before writing the artifact.

## Phase 3: Define `repository_context.md`

After Phase 4 has drafted exactly three proposals, assemble the evidence-backed context and the
engineer-facing proposals as two distinct content layers. Invoke the `humanizer` skill on
`repository_context.md` in a neutral technical register while preserving facts, uncertainty labels,
citations, paths, symbols, commands, and conclusions.

Before humanizing each proposal, remove audit scaffolding and retain only the requested change,
practical motivation, essential repository seams and constraints, observable completion behavior,
brief usage and challenge explanations, and rubric criteria. Invoke the `humanizer` skill separately
on each proposal in the voice of a software engineer giving an AI coding agent a task. Preserve the
technical outcome and boundaries, but do not preserve audit-report structure or wording. The
humanizer must not invent evidence or turn the imagined usage scenario into a claim of actual
experience. The humanizer may rewrite only prose inside the required sections; it must not alter
heading text, heading levels, section order, proposal numbering, rubric numbering, criterion
boundaries, exact paths, symbols, commands, thresholds, required design direction, forbidden
approaches, or add or remove sections. Write only final rewrites; do not include drafts or editorial
audits in any output file.

Use this structure:

```markdown
# Repository Context

## Scope and Method

## Repository Map

## Architecture and Key Flows

## Product and Runtime Behavior

## Quality, Security, and Performance

## Build, Test, Packaging, and Release

## Developer Experience and Real-Project Use

## Constraints, Risks, and Opportunities

## Coverage Ledger

## Proposed Coding Challenges
```

The context sections must be concise but decision-useful. Include:

- The repository's purpose, technology stack, maturity, and major subsystems.
- Important entry points and end-to-end control, data, and lifecycle flows.
- Architectural boundaries, invariants, extension points, and generated-code boundaries.
- Test layers, verification commands, CI/release expectations, and evidence gaps.
- Security, reliability, concurrency, performance, portability, and maintenance constraints.
- A coverage ledger mapping every inventoried area to the sub-agent findings that cover it.
- Observed facts separated from reasoned inferences and unresolved questions.
- Exactly three final proposals that follow the concise engineer-prompt contract below. Shared
  evidence remains in the context sections instead of being repeated in those proposals.

## Phase 4: Propose Exactly Three Challenging Prompts

Derive exactly three distinct, implementation-ready coding prompts from the synthesized repository
context. They may combine multiple aspects, but each must target a materially different problem,
primary subsystem, or engineering risk. Make them difficult enough to test a capable AI coding
agent, yet bounded and feasible in the current repository. Do not use generic tasks that could apply
to any codebase.

Scope each proposal so a capable AI coding agent would reasonably need at least one focused hour to
implement and verify it. The complexity must come from necessary repository-specific reasoning,
meaningful interactions across modules or surfaces, behavioral tests, and real verification. Do not
inflate the estimate with boilerplate, arbitrary file counts, unrelated cleanup, or waiting time.

The one-hour requirement is a scope-selection rule, not content for the proposal. Do not include
hour-by-hour effort estimates, total-hour estimates, staffing plans, dependency inventories, risk
registers, or rollback plans. Include a dependency, risk, or non-goal only when it is an essential
implementation boundary, and state it in one direct sentence.

### Rubric-grounding pass

Before drafting each `Evaluation Rubric`, trace the proposal against repository evidence. Record the
detailed trace in `repository_context.md`; proposal files retain only the implementation and grading
conclusions that an engineer needs. For each proposal, determine:

- The requested behavior and its end-to-end flow.
- The owning layer, state owner, or existing implementation, plus the justified destination for the
  change when one exists.
- Every affected caller, adapter, presentation surface, process boundary, or equivalent decision
  point where a partial fix would leave behavior inconsistent.
- Initialization, restart, shutdown, cleanup, persistence, migration, concurrency, and failure
  behavior when the proposal touches them.
- Focused test locations, existing seams, and every applicable validation command and enforced
  threshold supported by repository scripts, CI, or governing guidance.
- Evidence-backed invariants, forbidden shortcuts, and materially justified design direction.

Use exact paths, symbols, commands, file destinations, and thresholds when the repository supports
them. Do not invent tools, metrics, thresholds, architecture, or a preferred design. Require a
specific abstraction, design, or destination only when established ownership or architecture makes
it materially safer or more coherent. Otherwise, grade observable behavior and preserved invariants
without dictating internals.

### Concise engineer-prompt contract

Write each proposal as if a software engineer typed it directly into an AI coding agent. Use plain,
specific language, varied sentence length, and an action-oriented title. Open the `Coding Prompt`
with the requested change, not with repository history or research findings.

Keep each `Coding Prompt` between 120 and 200 words in two to four short paragraphs. It must include
the practical problem, requested outcome, only the essential code seams and constraints, and
observable completion behavior. Integrate testing expectations naturally. Do not include an
exhaustive implementation sequence, separate TDD plan, project-management commentary, or repeated
acceptance criteria.

Keep each proposal's non-rubric prose under 450 words, excluding Markdown headings and the entire
`Evaluation Rubric` section. The usage section must be one 35-60-word paragraph. The challenge
section must be one 40-70-word paragraph.

Do not use `FACT`, `INFERENCE`, or `UNRESOLVED` labels in a proposal. Do not include Markdown source
citations, line-number references, inventory statistics, agent names, research narration, or phrases
such as `This is hypothetical`, `not evidence`, `Verification requires`, `Risks include`, `Rollback`,
`Dependencies are`, `Estimated effort`, or `Total:`. Do not include hour-by-hour effort estimates.
The `Coding Prompt` may name a small number of relevant paths or symbols when an engineer would
naturally include them. The `Evaluation Rubric` may name every evidence-backed path, symbol, command,
file destination, or threshold needed to make its criteria unambiguous.

Before accepting a proposal, read the `Coding Prompt` by itself. It must sound like a practical task
an engineer would paste into a coding agent, not an audit report, architecture review, benchmark
brief, or generated project plan. Rewrite it if the direct request is not obvious on the first read.

For each proposal, use this exact structure:

```markdown
### Proposal N: <short, action-oriented title>

#### Coding Prompt

<A direct 120-200-word engineering request. State the practical problem, requested change, essential
constraints, and observable completion behavior in two to four short paragraphs.>

#### How I Would Use This Codebase

<In 35-60 words, write in first person from the imagined engineer's perspective. Name the concrete
workflow or project context and the practical outcome. The heading already establishes the scenario,
so do not add a hypothetical-use or non-adoption disclaimer.>

#### Why This Is Challenging

<In 40-70 words, explain the concrete interaction, hidden constraint, or failure mode that makes the
solution non-obvious. Explain why a superficial implementation or test would be insufficient without
repeating the coding prompt or rubric.>

#### Evaluation Rubric

1. <A distinct, evidence-derived acceptance dimension in two or three sentences. State its observable
   outcome, relevant scope, and boundary.>
2. <A second distinct, evidence-derived acceptance dimension in two or three sentences.>
3. <A third distinct, evidence-derived acceptance dimension in two or three sentences.>
4. <A fourth distinct, evidence-derived acceptance dimension in two or three sentences.>
```

### Non-negotiable proposal block schema

The template above is a fail-closed schema, not a suggestion. Every proposal block in
`repository_context.md` and every standalone per-proposal file must use exactly this heading
sequence: `### Proposal N: ...`, `#### Coding Prompt`, `#### How I Would Use This Codebase`,
`#### Why This Is Challenging`, and `#### Evaluation Rubric`. The literal heading names, heading
levels, order, proposal numbering, and section count are required. `N` resolves to `1`, `2`, and
`3` exactly once each, in that order. Actual output must use real Markdown headings, not a fenced
copy of the template. Do not add, remove, rename, or reorder headings. In particular, do not use
`Problem`, `Source grounding`, `Test-first acceptance criteria`, `Scope constraints`, or
`Validation` as headings.

Each proposal's rubric must contain exactly four numbered criteria. Each criterion must cover one
distinct, independently gradable, evidence-backed acceptance dimension in two or three sentences.
Across the four criteria, cover the required observable outcome; every affected call site or surface
where partial application would fail; relevant failure, lifecycle, cleanup, and persistence behavior;
preserved architecture, state ownership, and public contracts; focused tests and every applicable
repository-supported quality gate, including exact commands and enforced thresholds; and concrete
disallowed shortcuts when evidence makes them relevant. Choose four dimensions that fit the proposal
rather than forcing a universal category set. If the evidence does not support four distinct
criteria, select a different proposal instead of padding the rubric, splitting one dimension
artificially, or adding a generic criterion. Never use vague qualities such as "clean code" or "good
performance," and do not turn the rubric into an exhaustive implementation recipe.

### Per-proposal Markdown files

Write each concise, humanized proposal to its own Markdown file in the repository root. Use a short,
memorable, descriptive kebab-case filename such as `proposal-<descriptive-title>.md`; do not use an
ordinal-only name such as `proposal-1.md`.

Draft one canonical block per proposal using the required schema. Insert that canonical block
unchanged in `repository_context.md`, then copy the complete block verbatim into its standalone
file. Filenames may differ, but content may not: no extra, reordered, or renamed headings, and no
edited, omitted, or added text. Self-contained means an implementer can understand the requested
outcome, essential constraints, and completion checks without prior conversation; it does not mean
copying the research dossier. Each standalone file contains only its canonical block: its first
nonblank line is `### Proposal N: ...`, with no frontmatter, wrapper title, preface, appendix, or
trailing report. Detailed evidence belongs in `repository_context.md`, not the proposal files.

## Final Quality Gate

Before finishing, verify all of the following:

- `repository_context.md` and exactly three uniquely named per-proposal Markdown files exist at the
  repository root and are the only files changed by this command.
- The coverage ledger accounts for every inventoried repository area or explicitly classifies why an
  area did not require detailed inspection.
- Context findings are synthesized, evidence-backed, and clear about facts, inferences, and unknowns.
- Every uncertainty or potentially outdated claim was reviewed by both `librarian` and `oracle`, with
  unresolved disagreements recorded rather than guessed away.
- The `humanizer` skill was applied separately to the evidence context and each engineer-facing
  proposal without changing technical meaning or adding unsupported claims.
- There are exactly three proposals, and each is distinct, challenging, codebase-specific, and
  feasible.
- Each proposal has enough necessary implementation and verification scope to require at least one
  focused hour from a capable AI coding agent, without artificial padding, unrelated work, or an
  effort estimate in the proposal.
- Every `Coding Prompt` contains 120-200 words in two to four short paragraphs. Each usage section
  contains 35-60 words, each challenge section contains 40-70 words, and each proposal's non-rubric
  prose remains under 450 words, excluding headings and the entire `Evaluation Rubric` section.
- No proposal contains evidence-status labels, source citations, research narration, meta-disclaimers,
  hour estimates, or project-management boilerplate.
- Every proposal includes the coding prompt, imagined first-person real-project usage, a specific
  explanation of why it is challenging, and exactly four numbered, evidence-derived rubric criteria.
  Each criterion contains two or three sentences and covers a distinct, independently gradable
  dimension of the proposal's actual acceptance surface.
- For every rubric, trace each criterion to the proposal's evidence in `repository_context.md`.
  Confirm complete affected-surface coverage, and include architecture, state ownership, lifecycle,
  persistence, failure, concurrency, migration, initialization, restart, shutdown, or cleanup
  expectations only when the evidence makes them relevant.
- Confirm that each rubric requires focused tests and every applicable repository-supported quality
  gate to pass, naming exact commands and enforced thresholds. It must preserve required public
  contracts and ownership boundaries and state concrete forbidden shortcuts only when evidence
  supports them. Reject invented tools, metrics, thresholds, architecture, or unsupported preferred
  designs.
- Confirm that every rubric has exactly four numbered criteria and that every criterion has two or
  three sentences. The criteria must remain independently gradable and nonredundant and must not
  bloat into a generic checklist or an exhaustive implementation recipe.
- Run a final exact heading-sequence and heading-count check on every canonical and standalone
  proposal block. Each must match the required schema exactly, including literal names, levels,
  order, numbering, and section count, using real Markdown headings. Confirm that `N` is `1`, `2`,
  and `3` exactly once each in order; alternate headings such as `Problem`, `Source grounding`,
  `Test-first acceptance criteria`, `Scope constraints`, and `Validation` fail this check.
- Perform an exact-content comparison between each canonical block in `repository_context.md` and
  its standalone file. Every per-proposal file must have a memorable, descriptive filename, start
  with its `### Proposal N: ...` heading, contain only its canonical block, and be a verbatim copy
  of its counterpart.
- Treat any heading-schema or exact-content mismatch as a failed final quality gate: rewrite the
  affected canonical block and standalone copy, then re-run both checks before reporting success.
- Read alone, each `Coding Prompt` sounds like a direct request from a software engineer and preserves
  the essential repository constraints and verification expectations.

Finish with a brief report naming `repository_context.md`, all three per-proposal files, the
perspectives used, and any remaining ambiguities. Do not duplicate the artifacts' full contents in
the final response.
