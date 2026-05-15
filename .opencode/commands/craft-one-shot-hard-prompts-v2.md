---
name: craft-one-shot-hard-prompts-v2
description: Analyze the active codebase in depth and propose three one-shot "hard prompts" suitable for evaluating frontier coding models or generating RL training data.
---

# Craft One-Shot Hard Prompts

This command produces three proposals for a coding-model evaluation pipeline. Each proposal is a single prompt, hard enough that a Claude Opus class model either fails it or spends more than ten minutes on it. The proposals are reviewed by working AI engineers, so the quality bar is "would a senior engineer accept this as a real eval item", not "looks impressive".

The model that receives the prompt gets a fresh container, one turn, no prior context, and the repo at a pinned commit. Everything the model needs has to live in that prompt or be discoverable from the code. Nothing else.

---

## Operating Principles

1. The repo is the source of truth. Do not invent files, modules, APIs, or behaviors. Every claim in a prompt has to be verifiable by reading the code.
2. Hardness comes from the codebase, not from artificial constraints. If the prompt is hard only because you stacked rules on top of it, throw it out.
3. One prompt, one concrete goal. No multi-part shopping lists.
4. Rubrics have to be machine-checkable in principle. A verifier function or a grader agent should be able to apply each one without guessing.
5. Write like a working developer filing a tracked issue, not like an LLM. Drop the "I want you to...", drop the bullet preambles, drop the polished three-part lists.

---

## Workflow

Run the phases in order. Parallelize inside each phase where it makes sense.

### Phase 1, Reconnaissance (parallel, background)

Fire these before forming any opinion:

- `task(subagent_type="explore", run_in_background=true, ...)` to map the architecture: entry points, module boundaries, build and test layout, hot files (high churn against high LOC), state machines, IPC surfaces, concurrency primitives, anything that looks fragile or load-bearing.
- `task(subagent_type="explore", run_in_background=true, ...)` to surface candidate hardness: long files, deeply nested logic, unusual algorithms, performance-sensitive paths, tricky type code, custom protocols, places where existing comments warn future developers.
- `task(subagent_type="librarian", run_in_background=true, ...)` for any non-obvious external dependency. Pull the current official docs and at least one production reference implementation.

While those run, use `sentrux-mcp` if available to pull `health`, `dsm`, `git_stats`, and `test_gaps`. Use `tracelattice_sequentialthinking_tools` to keep your candidate ranking organized.

End your turn after firing. Wait for the completion notification before resuming.

### Phase 2, Candidate Generation

Brainstorm 6 to 10 candidate prompts internally. For each one, jot down:

- The exact files and code paths it touches
- Which difficulty class it falls into (taxonomy below)
- Why a frontier model is likely to fail or spend more than ten minutes on it
- Whether the change is something a real maintainer would actually merge

Discard any candidate that:

- Could be solved by a competent junior in under ten minutes
- Requires network access, Docker, a local LLM, secrets, or any external service to verify
- Reads as toy work (CRUD scaffolds, "add a hello endpoint")
- Is a known open-source issue with a public merged fix
- Asks the model to "find what's wrong" without a concrete goal
- Is a pure documentation, formatting, or rename pass

### Phase 3, Difficulty Calibration (consult Oracle)

For your top 4 or 5 candidates, consult Oracle in a single batched call:

```
task(subagent_type="oracle", run_in_background=false, load_skills=[], prompt="<for each candidate: the proposed prompt, the affected files, your hardness hypothesis, and the rubric draft. Ask: which of these would actually stall Opus past ten minutes or cause a wrong-but-plausible solution? Which feel artificial?>")
```

Use Oracle's verdict to drop the artificial or weak ones. You should still have at least three candidates standing for the next phase. The three need to be distinct from each other.

### Phase 4, Empirical Hardness Probe (parallel, background)

Oracle's opinion is a sanity check. The real question is whether a strong model actually struggles. Probe the surviving candidates with `ultrabrain` running the prompts as the eval model would receive them.

For each surviving candidate, fire one probe in parallel:

```
task(category="ultrabrain", run_in_background=true, load_skills=[], prompt="<the candidate prompt, exactly as it would be sent to the eval model, plus a short note: 'This is a hardness probe. Solve the task. Report the time you spent reasoning, your confidence, and any place you got stuck or had to guess.'>")
```

End your turn after firing. Wait for the completion notifications.

Score each candidate from the probe results:

- Solved correctly in well under the budget, high confidence: **too easy**, drop it.
- Solved correctly but only after long reasoning, or with low confidence: **borderline**, keep but flag.
- Solved incorrectly, partially, or not at all: **strong candidate**, keep.

Cuts can take you below three. If that happens, loop back to Phase 2, generate more candidates, and re-probe. Do not lower the bar to fill the slate.

Caveats to keep in mind, do not pretend they don't exist:

- `ultrabrain` is not `Claude Opus`. A prompt ultrabrain solves may still stall `Claude Opus`, and the reverse. The probe is a useful filter, not a verdict.
- Treat `ultrabrain's` self-reported time and confidence as soft signals. Weight the correctness of its diff much more heavily.

### Phase 5, Drafting

Draft each survivor using the per-proposal template. Then run the self-audit gate before writing the file.

### Phase 6, Self-Audit Gate

Before writing output, walk through every item in `./Project-Proposals-Checklist.md` for each of the three proposals. If anything fails, revise. Re-check at minimum:

- Prompt is in natural developer voice, not LLM voice
- No subjective words in rubrics ("clean", "proper", "good", "robust", "well-designed", "appropriate", "modern")
- Each rubric is one binary condition a verifier could evaluate from a diff plus a test run
- The three proposals exercise different parts of the repo and different failure modes
- The final goal of each prompt is unambiguous and concrete
- No prompt requires the model to invent its own acceptance criteria

