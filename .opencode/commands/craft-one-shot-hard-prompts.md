---
name: craft-one-shot-hard-prompts
description: Analyze the active codebase in depth and propose three one-shot "hard prompts" suitable for evaluating frontier coding models or generating RL training data.
---

# Craft One-Shot Hard Prompts

You are operating as a **proposal author** for an evaluation pipeline that stress-tests frontier coding models (Claude Opus class). Your job is to study the **current repository** the user has opened, then produce **three independent, self-contained "hard prompts"** that a senior Silicon Valley AI engineer would accept as well-calibrated eval items.

Each submission is a **fresh container, single-turn**. The model receiving the prompt has no prior context, no memory of other submissions, and only what your prompt + the repo at a pinned commit provides. Treat that constraint as load-bearing.

---

## Operating Principles

1. **The repo is the source of truth.** Do not invent files, modules, APIs, or behaviors. Every claim in your prompt must be verifiable by reading the code.
2. **Hardness comes from the codebase, not from artificial constraints.** A great prompt is hard because the *real* problem is hard, not because you stacked rules.
3. **One prompt = one concrete goal.** No multi-part shopping lists. No "and also...".
4. **Rubrics must be machine-checkable in principle.** A verifier function or a grader agent should be able to apply each rubric without subjective judgment.
5. **Write like a working developer, not like an LLM.** Drop the bullet-point preamble, the "I want you to...", the rule-of-three flourishes. Sound like a teammate filing a tracked issue.

---

## Workflow

Execute the phases in order. Parallelize aggressively inside each phase.

### Phase 1 — Reconnaissance (parallel, background)

Fire these in parallel before forming any opinion:

- `task(subagent_type="explore", run_in_background=true, ...)` — map the architecture: entry points, module boundaries, build/test layout, hot files (high churn × high LOC), state machines, IPC/RPC surfaces, concurrency primitives, anything that looks load-bearing or fragile.
- `task(subagent_type="explore", run_in_background=true, ...)` — surface candidate hardness: long files, deeply nested logic, unusual algorithms, performance-sensitive paths, tricky type gymnastics, custom protocols, places where existing comments warn future developers.
- `task(subagent_type="librarian", run_in_background=true, ...)` — for any non-obvious external dependency or domain (e.g. Electron internals, a parser library, a numerical method), pull the **current** official docs and at least one production-grade reference implementation.

While these run, use `sentrux-mcp` (if available) to pull `health`, `dsm`, `git_stats`, and `test_gaps` for hotspot/coupling/risk signal. Use `tracelattice_sequentialthinking_tools` to structure your reasoning across the candidate set.

End your turn after firing. Wait for the completion notification before resuming.

### Phase 2 — Candidate Generation

After collecting reconnaissance, brainstorm **6–10 candidate prompts** internally. For each, jot:

- The exact file(s) and code path(s) it touches
- The class of difficulty (see taxonomy below)
- Why a frontier model is likely to fail or stall (>10 minutes of real work)
- Whether the change is something a real maintainer would plausibly merge

Discard any candidate that:

- Could be solved by a competent junior in <10 minutes
- Requires network access, Docker, a local LLM, secrets, or external services to verify
- Reads as toy/demo work (CRUD scaffolds, "add a hello endpoint")
- Is a known open-source issue with a public merged fix
- Asks the model to "find what's wrong" without a concrete goal
- Is a pure documentation, formatting, or rename pass

### Phase 3 — Difficulty Calibration (consult Oracle)

For your **top 4–5 candidates**, consult the oracle agent in a single batched call:

```
task(subagent_type="oracle", run_in_background=false, load_skills=[], prompt="<for each candidate: the proposed prompt, the affected files, your hardness hypothesis, and the rubric draft. Ask: which of these would actually stall Opus past 10 minutes or cause a wrong-but-plausible solution? Which feel artificial?>")
```

Use Oracle's verdict to keep the **three strongest, most distinct** candidates. Distinctness matters — three variants of "fix this race" is one proposal, not three.

### Phase 4 — Drafting

For each of the three winners, draft using the template below. Then run the **Self-Audit Gate** before writing the file.

### Phase 5 — Self-Audit Gate

Before writing output, verify *every* item in `./Project-Proposals-Checklist.md` for *each* of the three proposals. If any item fails, revise. Specifically re-check:

- Prompt is in natural developer voice, not LLM voice
- No subjective words in rubrics ("clean", "proper", "good", "robust", "well-designed", "appropriate", "modern")
- Each rubric is a single binary condition a verifier could evaluate from a diff + a test run
- The three proposals exercise **distinct** parts of the repo and **distinct** failure modes
- Final goal of each prompt is unambiguous and concrete
- No prompt requires the model to invent acceptance criteria

### Phase 6 — Output

Write the final document to `one-shot-hard-prompts.md` in the repository root using the **Output Document Format** below.

---

## Difficulty Taxonomy (pick from these; aim for diversity across your three)

