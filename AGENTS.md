# Codex Development Workflow

- Before making project changes, create or switch to the `codex-dev` branch based on the repository's current default branch.
- Do not commit directly to `main`, `master`, or another default/protected branch.
- Treat `codex-dev` as the working integration branch for Codex changes.
- After each coherent progress checkpoint, commit the relevant changes and push `codex-dev` to `origin` before reporting that progress as complete.
- Keep unrelated user changes out of Codex commits and pushes.
- Update the default branch only after relevant validation passes, the project is stable, and the user gives explicit permission for that specific update.
