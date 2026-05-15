---
name: craft-one-shot-hard-prompts
description: Analyze the current codebase thoroughly, propse one shot hard prompts to enabling recursive self-improvement of code quality
---

The file at `.opencode/commands/craft-one-shot-hard-prompts.md` is AI coding agent command describe to thoroughly analyze the current codebase. Maximize the cappability by:
    - Using MCP servers: `sentrux-mcp`, `tavily-mcp`, `tracelattice`.
    - Collaborate with @explore, @librarian and @oracle agents

Scan the entire codebase and review it in multiple aspects and craft 3 results with the output format bellow. You must to distinguish the outputs.

## Output format

- **Prompt** — The exact prompt you sent to the model. Must be what you actually typed in the container.

- **Difficulty Explanation** — 2-4 sentences on why this coding task is hard. Be specific: where do models typically fail? What makes the correct solution non-obvious?

- **Rubrics** — At least 3 specific criteria describing the ideal solution. These will be used by reviewers to evaluate answers. Write them yourself — be specific enough that another person could apply them.

## What Makes a Good Proposal

**Required:**

- Hard enough that **Claude Opus** takes >10 minutes **OR**
- Hard enough that **Claude Opus** fails to solve the problem
- First prompt sent to the model (each submission is a fresh start)
- Real existing repository with a pinned commit hash
- At least 3 specific, evaluable rubrics
- Prompt must be in the model conversation inside the container

**Good prompts:**

- Complex refactors across multiple files
- Performance optimization with specific constraints
- Difficult algorithm implementations
- Bug fixes requiring deep codebase understanding
- Systems-level work (networking, concurrency, memory management)

## Key Rules

- **One prompt per submission.** Each submission is independent — no carrying over context from previous submissions.
- **You can reuse repos** — 2-3 prompts on the same repo is OK, but different repos are preferred for distribution.
- **You don't need to fix the model's failures.** If the model fails on your hard prompt, that's expected.
- **Keep working while waiting.** Submit multiple proposals. Don't wait for reviews. Reviewers are working through the backlog.
- **Rubrics are YOUR job.** Write specific expectations for the ideal solution. Don't ask Cosmo or the model to generate them.

## Rubrics

Rubrics should be self contained, true/false, conditions that we can apply to the changes made by the model. The rubrics should be clear, objective and relevant to the prompt. Use examples if anything might be unclear. Examples:

**Example Coding Prompt:**

Fix the memory leak in `process_large_file(filename)` by ensuring the file is always closed, even on exceptions. Use a context manager. Do not change the processing logic.

**Example Rubric:**
File is properly closed. The changed code uses `a with open(...) as f:` block (or equivalent contextlib context manager) around all file operations, and there is no bare `open()` call without a matching `.close()` in a finally block in the modified function.

## Checklist

Refer to file `./Project-Proposals-Checklist.md` for the details.

## Final step

Write down the output to markdown file named `one-shot-hard-prompts.md` in the root directory.
