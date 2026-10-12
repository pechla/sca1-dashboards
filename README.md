# Interactive lecture dashboards

Self-contained HTML dashboards for explaining optimization concepts live in
lectures. No build step, no server — open any `.html` here directly in a browser
(or embed it in slides). They work offline.

## Files

- `assets/dashboard.css` — **shared dark theme** for all dashboards. Re-theme by
  editing the design tokens (CSS variables) at the top: surfaces, accent color,
  semantic highlight colors, type. Every dashboard links this one file, so a
  change here propagates everywhere.
- `assets/simplex.js` — reusable, dependency-free simplex engine. Solves
  `max c·x s.t. Ax ≤ b, x ≥ 0` and **records every iteration** (entering/leaving
  variable, ratio test, pivot, vertex, objective) so a UI can replay it. Also
  exposes `feasiblePolygon()` for 2-variable problems.
- `simplex-brewery.html` — guided walkthrough of the brewery LP: tableau
  pivots on the left, the feasible region with the moving corner point on the
  right, stepped with Next/Prev or ← / → arrow keys. Each iteration has four
  steps — entering variable, ratio test, **row operations** (a column listing
  the Gauss–Jordan operation for every row, including the z-row) and the pivot
  itself. The collapsible problem panel also carries the three-step recipe of
  one simplex iteration.
- `assets/branchbound.js` — reusable, dependency-free branch-and-bound engine for
  **binary** programs `max c·x s.t. Ax ≤ b, x ∈ {0,1}`. It solves each LP
  relaxation by vertex enumeration (robust for the tiny problems here — no
  simplex pivoting) and **records every node and visit event** (solve / branch /
  prune / incumbent / infeasible) so a UI can replay the search tree growing.
- `branch-bound-capital.html` — guided walkthrough of the capital-budgeting IP:
  the search tree grows node-by-node on the left while the bounds bar,
  the current node's LP relaxation, and the incumbent update on the right.
  A switch toggles between the 4-program (one budget) and 6-program (two-year,
  with mutually-exclusive + prerequisite dependencies) variants.

- `assets/dijkstra.js` — reusable, dependency-free Dijkstra engine for an
  **undirected** network with non-negative lengths. It **records every pick and
  every single relaxation** (with the full label table after each) so a UI can
  replay the script's label table cell by cell. Ties go to the node listed first;
  it stops when the *target* is finalized (the script's stopping rule).
- `dijkstra-road-network.html` — guided walkthrough of the A–E road network:
  the network with tentative labels on the left, the label
  table growing row by row on the right, one step per relaxation. The
  collapsible **Edit the network** panel changes road lengths, closes roads and
  moves source/destination; *Reset to script values* returns to the script
  instance, and the badge next to the title shows which one is on screen.
  Closing C–E leaves route and distance unchanged.
  `dijkstra-road-network.html#7` opens directly at step 7.

- `assets/dp.js` — reusable, dependency-free dynamic-programming engine: shortest
  path through nodes that are **already in order**, backward
  (`g(i) = min c_ij + g(j)`) or forward (`F(j) = min F(i) + c_ij`). It **records every
  candidate line of arithmetic**, then a close event per node, so a UI can replay
  the script's value tables cell by cell. Ties go to the candidate listed first and
  are flagged. `DP.orient(edges, order)` turns an undirected network into arcs
  following a node order.
- `dp-road-network.html` — guided walkthrough of Bellman's table, two instances on
  one page (switch at the top): the A–E road network read **backwards**
  and the Alpspitz lot-sizing plan read **forwards**. Network or
  arc diagram with value pills on the left; the value/via table, the candidates
  mini-table (the paper computation) and the result on the right. The road
  instance orients the roads live from Dijkstra's finalization order on the
  current network, so its edit panel (same as the Dijkstra page) carries over; the
  lot-sizing instance lets you edit demands, setup cost K and holding cost h, which
  is how the script's setup-cost exercise is shown (K < 24,000 → four runs, 168,000 → two,
  552,000 → one batch). Deep links: `#road-9`, `#lot-13`.

## Adding a new dashboard

1. Create `your-dashboard.html` and link `assets/dashboard.css`.
2. Reuse the building blocks from the CSS: `.dash-wrap`, `.panel`,
   `.panel-title`, `.dash-grid`, `.controls`, `.btn` / `.btn-primary`,
   `.narration`, `.step-pill`, `.progress-dots`, `.stat`.
3. To drive another LP through the simplex view, just change the `CONFIG`
   object in `simplex-brewery.html` (objective, constraints, variable names) —
   the engine and rendering are problem-agnostic for 2-variable LPs.
4. To drive another binary IP through the branch-and-bound view, change the
   `PROBLEMS` object in `branch-bound-capital.html` (objective, constraints,
   program labels). All constraints must be `≤` (write a prerequisite `x₆ ≤ x₄`
   as `x₆ − x₄ ≤ 0`); the tree, bounds bar, and narration regenerate
   automatically. The coefficients match the script.
5. To drive another network through the Dijkstra view, change the `DEFAULT`
   object in `dijkstra-road-network.html` (nodes with `x`/`y` drawing positions,
   two-way `edges` with lengths, `source`, `target`). Lengths must be
   non-negative — that is what justifies finalizing the smallest label;
   the editor refuses negative values for the same reason.
6. To drive another instance through the DP view, add an adapter object next to
   `ROAD` / `LOT` in `dp-road-network.html`: it must return `{ nodes, arcs,
   direction }` from `build()`, give drawing `positions()`, and supply the wording.
   Any finite deterministic DP is such a path, but keep it paper
   sized — a 5-node instance with ~10 arcs, not the 10-year van problem.
