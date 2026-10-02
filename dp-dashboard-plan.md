# DP dashboard — build plan

**Status 2026-09-30: built** (`dp-road-network.html`, `assets/dp.js`). Kept as the design
record; the README describes what exists. The stat-tile clip (§5) is fixed.

Written 2026-09-30, after checking `dijkstra-road-network.html` (sound, see bottom).
Target file: `dp-road-network.html` + `assets/dp.js`. Same look, same controls, same
step-per-arithmetic-line pace as the Dijkstra page. Builds on script Ch 5; if this
file and the script disagree, the script wins.

## 1. Scope (recommendation: two instances, one engine)

| Instance | Script | Direction | Table it replays | Steps |
| --- | --- | --- | --- | --- |
| Road network A–E | §5.2, Table 5.1 | backward, `g(E) = 0` | Node / g / via, 5 columns | ~16 |
| Alpspitz lot-sizing | §5.4, Tables 5.2–5.3 | forward, `F(1) = 0` | Node / F / via, 5 columns | ~20 |

Both are "shortest path over nodes that are already in order", which is exactly the
script's point (§5.6.1: every DP here is a shortest path through a graph of states).
One engine, two configurations. Equipment replacement (§5.5) is **not** in v1: a
10-year × 5-age table with two decisions per cell is ~90 arithmetic lines, beyond the
paper rule, and frames 20–21 are the session's first casualty anyway. It can be a
third instance later without touching the engine (nodes = (year, age) pairs).

Why the road network comes first: Session 3 opens by reading the Session 2 network
backwards (COURSE_RESTRUCTURE.md, Deck 4 outline frame 7). Why lot-sizing is not
optional: Table 5.3 is the exam-relevant DP table, and exercise 3 (setup-cost
thresholds) only works if K is editable.

## 2. Engine `assets/dp.js`

Pure, dependency-free, same shape as `dijkstra.js`.

```
DP.solve({
  nodes:     ["A","C","B","D","E"],        // solving order (topological); see §3
  arcs:      [{ from:"A", to:"B", c:4 }, ...],
  direction: "backward" | "forward",
  // backward: value(last node) = 0, walk nodes in reverse, candidates = arcs OUT of node
  //           value(i) = min over (i,j) { c_ij + value(j) }
  // forward:  value(first node) = 0, walk nodes in order, candidates = arcs INTO node
  //           value(j) = min over (i,j) { value(i) + c_ij }
})
→ { events, value, via, path, total, reachable }
```

Events, each with `snap = { value, via, solved[] }` after the event:

| type | fields | narration |
| --- | --- | --- |
| `init` | `terminal` | value 0 at E (or node 1); the recursion in words |
| `open` | `node, arcs[]` | "At C there are three roads out: …" (or "none" → ∞) |
| `candidate` | `node, other, c, otherValue, total, bestSoFar, isBest, tie` | `1 + 7 = 8`, best so far |
| `close` | `node, value, via, candidates[]` | "g(C) = 8 via B; the direct road loses by 2" |
| `done` | `path, total` | read the via row from A (or back from node 5) |
| `unreachable` | `node` | every candidate ∞ (only after editing) |

Rules to state in the narration and keep in sync:
- Ties go to the candidate listed first (arcs kept in input order; for lot-sizing that is
  the smaller `i`, i.e. the longer run). At exactly K = 24,000 both Alpspitz plans cost
  96,000; the page must say so rather than silently pick.
- `unreachable` can only happen on an edited road network (a closure cutting E off).

## 3. Road-network instance: where the orientation comes from

The script orients roads by Dijkstra's finalization order (§5.2, §5.7.1). Do the same
live: the page loads `assets/dijkstra.js`, runs it on the current (possibly edited)
undirected network, takes `order`, and orients every open road from the earlier-finalized
end to the later one. Then `DP.solve` runs backward from the target.

Consequences worth showing on screen:
- Arrowheads on every road (the orientation *is* the concept being taught). A one-line
  strip above the network: "Orientation: Dijkstra finalized A, C, B, D, E → roads point
  forward in that order".
- The edit panel is reused unchanged (lengths, closures, endpoints, reset badge). Closing
  C–E — the "your turn" of Deck 4 frame 12 — removes one candidate at C and changes no
  value, and the students did the forward version last week on the same panel.
