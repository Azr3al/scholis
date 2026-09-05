# N+1 log analysis scripts

Tools for grouping nplusone JSONL captures into structured JSON for AI fix planning.

## Capture (dev only)

1. In `.env`: `DEBUG=true`, `NPLUSONE_ENABLED=true`
2. Optional: `NPLUSONE_RUN_ID=smoke-001` or request header `X-NPlusOne-Run-Id: smoke-001`
3. Run the dev server and exercise endpoints
4. Events append to `logs/nplusone/YYYY-MM-DD.jsonl`

Resolved captures are moved to `logs/nplusone/resolved/` with a `manifest.json` entry. Check `docs/NPLUSONE_PHASE2_BACKLOG.md` before triaging archived files.

## Summarize

From `schedjuice-reimagined-be/`:

```bash
./env/bin/python scripts/nplusone/summarize.py logs/nplusone/*.jsonl \
  --output logs/nplusone/reports/summary.json \
  --run-id smoke-001
```

Output schema: [`schema.json`](schema.json)

## Agent workflow

Full fix-planning steps: [`docs/NPLUSONE_AGENT_WORKFLOW.md`](../docs/NPLUSONE_AGENT_WORKFLOW.md)

Cursor rule (when editing views/querysets): [`.cursor/rules/nplusone-log-analysis-and-fixes.mdc`](../.cursor/rules/nplusone-log-analysis-and-fixes.mdc)

## Example agent prompt

```
Read logs/nplusone/reports/summary.json. Triage the top 5 groups by count.
For each group, locate the view, propose a fix using OptimizedSearchMixin /
ExpandPrefetchSpec or existing course_search_queryset factories, then implement.
Re-run summarize after a new capture to confirm counts dropped.
```
