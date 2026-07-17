# Worker task (mailbox protocol)

Run directory: `{{RUN_DIR}}`
Mailbox: `{{RUN_DIR}}/mailbox/`

## Protocol (mandatory)
1. On start: write `mailbox/STATUS` = `watching`. Touch `mailbox/HEARTBEAT` with UTC ISO now.
2. Every ~5 minutes of work (and after each meaningful step): update `HEARTBEAT`.
3. Need a human/parent decision: write `mailbox/QUESTIONS.md`, set `STATUS=waiting_human`, update HEARTBEAT, then wait for `mailbox/ANSWER.md` (do not exit).
4. Finished: write `mailbox/RESULT.md` (outcome, commits, tests), set `STATUS=done`.
5. Hard failure: `STATUS=failed` and explain in RESULT.md.

## Task
{{TASK_BODY}}