- **Cross-cutting refactor** — change a contract that ripples through many call sites; type system + tests must remain green
- **Concurrency / state-machine bug** — race, deadlock, lost wakeup, reentrancy, ordering invariant
- **Performance under constraint** — meet a measurable budget (latency, memory, allocations) without breaking semantics
- **Algorithmic / data-structure** — replace an O(n²) hot path; implement a non-trivial algorithm correctly with edge cases
- **Protocol / serialization correctness** — IPC, network, on-disk format; backward compatibility
- **Build / toolchain plumbing** — bundler, codegen, monorepo wiring where the failure mode is silent
- **Subtle semantic bug** — code passes lint and types, fails on a specific input class the existing tests don't cover
- **API surface migration** — deprecate-and-replace across consumers without behavior drift

---

## Per-Proposal Template

Each proposal has exactly three sections. No extra commentary.

### Prompt

The exact text you would paste into a fresh model session. Written as a developer would write it: short, specific, no meta-instructions ("you are an expert..."), no rule lists, no rubric leakage. Reference real files by path. Reference real symbols by name. State the goal in one or two sentences. If the user would naturally include a stack trace, error message, or failing test output, include it verbatim from the repo.

**Length guidance:** typically 3–10 sentences. If it's longer than ~200 words, you are over-specifying.

### Difficulty Explanation

2–4 sentences, addressed to the human reviewer (not the model). Name the **specific** trap: which assumption is wrong, which invariant is non-obvious, which interaction across files is easy to miss, which test the obvious fix breaks. Avoid generalities like "requires deep understanding" — say *what* understanding and *why* it's hard to acquire from a single read.

### Rubrics

At least **3**, ideally **4–6**, binary criteria. Each rubric must:

- Be evaluable as true/false from the model's diff + a test run + a `grep`-able property
- Reference concrete files, symbols, or behaviors
- Avoid subjective adjectives
- Not double up (each rubric tests a *distinct* property)

**Good rubric shape:**
> "After the change, `<symbol>` in `<path>` is invoked exactly once per `<event>`; verifiable by adding a counter and running `<existing test command>`."

> "The exported public API of `<module>` is unchanged: `git diff --stat` shows no modifications to `<file>`'s export list, and no consumer in `<dir>` requires source edits."

> "The new implementation passes the existing test suite (`<command>`) and additionally handles input class `<X>` (a regression test exercising `<X>` exists and passes)."

**Bad rubric shape (do not produce):**
> "The code is clean and well-modularized." → subjective
> "Performance is improved." → unmeasurable
> "There are enough tests." → subjective

---

## Output Document Format

Write `one-shot-hard-prompts.md` with this exact structure:

```markdown
# One-Shot Hard Prompt Proposals

**Repository:** <name>
**Pinned commit:** <git rev-parse HEAD>
**Author notes:** <1–2 sentences on what aspects of the repo you targeted and why these three are distinct>

---

## Proposal 1 — <short descriptive title (taxonomy tag)>

### Prompt
<the prompt text>

### Difficulty Explanation
<2–4 sentences>

### Rubrics
1. <binary rubric>
2. <binary rubric>
3. <binary rubric>
4. <binary rubric, optional>

---

## Proposal 2 — <short descriptive title (taxonomy tag)>
...

---

## Proposal 3 — <short descriptive title (taxonomy tag)>
...
```

Always capture and record the **current commit hash** in the header so the proposal is reproducible.

---

## Tools & Agents to Leverage

- **`task(subagent_type="explore")`** — codebase grep with context. Fire many in parallel.
- **`task(subagent_type="librarian")`** — external docs, OSS reference implementations, API correctness.
- **`task(subagent_type="oracle")`** — calibration, "is this actually hard?", catching artificial constraints.
- **`sentrux-mcp`** — `scan` → `health`, `dsm`, `git_stats`, `hotspots`, `test_gaps` for finding real risk areas backed by churn/coupling/coverage data.
- **`tavily-mcp`** — current best practices, recent CVEs, library behavior changes that might invalidate stale assumptions in the repo.
- **`tracelattice_sequentialthinking_tools`** — structure your candidate evaluation; useful when ranking 8+ candidates against multiple criteria.

Default to **parallel background fanout** during Phases 1 and 2. Default to **synchronous Oracle consultation** in Phase 3.

---

## Required Reading

Before submitting, re-read `./Project-Proposals-Checklist.md` and verify every box passes for each of the three proposals. Treat the checklist as a hard gate, not a suggestion.

---

## Anti-Patterns (auto-reject your own draft if you see these)

- Prompt mentions "best practices", "production-quality", or "industry standard"
- Prompt enumerates implementation steps the model should follow
- Prompt includes the word "comprehensive" or "robust"
- Rubric uses "appropriately", "properly", "correctly" without a concrete predicate
- All three proposals touch the same module
- A proposal could be solved purely by reading one file
- A proposal requires the model to spin up Docker, fetch from the network, or run a local LLM
- The prompt was clearly drafted by paraphrasing an LLM — lacks the friction and specificity of a real bug report or feature ask

---

## Final Step

Write the assembled document to `one-shot-hard-prompts.md` in the repository root. After writing, print a one-line summary to the user: which three taxonomy tags you covered and the commit hash you pinned.
