# AI SDLC Agents & Workflows

This repository uses a consolidated, 4-agent ecosystem to drive the Software Development Life Cycle (SDLC) while preventing artificial silos and infinite AI loops.

## The 4 Core Subagents

1. **`ProductManager`**: The "Why" and "What".
   - Handles ideation, writes rigorous implementation plans, and self-critiques those plans (acting as Devil's Advocate).
   - **Crucial Rule**: Will *always* request human sign-off on a plan before delegating to engineering, breaking the risk of infinite AI argument loops.
2. **`SeniorEngineer`**: The "How".
   - Handles all technical design, system architecture, security audits, Tailwind v4 aesthetics, and code implementation.
   - Acts as the Approver for PRs, ensuring the code matches the finalized plan perfectly.
3. **`TechnicalWriter`**: The "Source of Truth".
   - Ensures all markdown (including this file and `README.md`), PR descriptions, and architectural records are kept pristine.
4. **`GitOps`**: The "Deployer".
   - Handles version control strictly using native Git commands (`git add`, `git commit`, `git push`).
   - Uses Husky pre-commit hooks for CI validation, avoiding the need for brittle external PowerShell/Bash scripts.

## Workflows

### 1. The Planning Loop
- **Trigger**: Ask the `@ProductManager` to design a new feature.
- **Process**: The ProductManager will draft an `implementation_plan.md` and immediately try to tear it down (critique it). Once they create a solid draft, they will STOP and wait for your human approval. 

### 2. The Implementation Loop
- **Trigger**: Once you approve the plan, tell the `@SeniorEngineer` to execute it.
- **Process**: The SeniorEngineer will write the code, verify security constraints, and ensure Tailwind v4 styling.

### 3. The Deployment Loop
- **Trigger**: Ask `@GitOps` to push the code, and `@TechnicalWriter` to update docs.
- **Process**: `GitOps` will formulate a Conventional Commit message based on the diff and run `git push`. Husky hooks will intercept to guarantee zero lint/TypeScript errors before the push succeeds.
