# Generation eval

Measures how well the canvas generation pipeline serves a learner's starting question. It runs the app's **real** prompt builders and parser, not copies:

- `tutorInstructions` / `renderScopedContext` (`electron/prompts.ts`)
- `contextForNote` (`src/model/context.ts`)
- `firstLevelPrompt` (`src/model/kickoff.ts`)
- `expandPrompt` (`src/model/expand.ts`)
- `buildMapFromAI` (`src/model/boards.ts`)

## Run

```sh
source ~/.config/llm-test.env   # LLM_TEST_API_KEY, LLM_TEST_BASE_URL, LLM_TEST_MODEL
pnpm eval:generation
```

Without the three env vars, the script prints a skip message and exits 0. It is not part of CI.

The key is read only from env and is never written to results.

| Option                           | Effect                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `EVAL_TOPICS=attention,marathon` | Run only these topics.                                                                     |
| `EVAL_CONCURRENCY=3`             | Topics run in parallel (default 3). Steps inside a topic run one at a time, as in the app. |
| `EVAL_ROUND2=all`                | In round 2, expand every L2 card instead of the first one per branch.                      |
| `EVAL_OUT=dir`                   | Where results are written.                                                                 |

## What a run does

The 12 topics in `topics.ts` cover 6 question types. Each topic has a hand-written must-have checklist. For each topic, the harness:

1. Builds the first level the way 「铺成第一层」 does after a kickoff with no learner answers.
2. Round 1: expands every L1 card.
3. Round 2: expands the first child of each L1 branch.
4. Scores the tree.

Each request is built exactly like the app's: a virtual note on the anchor, the full review context, the system prompt plus the scoped context, and the user prompt. It uses `max_tokens` 32768 (as the app does for DeepSeek) and no temperature (the app sets none).

## Scoring

- **LLM judge** (same env model, rubric in `run.ts` `JUDGE_SYSTEM`). Each dimension is scored 1–5:
  - goal fit
  - coverage, plus an item-by-item checklist (gives `checklistCoverage`)
  - depth
  - non-redundancy
- **Code metrics** (`metrics.ts`):
  - pairwise character-bigram Jaccard of titles and title+body, with the near-duplicate rate (≥0.5)
  - new-information ratio per level: the share of a card's bigrams not already present in its ancestors or siblings
  - average body length per level

## Results

Results go to `evals/results/<timestamp>/`, which is gitignored: one JSON per topic, with every raw response, the tree, the metrics and the judgement, plus `summary.{json,md}`.

The reference baseline summary is committed under `evals/baseline/`. Compare new runs against it in each generation PR.

The app's default model is `gpt-4o-mini`. This eval uses the env model, so absolute scores depend on that model. Compare runs only when they use the same model.