### Phase 7, Output

Write the final document to `one-shot-hard-prompts.md` in the repository root, using the format below.

---

## Difficulty Taxonomy

Pick from these. Aim for diversity across your three picks.

- Cross-cutting refactor. Change a contract that ripples through many call sites; the type system and the test suite both have to stay green.
- Concurrency or state-machine bug. Race, deadlock, lost wakeup, reentrancy, ordering invariant.
- Performance under constraint. Hit a measurable budget (latency, memory, allocations) without breaking semantics.
- Algorithmic or data-structure work. Replace an O(n²) hot path, or implement a non-trivial algorithm with the edge cases handled.
- Protocol or serialization correctness. IPC, network, or on-disk format with backward compatibility constraints.
- Build or toolchain plumbing. Bundler, codegen, monorepo wiring where the failure mode is silent.
- Subtle semantic bug. The code passes lint and types but fails on a specific input class the existing tests don't cover.
- API surface migration. Deprecate-and-replace across consumers with no behavior drift.

---

## Per-Proposal Template

Each proposal has exactly three sections. No extra commentary.

### Prompt

The exact text you would paste into a fresh model session. Written the way a developer would write it: short, specific, no meta-instructions ("you are an expert..."), no rule lists, no leakage of the rubric. Reference real files by path. Reference real symbols by name. State the goal in one or two sentences. If a real user would naturally include a stack trace, an error message, or a failing test output, paste it verbatim from the repo.

Length guidance: usually 3 to 10 sentences. Past about 200 words, you are over-specifying.

### Difficulty Explanation

Two to four sentences, addressed to the human reviewer, not the model. Name the specific trap. Which assumption is wrong? Which invariant is non-obvious? Which interaction across files is easy to miss? Which test does the obvious fix break? Avoid generalities like "requires deep understanding". Say what understanding, and why it is hard to acquire from one read of the code.

### Rubrics

At least 3, ideally 4 to 6, binary criteria. Each rubric must:

- Be evaluable as true or false from the model's diff plus a test run plus a greppable property
- Reference concrete files, symbols, or behaviors
- Avoid subjective adjectives
- Test a property the other rubrics do not already cover

Good rubric shape:

> "After the change, `<symbol>` in `<path>` is invoked exactly once per `<event>`; verifiable by adding a counter and running `<existing test command>`."

> "The exported public API of `<module>` is unchanged: `git diff --stat` shows no modifications to `<file>`'s export list, and no consumer in `<dir>` requires source edits."

> "The new implementation passes the existing test suite (`<command>`) and additionally handles input class `<X>`. A regression test exercising `<X>` exists and passes."

Bad rubric shape, do not produce:

> "The code is clean and well-modularized." (subjective)
> "Performance is improved." (unmeasurable)
> "There are enough tests." (subjective)

---

## Output Document Format

Write `one-shot-hard-prompts.md` with this exact structure:

```markdown
# One-Shot Hard Prompt Proposals

Repository: <name>
Pinned commit: <git rev-parse HEAD>
Author notes: <one or two sentences on what aspects of the repo you targeted and why these three are distinct>

---

## Proposal 1, <short descriptive title (taxonomy tag)>

### Prompt
<the prompt text>

### Difficulty Explanation
<2 to 4 sentences>

### Rubrics
1. <binary rubric>
2. <binary rubric>
3. <binary rubric>
4. <binary rubric, optional>

---

## Proposal 2, <short descriptive title (taxonomy tag)>
...

---

## Proposal 3, <short descriptive title (taxonomy tag)>
...
```

Capture the current commit hash in the header so the proposal is reproducible.

---

## Tools and Agents to Leverage

- `task(subagent_type="explore")` for codebase grep with context. Fire several in parallel.
- `task(subagent_type="librarian")` for external docs, OSS reference implementations, and API correctness.
- `task(subagent_type="oracle")` for calibration. "Is this actually hard? Are any of my constraints artificial?"
- `task(category="ultrabrain")` for the empirical hardness probe in Phase 4. Used as a difficulty floor, not as a reviewer.
- `sentrux-mcp` for `health`, `dsm`, `git_stats`, `hotspots`, and `test_gaps`. Useful for finding real risk areas backed by churn, coupling, and coverage data.
- `tavily-mcp` for current best practices, recent CVEs, or library behavior changes that may have invalidated assumptions baked into the repo.
- `tracelattice_sequentialthinking_tools` for ranking 8+ candidates against multiple criteria.

Default to background parallel fanout in Phases 1, 2, and 4. Default to a synchronous `Oracle` agent call in Phase 3.

---

## Required Reading

Before submitting, re-read `./Project-Proposals-Checklist.md` and verify every box passes for each of the three proposals. The checklist is a hard gate, not a suggestion.

---

## Anti-Patterns

If your draft has any of these, throw it out and start over.

- Prompt mentions "best practices", "production-quality", or "industry standard"
- Prompt enumerates the implementation steps the model should follow
- Prompt uses the word "comprehensive" or "robust"
- Rubric uses "appropriately", "properly", or "correctly" without a concrete predicate behind it
- All three proposals touch the same module
- A proposal can be solved by reading one file
- A proposal requires Docker, network fetches, or a local LLM
- The prompt reads like an LLM paraphrased a real bug report, missing the friction and specificity of how a real engineer would have asked

---

## Final Step

Write the assembled document to `one-shot-hard-prompts.md` in the repository root. After writing, print a one-line summary to the user: which three taxonomy tags you covered and the commit hash you pinned.
