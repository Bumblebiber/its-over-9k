# Result schema

One JSON file per run, written by `run-bench.sh`, named
`<combo>-<model>-<date>.json`.

```json
{
  "combo": "o9k+serena+hmem",         // label of the combo under test
  "model": "sonnet",                   // claude model alias used
  "tasks_hash": "a1b2c3d4e5f6",        // hash of tasks/ — must match to compare
  "target_ref": "bench-target-v1",     // pinned target repo ref
  "date": "2026-07-16T12:00:00Z",
  "claude_code": "1.x.y (Claude Code)",
  "passed": 5,
  "total": 5,
  "total_cost_usd": 0.42,
  "total_output_tokens": 12345,
  "tasks": [
    {
      "task": "t1-orient",
      "pass": true,
      "turns": 7,
      "duration_ms": 41000,
      "cost_usd": 0.06,
      "input_tokens": 120,
      "output_tokens": 2100,
      "cache_read_tokens": 90000,
      "cache_creation_tokens": 15000
    }
  ]
}
```

Comparison rules:

1. Only compare runs with identical `tasks_hash` + `target_ref` + `model`.
2. `passed` ranks first. Cost only breaks ties at equal-or-better `passed`.
3. In the PR description, state what was installed in the sandbox
   (plugins + MCP servers with versions) — the combo label alone is not
   reproducible.
