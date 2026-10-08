# AGENTS.md — The Riverview

Read this before starting any task in this repo.

- Only start a new task when explicitly told to. Don't begin work on your own initiative.
- Work step by step / task by task. Don't do a large task in one pass — break it up.
- Stay within the user's requested scope. Ask only when missing information materially affects the result; proceed with already-authorized edits and necessary validation.
- Before making any change, check the surrounding code/context first to confirm the change is safe and will integrate smoothly. Don't edit blind.
- Keep code comments minimal — short, plain labels (e.g. `// signup`, `// login form`), not long explanations. Applies to new code, and to existing over-commented code encountered while working nearby.
- Before presenting a task as finished, double-check it for errors and confirm it still aligns with README.md and SECURITY.md.
- Once a task is done, stop and let the user review it. Don't run extra self-analysis afterward just to double-check further — that's not needed unless asked.

## Files and validation

- Do not create new Markdown files unless the user explicitly requests them. Do not generate feature plans, task summaries, progress logs, audit reports, changelogs, or duplicated documentation automatically. Explain plans and results in the chat.
- Update existing README.md or SECURITY.md only when the implementation makes their current content inaccurate. Keep one root AGENTS.md; do not create additional instruction files for ordinary feature work.
- Maintained behavior, integration, component, and browser tests and necessary synthetic fixtures are allowed for the portfolio improvement work. Keep requested API documentation, reviewer walkthroughs, and actual demo screenshots; remove unrelated temporary validation artifacts.
- When temporary validation files are necessary, keep track of them and remove all files and folders created for that validation before finishing, including after failed checks. Preserve maintained tests and pre-existing files unless their removal is authorized.
- Run checks relevant to the change and report their actual results. Do not claim live integrations or deployment were tested when only local or mocked checks ran.
- Reuse existing modules and dependencies. Do not add scaffolding, maintenance scripts, migrations, or dependencies unless the requested implementation needs them. Remove newly unused code introduced by the change.

## Git and publishing

- Work locally by default. Read-only Git inspection such as status, diff, and log is allowed.
- Do not run mutating Git commands such as init, add, commit, push, pull/fetch, checkout/switch, branch/worktree changes, merge/rebase, reset, clean, stash, tag, or remote changes unless the user explicitly requests that Git action. Editing project files for an authorized task is allowed; it does not authorize staging, commits, or publishing.
- Do not create GitHub repositories or pull requests, publish, or deploy unless the user explicitly requests that action.
- Do not add GitHub workflows, repository automation, or publishing configuration unless the user explicitly requests it. Do not remove or alter the existing .git directory.
- Never overwrite unrelated user changes, reset the checkout, or modify production data, real payments, or credentials as part of local validation.
