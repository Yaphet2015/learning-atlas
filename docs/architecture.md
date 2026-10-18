# Architecture and safety

## Process boundary

The Electron main process owns files, SQLite and all provider credentials. The renderer is a React + TypeScript + React Flow canvas with `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. A CommonJS preload exposes narrow typed operations only. Main validates the sender and parses persisted/AI payloads with Zod. Navigation, popups and permission requests are denied; no arbitrary URL launcher is exposed. The renderer CSP does not permit provider connections or executable generated content.

Board documents are versioned JSON. `BoardStore` validates IDs and the full graph, rejects symlinks, serializes loads/writes/deletes per board, writes a temporary file, fsyncs it, renames it atomically, then fsyncs the directory. Normal close includes a renderer flush handshake. The UI reports save failures. This is crash-resistant local storage, not a guarantee against hardware failure or forced-kill loss of unsubmitted edits.

## AI ownership and persistence

Runtime imports the official pinned pi-durable API, including `Harness.open`, `openNodeSqliteStorage`, ownerless conversations, `configure`, session-scoped `defineDoc`, `watchEvents`, `submit` and `abort`.

One main-process owner and cached opening Promise owns each board/sticky SQLite file. Each note has an independently resumable ownerless conversation and session-scoped context document. The document receives a bounded snapshot of the relevant board context on each authorized request. Per-note files keep restarting one note from implicitly resuming other notes' interrupted paid requests.

Provider keys are explicitly entered and retained in main-process memory, or read from the specifically supported `OPENAI_API_KEY` environment variable for the official endpoint. They are never returned through IPC, stored in JSON/SQLite, embedded in renderer bundles or logged. A new endpoint cannot silently inherit another endpoint's key. No credential creation, OAuth grant or persistent access is performed. Raw provider error diagnostics are sanitized before persistence and display.

Runtime snapshots restore messages; streaming deltas update the visible answer, and committed final entries are authoritative. Request IDs and content fingerprints make retries idempotent and reject conflicting reuse. `getHistory` reads without resuming network work. Changing settings also makes no model call. An explicit question on a previously interrupted note aborts that note's old run and admits a new request. Stop cancels that note; switching boards does not cancel unrelated work.

## Context and learning semantics

`contextForNote` includes the original topic, the note's own body, explicit attachment/selection, relationship endpoints and a bounded adjacent branch. A scene attachment adds the live width/color, prediction and explanation. It excludes unrelated graph branches and every other note's text or chat history. The current note's durable conversation naturally retains its own prior messages.

The interface shows context references before submission. Free notes can be associated with a node or relation through the inspector. AI responses remain in notes; adding a response to the map opens an editing dialog and requires an explicit user action. Viewing/expanding a concept never marks it understood; self-assessment is a separate user control. Prediction, manipulation and explanation are optional, without forced tests or gates.

## Portable learning records

The versioned `.studyboard.json` transfer format contains one validated board and complete per-note text transcripts. Export reads durable history rather than the bounded renderer cache, carries cached exercise metadata, and refuses running conversations or failed history reads. It contains no provider settings, credentials, executable content or pending tasks. The same snapshot can be exported as Markdown. PNG captures all rendered knowledge cards and edges at map coordinates, independent of the current pan and zoom; it uses system fonts and limits raster size.

Import validates the complete file (up to 64 MB), allocates a new board ID, restores each transcript as passive model-context entries in that board's isolated SQLite databases, then publishes the board. A failed import removes its new board and databases. Imported entries use separate message IDs to avoid collisions with newly generated durable messages. Restoring and viewing transcripts never resumes scheduling; the recipient's explicit next question uses their own model configuration. Board JSON still caches only the most recent 200 messages. The drawer offers a separate complete-transcript reader. Browser preview retains imported full histories separately in localStorage and restores the previous history storage if saving the new board fails.

## Generated visuals

AI graph responses are data-only JSON, limited to a small number of nodes and edges. Optional process/parts/comparison visuals use bounded labels and a literal/analogy marker, rendered by trusted components. No model-authored HTML, SVG scripts, JavaScript, tools or arbitrary network resources are executed. React escapes plain text. AI claims are not automatically verified.

## Verification boundaries

Unit tests cover model invariants, scoped context, safe parsing, storage failures and symlink/traversal protection. Runtime tests use real Harness/SQLite with an offline simulated transport, never a paid provider, and cover key safety, streaming, isolation, cancellation, replay and interrupted-run recovery. They are not evidence of a successful live OpenAI call.

The workflow runs an actual Electron embedded-Node SQLite + Harness close/reopen smoke, renderer interactions, and ARM64 packaging on macOS. Preview bundles use ad-hoc signing with the Electron JIT/library-validation entitlements required for that mode. Developer ID signing and Apple notarization are not configured; no system security settings are changed. Inspect the exact workflow result before claiming a downloadable build is ready.
