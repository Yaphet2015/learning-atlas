# Architecture and safety

## Process boundary

The Electron main process owns files, SQLite and all provider credentials. The renderer is a React + TypeScript + React Flow canvas with `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. A CommonJS preload exposes narrow typed operations only. Main validates the sender and parses persisted/AI payloads with Zod. Navigation, popups and permission requests are denied; no arbitrary URL launcher is exposed. The renderer CSP does not permit provider connections or executable generated content.

Board documents are versioned JSON. `BoardStore` validates IDs and the full graph, rejects symlinks, serializes loads/writes/deletes per board, writes a temporary file, fsyncs it, renames it atomically, then fsyncs the directory. Normal close includes a renderer flush handshake. The UI reports save failures. This is crash-resistant local storage, not a guarantee against hardware failure or forced-kill loss of unsubmitted edits.

## AI ownership and persistence

Runtime imports the official pinned pi-durable API, including `Harness.open`, `openNodeSqliteStorage`, ownerless conversations, `configure`, session-scoped `defineDoc`, `watchEvents`, `submit` and `abort`.

One main-process owner and cached opening Promise owns each board/sticky SQLite file. Each note has an independently resumable ownerless conversation and session-scoped context document. The tutor document receives the learner's selected references. Canvas-enabled conversations and organization tasks read cards through bounded tools; full canvas contents are stored locally in a separate Pi document and are never injected into a prompt section. Per-note files keep restarting one note from implicitly resuming other notes' interrupted paid requests.

Provider keys are explicitly entered and retained in main-process memory, or read from the specifically supported `OPENAI_API_KEY` environment variable for the official endpoint. They are never returned through IPC, stored in JSON/SQLite, embedded in renderer bundles or logged. A new endpoint cannot silently inherit another endpoint's key. No credential creation, OAuth grant or persistent access is performed. Raw provider error diagnostics are sanitized before persistence and display.

Runtime snapshots restore messages; streaming deltas update the visible answer, and committed final entries are authoritative. Request IDs and content fingerprints make retries idempotent and reject conflicting reuse. `getHistory` reads without resuming network work. Changing settings also makes no model call. An explicit question on a previously interrupted note aborts that note's old run and admits a new request. Stop cancels that note; switching boards does not cancel unrelated work.

## Context and learning semantics

`contextForNote` includes the original topic, the note's own body, explicit attachment/selection, relationship endpoints and a bounded adjacent branch. A scene attachment adds the live width/color, prediction and explanation. The conversation may read other branches of the current canvas on demand. Explicitly excluded cards remain protected; tools never expose another note's text or conversation history, or another canvas. The current note's durable conversation naturally retains its own prior messages.

The interface shows context references before submission. Free notes can be associated with a node or relation through the inspector. Explanatory AI responses remain in notes. Explicit user editing requests may use canvas tools; their changes appear as temporary previews and are committed after validation. The existing manual add-to-map editing dialog remains available. Viewing/expanding a concept never marks it understood; self-assessment is a separate user control. Prediction, manipulation and explanation are optional, without forced tests or gates.

## Canvas Agent transactions

One canvas extension provides structure/search, bounded card reads (8 cards / 16,000 characters), atomic edit batches (20 operations / 16,000 characters), versioned review confirmations and explicit completion. Both ordinary conversations and organization use it. Organization must cover every current card and cross-link; chat edits cover the affected neighbourhood. The original question retains its identity, while several roots and required ancestors remain valid.

A conversation-scoped Pi document holds each run's base, draft, operation batches, reviewed versions and tool-call receipts. Editing and receipt writes share one SQLite transaction. A replay-safe tool therefore returns its previous result rather than applying the edit again. Completed runs retain metadata rather than full workspace snapshots. Automatic compaction is enabled with a canvas working window capped at 96K tokens; the exact work ledger remains outside the model context. A slice pauses at 128 requests or 15 minutes.

Before its first write the renderer flushes current data and acknowledges the preview lock. The store compares the base canvas and permits one writer per board. The renderer keeps the preview separate from its saved Board. Final commit applies operations to the latest Board, preserves concurrent notes, and stores a run receipt plus a canvas version. Late saves using an earlier canvas version are rejected. The run receipt makes recovery across the SQLite/JSON commit gap idempotent. A committed result is one undo step.

Normal close pauses unfinished work. Reopening only lists work; it never resumes model requests automatically. Continue and abandon are explicit actions in the canvas history. Cancelling or failing discards the visible preview. Deleted/merged cards keep portable source records; merge redirects notes and references without inventing mastery. Source restoration retains the original ID, content and recoverable bindings.

## Portable learning records

The versioned `.studyboard.json` transfer format contains one validated board and complete per-note text transcripts. Export reads durable history rather than the bounded renderer cache, carries cached exercise metadata, and refuses running conversations or failed history reads. It contains no provider settings, credentials, executable content or pending tasks. The same snapshot can be exported as Markdown. PNG captures all rendered knowledge cards and edges at map coordinates, independent of the current pan and zoom; it uses system fonts and limits raster size.

Import validates the complete file (up to 64 MB), allocates a new board ID, restores each transcript as passive model-context entries in that board's isolated SQLite databases, then publishes the board. A failed import removes its new board and databases. Imported entries use separate message IDs to avoid collisions with newly generated durable messages. Restoring and viewing transcripts never resumes scheduling; the recipient's explicit next question uses their own model configuration. Board JSON still caches only the most recent 200 messages. The drawer offers a separate complete-transcript reader. Browser preview retains imported full histories separately in localStorage and restores the previous history storage if saving the new board fails.

## Generated visuals

AI graph responses are data-only JSON, limited to a small number of nodes and edges. Optional process/parts/comparison visuals use bounded labels and a literal/analogy marker, rendered by trusted components. Model-authored HTML, SVG scripts and JavaScript are never executed. Canvas tool calls run only registered, schema-validated domain operations; there are no arbitrary filesystem, shell or network tools. React escapes plain text. AI claims are not automatically verified.

## Verification boundaries

Unit tests cover model invariants, scoped context, safe parsing, storage failures and symlink/traversal protection. Automated runtime tests use real Harness/SQLite with a simulated provider transport, and cover key safety, streaming, isolation, cancellation, replay and interrupted-run recovery. They are not evidence of a successful live OpenAI call.

The workflow runs an actual Electron embedded-Node SQLite + Harness close/reopen smoke, renderer interactions, and ARM64 packaging on macOS. Preview bundles use ad-hoc signing with the Electron JIT/library-validation entitlements required for that mode. Developer ID signing and Apple notarization are not configured; no system security settings are changed. Inspect the exact workflow result before claiming a downloadable build is ready.

For an authorized live provider check, load `DS_API_KEY` and `DS_BASE_URL` in the shell and run `pnpm test:agent:live`. The Electron script follows the system proxy and uses only temporary boards. It checks organization, conversation CRUD, merge/archive, idempotent commit and source restoration, then removes the temporary data. Credentials and provider payloads are not logged.
