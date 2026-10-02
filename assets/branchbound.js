/* ============================================================================
   Reusable branch-and-bound engine for the SCM dashboards.
   Solves a BINARY program   max c·x   s.t.  A x <= b ,  x in {0,1}
   by branch-and-bound on the LP relaxation, and RECORDS every node and every
   visit event (solve / branch / prune / incumbent / infeasible) so a UI can
   replay the search tree growing step by step.

   The LP relaxations are tiny (a handful of binary vars, a few <= rows), so
   instead of a full simplex we solve each relaxation by VERTEX ENUMERATION:
   the optimum of a bounded LP sits at a vertex, i.e. the intersection of n
   active constraints (n = #vars). We enumerate every n-subset of the
   constraint rows (structural rows + the variable bound rows), solve the n×n
   system, keep feasible intersections, and take the best objective. Bulletproof
   for small problems -- no pivoting, degeneracy, or cycling to get wrong.

   Pure, dependency-free.  Feed it a binary-IP config; get back a replay trace.
   ========================================================================== */

(function (global) {
  "use strict";

  const TOL = 1e-7;

  function zeros(n) { return new Array(n).fill(0); }
  function dot(a, x) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * x[i]; return s; }

  /* All k-subsets of {0..N-1} as index arrays. */
  function combinations(N, k) {
    const out = [];
    const idx = Array.from({ length: k }, (_, i) => i);
    if (k > N) return out;
    while (true) {
      out.push(idx.slice());
      let i = k - 1;
      while (i >= 0 && idx[i] === N - k + i) i--;
      if (i < 0) break;
      idx[i]++;
      for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }
    return out;
  }

  /* Solve the n×n linear system A x = b by Gaussian elimination with partial
     pivoting. Returns the solution, or null if (near-)singular. */
  function solveLinear(A, b) {
    const n = A.length;
    const M = A.map((row, i) => row.concat(b[i]));   // augmented
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-12) return null;
      [M[col], M[piv]] = [M[piv], M[col]];
      const d = M[col][col];
      for (let j = col; j <= n; j++) M[col][j] /= d;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col];
        if (Math.abs(f) < 1e-15) continue;
        for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
      }
    }
    return M.map(row => row[n]);
  }

  /* Build the full list of <= rows for a problem: structural constraints plus,
     for every variable, x_i <= 1 and -x_i <= 0. (These bound rows are what the
     enumeration intersects to fix variables at 0 or 1 at a vertex.) Cached. */
  function rowsFor(prob) {
    if (prob._rows) return prob._rows;
    const n = prob.objective.length;
    const rows = [];
    prob.constraints.forEach(c => rows.push({ a: c.coeffs.slice(), b: c.rhs }));
    for (let i = 0; i < n; i++) {
      const up = zeros(n); up[i] = 1; rows.push({ a: up, b: 1 });     // x_i <= 1
      const lo = zeros(n); lo[i] = -1; rows.push({ a: lo, b: 0 });    // x_i >= 0
    }
    prob._rows = rows;
    prob._combos = combinations(rows.length, n);
    return rows;
  }

  /* Solve the LP relaxation with some variables fixed (fix: {idx: 0|1}).
     Returns { feasible, x, obj }. Variable bounds are [0,1], tightened to the
     single point {fix[i]} for fixed variables. */
  function solveRelaxation(prob, fix) {
    const n = prob.objective.length;
    const rows = rowsFor(prob);
    const lo = zeros(n).map(() => 0);
    const hi = zeros(n).map(() => 1);
    for (const k in fix) { lo[k] = fix[k]; hi[k] = fix[k]; }

    const feasible = (x) => {
      for (let i = 0; i < n; i++) if (x[i] < lo[i] - TOL || x[i] > hi[i] + TOL) return false;
      return rows.every(r => dot(r.a, x) <= r.b + TOL);
    };

    let best = null, bestObj = -Infinity;
    for (const combo of prob._combos) {
      const A = combo.map(t => rows[t].a);
      const bb = combo.map(t => rows[t].b);
      const x = solveLinear(A, bb);
      if (!x) continue;
      if (!feasible(x)) continue;
      const obj = dot(prob.objective, x);
      if (obj > bestObj + TOL) { bestObj = obj; best = x.map(v => Math.abs(v) < TOL ? 0 : v); }
    }
    if (!best) return { feasible: false };
    return { feasible: true, x: best, obj: bestObj };
  }

  const isInt = v => Math.abs(v - Math.round(v)) < 1e-6;
  const allInteger = x => x.every(isInt);
  /* lowest-index fractional variable (deterministic branching rule) */
  function branchVar(x) {
    for (let i = 0; i < x.length; i++) if (!isInt(x[i])) return i;
    return -1;
  }

  /* Run branch-and-bound depth-first, exploring the x_i = 1 child before the
     x_i = 0 child. Records nodes + an ordered list of visit events, each with a
     snapshot of the tree state so a UI can replay the search. */
  function solve(prob) {
    rowsFor(prob);
    const nodes = [];
    const events = [];
    let incumbent = null;     // { x, obj, nodeId }
    let rootBound = null;
    let nextId = 0;

    function makeNode(parent, branch, fix) {
      const node = {
        id: nextId++,
        parent: parent ? parent.id : null,
        depth: parent ? parent.depth + 1 : 0,
        branch,            // { var, val } or null for root
        fix,               // accumulated fixings along the path
        children: [],
        status: "pending", // pending | branched | incumbent | integer | pruned | infeasible
        sol: null,
        obj: null,
      };
      nodes.push(node);
      if (parent) parent.children.push(node.id);
      return node;
    }

    function snapshot() {
      return {
        nodes: nodes.map(nd => ({
          id: nd.id, parent: nd.parent, depth: nd.depth,
          branch: nd.branch, fix: { ...nd.fix }, children: nd.children.slice(),
          status: nd.status, obj: nd.obj, sol: nd.sol ? nd.sol.slice() : null,
        })),
        incumbent: incumbent ? { x: incumbent.x.slice(), obj: incumbent.obj, nodeId: incumbent.nodeId } : null,
      };
    }
    function emit(nodeId, type, extra) {
      events.push({ nodeId, type, focusBound: nodes[nodeId].obj, ...(extra || {}), snap: snapshot() });
    }

    function explore(node) {
      const r = solveRelaxation(prob, node.fix);
      if (!r.feasible) {
        node.status = "infeasible";
        emit(node.id, "infeasible");
        return;
      }
      node.sol = r.x; node.obj = r.obj;
      if (node.id === 0) rootBound = r.obj;
      emit(node.id, "solve");

      // prune by bound: cannot strictly beat the incumbent
      if (incumbent && r.obj <= incumbent.obj + TOL) {
        node.status = "pruned";
        emit(node.id, "prune");
        return;
      }
      if (allInteger(r.x)) {
        if (!incumbent || r.obj > incumbent.obj + TOL) {
          incumbent = { x: r.x.slice(), obj: r.obj, nodeId: node.id };
          node.status = "incumbent";
          emit(node.id, "incumbent");
        } else {
          node.status = "integer";
          emit(node.id, "integer");
        }
        return;
      }
      // fractional -> branch (x=1 child first, then x=0)
      node.status = "branched";
      const bi = branchVar(r.x);
      const c1 = makeNode(node, { var: bi, val: 1 }, { ...node.fix, [bi]: 1 });
      const c0 = makeNode(node, { var: bi, val: 0 }, { ...node.fix, [bi]: 0 });
      emit(node.id, "branch", { branchVar: bi });
      explore(c1);
      explore(c0);
    }

    const root = makeNode(null, null, {});
    explore(root);

    return {
      nodes,
      events,
      rootBound,
      optimal: incumbent,         // { x, obj, nodeId }
      optimalNodeId: incumbent ? incumbent.nodeId : null,
    };
  }

  global.BranchBound = { solve };
})(typeof window !== "undefined" ? window : globalThis);
