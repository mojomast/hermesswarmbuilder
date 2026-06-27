# Repository contents

This repository intentionally contains source/scaffold only.

Included:

- dashboard source
- runner source
- telemetry helper
- runner prompt
- installer scripts
- service template
- docs

Excluded:

- `~/.hermes/autonomous-projects/runs/`
- `~/.hermes/autonomous-projects/logs/`
- generated artifacts
- local autonomous project repos
- credentials and `.env` files
- ROMs/private data
- node_modules/build outputs

Before committing changes, check:

```bash
git status --short
git diff --stat
```

Do not commit runtime data or generated project outputs.
