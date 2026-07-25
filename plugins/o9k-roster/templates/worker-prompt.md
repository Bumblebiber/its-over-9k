# Worker task (mailbox protocol)

Run directory: `{{RUN_DIR}}`
Mailbox: `{{RUN_DIR}}/mailbox/`
Run id: `{{RUN_ID}}`

## Protocol (mandatory — parent is blocked on this)

The parent chat **cannot see your tmux pane**. It only wakes when mailbox
`STATUS` becomes `done`, `failed`, or `waiting_human`. Writing `PLAN.md` /
`RESULT.md` in the task cwd is **not enough** — you must close the mailbox.

1. On start: write `mailbox/STATUS` = `watching`. Touch `mailbox/HEARTBEAT` with UTC ISO now.
2. Every ~5 minutes of work (and after each meaningful step): update `HEARTBEAT`.
3. Need a human/parent decision: write `mailbox/QUESTIONS.md`, set `STATUS=waiting_human`, update HEARTBEAT, then wait for `mailbox/ANSWER.md` (do not exit).
4. Finished:
   - Write task-dir artifacts (`PLAN.md`, `GRILL.md`, code, …) as required by the task.
   - Write `mailbox/RESULT.md` (outcome summary, paths to artifacts, commits, tests).
   - Set `mailbox/STATUS` = `done` (or run: `node <o9k-roster>/scripts/runs.mjs set-status {{RUN_ID}} done`).
   - Then you may stop.
5. Hard failure: `STATUS=failed` and explain in `mailbox/RESULT.md`.

Do **not** leave STATUS=`watching` after you finished the work. That traps the parent watcher forever.

## Task
{{TASK_BODY}}