- A "Compare: Dijkstra, forward" link opening `dijkstra-road-network.html#14` in a new tab.
  Kept as a link, not a toggle (decision 2026-09-30: separate tools).

Node positions and the SVG drawing code come from `DEFAULT` / `renderNet()` in the
Dijkstra page; the only additions are the arrowheads and a "value pill" replacing the
tentative-distance pill.

## 4. Lot-sizing instance

Data block (script §5.4): `d = [5000, 2000, 9000, 14000]`, `K = 60000`, `h = 12`.
Nodes 1…5 in a row, arcs `(i, j)` for `i < j` drawn as arcs above the line, exactly as
Figure 5.1 (long arcs higher). Arc cost computed on the page:
`c_ij = K + h · Σ_{t=i}^{j-1} (t − i) d_t`, shown in the collapsible "The arcs" panel as
Table 5.2 (arc, covers, cost) so the student sees where 84,000 comes from.

Editor for this instance: the four demands, K, h; Apply / Reset to script values; the
same badge. This is what makes exercise 3 demonstrable: K < 24,000 → four runs;
168,000 → two runs (1→3→5); 552,000 → one batch (1→5). All three verified 2026-09-30.

The right panel shows: the F / via table filling left to right, and below it a
"candidates at node j" mini-table (`F(i) + c_ij = total`, best row highlighted). The
mini-table is the paper computation; the table row is what goes on the exam.

At `done`: path 1→3→4→5 highlighted, and the plan in words (Q1 7,000 · Q2 – · Q3 9,000 ·
Q4 14,000), 204,000 + 5,400,000 = 5,604,000. Do not show the Chapter 4 comparison
(Table 5.4) — that is a slide, not a dashboard step.

## 5. Page layout

Same skeleton as the B&B page: instance switch (two `.btn`s) above a collapsible panel
("Edit the network" / "The arcs and costs"), sticky bar with Reset/Prev/Next/dots/step
pill and narration, then a two-panel grid (drawing left, table + stats + result right).
Stats tiles: Current node · Candidate · Comparison · Solved so far. Keyboard ← / →,
Home; deep links `#road-7`, `#lot-12`.

Stat values wrap (`white-space: normal`) — the Dijkstra page's "Checking road" tile clips
at 1280 px because of `nowrap` (`#stats .stat-value` in `dashboard.css` line 451). Fix
there once; both pages benefit.

## 6. Acceptance tests (run in node before the page is wired)

1. Road network, script instance: g = E 0 · D 2 · B 7 · C 8 · A 10; via E, D, B, C;
   path A→C→B→D→E; candidates at C read `1+7=8, 8+2=10, 10+0=10`, at A `4+7=11, 2+8=10`.
2. Road network, C–E closed: same values, C has two candidates.
3. Lot-sizing, script data: Table 5.2 costs exactly; F = 0, 60,000, 84,000, 144,000,
   204,000; via –, 1, 1, 3, 4; path 1→3→4→5.
4. Lot-sizing thresholds: K = 23,999 → 1→2→3→4→5; 168,000 → 1→3→5; 552,000 → 1→5.
5. Render steps 1, mid, last of each instance with headless Edge and look
   (`msedge --headless=new --screenshot=… file:///…/dp-road-network.html#lot-12`).

## 7. Files to touch when built

- new: `dashboards/dp-road-network.html`, `dashboards/assets/dp.js`
- `dashboards/README.md`: file list + "to drive another instance" paragraph
- `dashboards/assets/dashboard.css`: `.dp-*` classes, the `nowrap` fix
- `COURSE_RESTRUCTURE.md` checklist line "Bellman / DP table dashboard" → done
- `slides_2026/4_dynamic_programming/OUTLINE.md`: frame 11 file name, open point 1 closed

## Dijkstra check, 2026-09-30

Engine replayed in node on the script instance: event sequence reproduces Table 4.7 row
by row (0 4 2 ∞ ∞ → 0 3 2 10 12 → 0 3 2 8 12 → 0 3 2 8 10), order A C B D E, length 10.
Closure C–E, a tie (A–B = 3), an isolated target, and E→A all behave. Bold cell = node
finalized at the next step, as in the script's caption. All CSS classes the page uses
exist. Rendered steps 1, 6, 10, 14 and an edited instance with the editor open: correct.
Only defect: the "Checking road" stat tile clips its text (see §5).
