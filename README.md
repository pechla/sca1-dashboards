# Interactive lecture dashboards

Self-contained HTML dashboards for explaining optimization concepts live in
lectures. No build step, no server - open any `.html` here directly in a browser
(or embed it in slides). They work offline.

## Files

- `assets/dashboard.css` - **shared dark theme** for all dashboards. Re-theme by
  editing the design tokens (CSS variables) at the top: surfaces, accent color,
  semantic highlight colors, type. Every dashboard links this one file, so a
  change here propagates everywhere.
- `assets/simplex.js` - reusable, dependency-free simplex engine. Solves
  `max c·x s.t. Ax ≤ b, x ≥ 0` and **records every iteration** (entering/leaving
  variable, ratio test, pivot, vertex, objective) so a UI can replay it. Also
  exposes `feasiblePolygon()` for 2-variable problems.
- `simplex-brewery.html` - guided walkthrough of the brewery LP: tableau
  pivots on the left, the feasible region with the moving corner point on the
  right, stepped with Next/Prev or ← / → arrow keys. Each iteration has four
  steps - entering variable, ratio test, **row operations** (a column listing
  the Gauss-Jordan operation for every row, including the z-row) and the pivot
  itself. The collapsible problem panel also carries the three-step recipe of
  one simplex iteration.
- `assets/branchbound.js` - reusable, dependency-free branch-and-bound engine for
  **binary** programs `max c·x s.t. Ax ≤ b, x ∈ {0,1}`. It solves each LP
  relaxation by vertex enumeration (robust for the tiny problems here - no
  simplex pivoting) and **records every node and visit event** (solve / branch /
  prune / incumbent / infeasible) so a UI can replay the search tree growing.
- `branch-bound-capital.html` - guided walkthrough of the capital-budgeting IP:
  the search tree grows node-by-node on the left while the bounds bar,
  the current node's LP relaxation, and the incumbent update on the right.
  A switch toggles between the 4-program (one budget) and 6-program (two-year,
  with mutually-exclusive + prerequisite dependencies) variants.

- `assets/dijkstra.js` - reusable, dependency-free Dijkstra engine for an
  **undirected** network with non-negative lengths. It **records every pick and
  every single relaxation** (with the full label table after each) so a UI can
  replay the script's label table cell by cell. Ties go to the node listed first;
  it stops when the *target* is finalized (the script's stopping rule).
- `dijkstra-road-network.html` - guided walkthrough of the A-E road network:
  the network with tentative labels on the left, the label
  table growing row by row on the right, one step per relaxation. The
  collapsible **Edit the network** panel changes road lengths, closes roads and
  moves source/destination; *Reset to script values* returns to the script
  instance, and the badge next to the title shows which one is on screen.
  Closing C-E leaves route and distance unchanged.
  `dijkstra-road-network.html#7` opens directly at step 7.

- `assets/dp.js` - reusable, dependency-free dynamic-programming engine: shortest
  path through nodes that are **already in order**, backward
  (`g(i) = min c_ij + g(j)`) or forward (`F(j) = min F(i) + c_ij`). It **records every
  candidate line of arithmetic**, then a close event per node, so a UI can replay
  the script's value tables cell by cell. Ties go to the candidate listed first and
  are flagged. An optional `start` names the node the path is read from (default:
  the last node solved). `DP.orient(edges, order)` turns an undirected network into
  arcs following a node order (not used by any page at the moment).
- `dp-bellman-table.html` - guided walkthrough of Bellman's table, two tabs on
  one page, both solved backwards by the same engine:
  - **Shortest route**: the forwarder's layered network (plant, 2 inland
    terminals, 3 seaports, 2 destination ports, customer; 13 arcs). 31 steps
    replay the script's candidate table line by line: the network with value
    pills on the left, the value/via table (with a stage row) and the candidates
    mini-table on the right. The narration carries the script's hand checks
    (the seaport where the cheaper arc loses, the plant where the dearest arc
    wins) and compares with the greedy route. The edit panel changes arc costs
    and closes arcs.
  - **Production planning**: the heat pump manufacturer's four quarters with a setup cost, a
    production limit and a warehouse limit. The left panel is the stage-state
    lattice (columns = quarters, rows = opening stock, arcs = production
    quantities labelled with their cost); the right panel shows the four
    quarterly tables in the script's format, Q4 at the top, filling **one cell
    per step** - the cell being computed and the next-quarter value it reads are
    highlighted together, which is the link students miss on paper. Dashes are
    explained: a quantity is either ruled out by the limits or leads to a state
    with no feasible continuation. The plan is traced forward at the end, and the
    Q1 table's other rows give the cost for any opening stock. The edit panel
    changes demands, capacity, warehouse size, K and h (a larger warehouse adds a
    row, a larger capacity a column).
  - *Jump to* buttons in the sticky bar skip to a stage or quarter. Deep links:
    `#route-13`, `#hp-20`; plain `#13` opens the route.

## Adding a new dashboard

1. Create `your-dashboard.html` and link `assets/dashboard.css`.
2. Reuse the building blocks from the CSS: `.dash-wrap`, `.panel`,
   `.panel-title`, `.dash-grid`, `.controls`, `.btn` / `.btn-primary`,
   `.narration`, `.step-pill`, `.progress-dots`, `.stat`.
3. To drive another LP through the simplex view, just change the `CONFIG`
   object in `simplex-brewery.html` (objective, constraints, variable names) -
   the engine and rendering are problem-agnostic for 2-variable LPs.
4. To drive another binary IP through the branch-and-bound view, change the
   `PROBLEMS` object in `branch-bound-capital.html` (objective, constraints,
   program labels). All constraints must be `≤` (write a prerequisite `x₆ ≤ x₄`
   as `x₆ − x₄ ≤ 0`); the tree, bounds bar, and narration regenerate
   automatically. The coefficients match the script.
5. To drive another network through the Dijkstra view, change the `DEFAULT`
   object in `dijkstra-road-network.html` (nodes with `x`/`y` drawing positions,
   two-way `edges` with lengths, `source`, `target`). Lengths must be
   non-negative - that is what justifies finalizing the smallest label;
   the editor refuses negative values for the same reason.
6. To drive another layered network through the DP route tab, change `layers`
   and `arcs` in `ROUTE_DEFAULT` in `dp-bellman-table.html`; arc labels are
   placed automatically. Another lot-sizing instance only needs new numbers in
   `HP_DEFAULT`. A different kind of DP needs an adapter object like `ROUTE` /
   `HP`: it returns `{ nodes, arcs, direction, start }` from `build()`, gives
   drawing `positions()`, and supplies the narration and the right-hand panel.
   Any finite deterministic DP is such a path, but keep it paper sized - a few
   dozen arcs, not the eight-year van replacement.

Style: plain " - " as the dash in prose, never an em-dash, and no section, table
or figure numbers from the script - they drift. Say "the script's candidate
table", not "Table 5.2".
