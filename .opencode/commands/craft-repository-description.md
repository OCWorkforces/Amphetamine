---
name: craft-repository-description
description: Analyze the current codebase thoroughly and craft a brief for repository description
---

# Craft repository description

Analyze the codebase thoroughly and produce a repository description of no more than three sentences, written in formal prose.

## Instructions

1. Read `AGENTS.md`, `README.md`, `package.json`, and the top-level directory listing to understand the project's purpose, architecture, and technology stack.
2. Identify the core problem the software solves, the main technical approach, and any notable design characteristics (language, runtime, key constraints).
3. Synthesize your findings into a description that is:
   - 1–3 sentences, hard maximum.
   - Third person, no contractions, no marketing language.
   - Factually precise: every claim must be verifiable from the codebase.
   - Dense enough that a reader unfamiliar with the project can assess its scope and purpose without further context.

## Output format

Write the description to a file named `repository-brief.md` at the repository root. The file must contain only the description text — no headings, no bullet points, no preamble, no trailing commentary.
