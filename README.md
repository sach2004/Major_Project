# AI Software Archaeologist

Intelligent code understanding and change analysis for any Git repository.

## Run

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. `npm install` creates `.env`, generates the Prisma client and builds the local SQLite database automatically.

## Keys

Set one or both (in `.env` or in the app under Settings):

- `GEMINI_API_KEY`
- `OPENAI_API_KEY`

If one is missing or fails, the other is used. `GITHUB_TOKEN` is only for private repos. Without any key, graph analysis, impact, history and health still work; chat, explanations and written docs need a key.

## Requirements

Node 20.9+ (22 recommended) and Git (macOS: `xcode-select --install`).

## Troubleshooting

- Database errors after editing the schema: `npm run db:reset`
- A repo stuck on "Analyzing" after a restart: open it and click Try again / Re-analyze.
- Big monorepos: tune `MAX_FILES`, `MAX_COMMITS`, `MAX_EMBED_CHUNKS` in `.env`.

## Features

- Repository intake: GitHub URL, any Git URL, or local folder
- Static analysis into a knowledge graph (files, classes, functions, imports, calls, inheritance)
- Git history: commits, contributors, churn, co-change coupling
- Hybrid retrieval Q&A (graph traversal + vector search + BM25) with cited sources
- Change-impact prediction with risk score, ripple graph, related tests, AI assessment
- Generated documentation (overview, dependencies, health, per-module), Markdown export
- Architecture health: cycles, god files, hotspots, dead code, bus factor
- Auto-sync: built-in cron (`SYNC_CRON`, default every 30 min) plus `POST /api/cron/sync`
# Major_Project
