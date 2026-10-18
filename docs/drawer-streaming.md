# Drawer streaming style: what came from Beautiful UI

Source studied: https://www.beautifului.dev/ (repo github.com/slev12397/beautiful-ui,
commit 44a274e, MIT, © 2026 Shane Levine). MIT is compatible with this app; even so,
no code was copied. The patterns below were rebuilt in plain CSS/React on the v5 tokens
(ink, paper, accent, LXGW WenKai). The upstream SidebarNav uses a commercial icon set
(`@central-icons-react`); none of it is used here (icons stay Lucide).

| Beautiful UI primitive | Adopted in the drawer | Not adopted |
| --- | --- | --- |
| LoadingState | 3×3 pixel grid with a chevron wavefront (650ms), shimmering label, live elapsed time in tabular figures; reduced motion freezes grid and shimmer, the timer still ticks (`StreamStatus.tsx`) | Orbit/Surfer variants, video |
| ThinkingState | "正在思考" → "正在回答" header phases on the live message | expandable step/reasoning traces (the tutor exposes no reasoning events) |
| StreamingText | slim 2px caret; actions row fades in only after the answer settles | per-word blur reveal (answers render as parsed blocks, so new *blocks* rise in instead), source chips, follow-up list (AnswerActs already covers it) |
| ChatComposer / Chat | user turn as a soft right-aligned block (already v5); composer focus as a firmer outline plus a soft lift instead of a 3px ring; send button colour/press transitions | tabs header (our session strip, item 2, plays that role), Tailwind tokens |
