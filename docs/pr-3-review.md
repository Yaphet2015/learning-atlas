# PR #3 review (2026-10-20)

Compared `design-nits-v4` at `9989e4e` with current main `983fd8c` (through PR #13). PR #3 is open and conflicting; do not merge or rebase its v4 presentation changes wholesale.

| Original change                    | Current main                                                                                                                                                                                  | Decision                                                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 40% level-guide opacity            | v5 `34d126e` replaced the old pencil stroke with `--rule` (light alpha .16, dark .12).                                                                                                        | Superseded by v5 tokens; do not apply another opacity multiplier.                                                                                             |
| Single minimap viewport frame      | `2fbc672` already supplies 194×120 inline sizing and 1.25 stroke; CSS clips the SVG. Later sidebar/control work preserves it.                                                                 | Already present; keep current implementation.                                                                                                                 |
| Cross-link label midpoint and halo | v5 `34d126e` computes the cubic midpoint; label uses a 4px baseline adjustment, 6px paper halo and rounded joins.                                                                             | Already addressed; retain v5 rendering.                                                                                                                       |
| Fit-view clearance                 | Main uses scalar padding .16 (.22 on creation), including the minimap fit button omitted from #3's original change. Node bounds do not include cross-link curves/labels or the floating dock. | Still missing a guaranteed bottom clearance; share 8% top/sides + 160px bottom across fit entry points. The sidebar/drawer already resize the flow container. |
| Per-card prediction                | `StudyMode` stores it in component-local drafts; neither ConceptNode nor the strict node schema accepts it. Scene-level prediction is a different feature.                                    | Still missing; persist the latest prediction per card.                                                                                                        |

Prediction is user-authored learning data and should survive leaving study mode, reopening and ordinary save/load. This is a latest-value field, not a session history or a mastery assessment. Keep it hidden on canvas, independent of `hand` and `scene.prediction`. It is optional (no schema-version bump), limited to 2000 characters in both UI and validation, and included in JSON import/export and Markdown export.

Unlike #3's blur-only approach, input writes immediately to the existing board cache and uses the existing debounced autosave/close-flush path. Escape can unmount a focused textarea without blur. Input does not add a whole-board undo entry per keystroke. Empty/whitespace-only input removes the field. As with other board edits, this does not promise crash-proof disk persistence before the autosave runs.

## Validation

- `pnpm typecheck`: passed.
- `pnpm test`: 30 files, 276 tests passed, including schema limits, legacy boards and transfer preservation.
- `pnpm build`: passed (existing large-chunk warning).
- Focused web E2E: prediction focused-Escape/reopen/reload/navigation/clear; minimap visibility, reduced motion and relationship tracking; deep-map fit at heights 600 and 982 including bottom relation labels.
- Regression check: with original scalar .16 padding restored temporarily, both deep-map clearance tests failed; shared padding passed.
- Chromium 153 was obtained through a temporary npm package because Playwright's Chromium download returned a corrupt archive. No browser dependency was added to the project.
- macOS Electron packaging and desktop smoke tests were not run on this Linux host.

## Disposition

Split out the two remaining concerns into this fresh main-based replacement PR: prediction persistence and fit-view clearance. Close #3 as superseded once the replacement is accepted; do not maintain its conflicting v4 branch. Keep #3 open during replacement review so the original intent remains tracked. Closing #3 and deleting its branch are not part of this code change.
