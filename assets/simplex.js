/* ============================================================================
   Reusable simplex engine for the SCM dashboards.
   Solves   max c·x   s.t.  A x <= b ,  x >= 0   (all b_i >= 0)
   using the primal simplex with Dantzig's most-negative rule, and RECORDS
   every iteration (entering/leaving/pivot/ratios/vertex) so a UI can replay it.

   Pure, dependency-free.  Feed it an LP config; get back a step-by-step trace.
   ========================================================================== */

(function (global) {
  "use strict";

  const EPS = 1e-9;

  function clone2D(m) { return m.map(r => r.slice()); }

  /* Read the current basic-feasible solution's value for each ORIGINAL
     structural variable (the first `nStruct` columns). */
  function structuralPoint(T, basis, nStruct, rhsCol) {
    const pt = new Array(nStruct).fill(0);
    for (let i = 0; i < basis.length; i++) {
      if (basis[i] < nStruct) pt[basis[i]] = T[i][rhsCol];
    }
    return pt;
  }

  /* Pivot the tableau on (pr, pc) - full Gauss-Jordan elimination. */
  function pivot(T, pr, pc) {
    const piv = T[pr][pc];
    for (let j = 0; j < T[pr].length; j++) T[pr][j] /= piv;
    for (let i = 0; i < T.length; i++) {
      if (i === pr) continue;
      const f = T[i][pc];
      if (Math.abs(f) < EPS) continue;
      for (let j = 0; j < T[i].length; j++) T[i][j] -= f * T[pr][j];
    }
  }

  /* Build the trace.
     config = {
       objective: [c1, c2, ...],                    // maximize
       constraints: [{ coeffs:[a1,a2,...], rhs:b, name:"hops" }, ...],
       varNames: ["x1","x2"],                        // structural names (optional)
     }
     Returns { varNames, slackNames, nStruct, iterations:[...], optimal:{...} }
  */
  function solve(config) {
    const c = config.objective;
    const cons = config.constraints;
    const nStruct = c.length;
    const m = cons.length;

    const varNames = config.varNames
      ? config.varNames.slice()
      : Array.from({ length: nStruct }, (_, i) => "x" + (i + 1));
    const slackNames = Array.from({ length: m }, (_, i) => "s" + (i + 1));
    const allNames = varNames.concat(slackNames);
    const nVars = nStruct + m;            // structural + slacks
    const rhsCol = nVars;                 // RHS is the last column

    // ---- initial tableau: m constraint rows + 1 objective (z) row ----
    // columns: [struct... | slacks... | RHS]
    const T = [];
    for (let i = 0; i < m; i++) {
      const row = new Array(nVars + 1).fill(0);
      for (let j = 0; j < nStruct; j++) row[j] = cons[i].coeffs[j];
      row[nStruct + i] = 1;               // slack i
      row[rhsCol] = cons[i].rhs;
      T.push(row);
    }
    const zrow = new Array(nVars + 1).fill(0);
    for (let j = 0; j < nStruct; j++) zrow[j] = -c[j];   // z - c·x = 0
    T.push(zrow);

    let basis = Array.from({ length: m }, (_, i) => nStruct + i); // slacks basic

    const snapshot = () => clone2D(T);
    const zRowIdx = m;

    const iterations = [];
    const initial = {
      tableau: snapshot(),
      basis: basis.slice(),
      vertex: structuralPoint(T, basis, nStruct, rhsCol),
      z: T[zRowIdx][rhsCol],
    };

    let guard = 0;
    while (guard++ < 100) {
      // ---- choose entering: most negative z-row coefficient among all vars ----
      let enterCol = -1, best = -EPS;
      for (let j = 0; j < nVars; j++) {
        if (T[zRowIdx][j] < best) { best = T[zRowIdx][j]; enterCol = j; }
      }
      if (enterCol === -1) break;          // optimal

      // ---- ratio test ----
      const ratios = [];
      let leaveRow = -1, minRatio = Infinity;
      for (let i = 0; i < m; i++) {
        const a = T[i][enterCol];
        if (a > EPS) {
          const r = T[i][rhsCol] / a;
          ratios.push(r);
          if (r < minRatio - EPS) { minRatio = r; leaveRow = i; }
        } else {
          ratios.push(null);               // skipped (non-positive entry)
        }
      }
      if (leaveRow === -1) {                // unbounded
        iterations.push({ unbounded: true, enterCol, enterVar: allNames[enterCol] });
        break;
      }

      const tableauBefore = snapshot();
      const basisBefore = basis.slice();
      const vertexBefore = structuralPoint(T, basis, nStruct, rhsCol);
      const zBefore = T[zRowIdx][rhsCol];
      const leaveVarIdx = basis[leaveRow];

      pivot(T, leaveRow, enterCol);
      basis = basis.slice();
      basis[leaveRow] = enterCol;

      iterations.push({
        enterCol,
        enterVar: allNames[enterCol],
        leaveRow,
        leaveVar: allNames[leaveVarIdx],
        pivot: { row: leaveRow, col: enterCol },
        ratios,
        minRatio,
        tableauBefore,
        basisBefore,
        vertexBefore,
        zBefore,
        tableauAfter: snapshot(),
        basisAfter: basis.slice(),
        vertexAfter: structuralPoint(T, basis, nStruct, rhsCol),
        zAfter: T[zRowIdx][rhsCol],
      });
    }

    // ---- read shadow prices: z-row coefficients on the slack columns ----
    const shadowPrices = cons.map((con, i) => ({
      name: con.name || ("c" + (i + 1)),
      slack: slackNames[i],
      price: T[zRowIdx][nStruct + i],
    }));

    return {
      varNames, slackNames, allNames, nStruct, m, rhsCol,
      initial,
      iterations,
      optimal: {
        tableau: snapshot(),
        basis: basis.slice(),
        vertex: structuralPoint(T, basis, nStruct, rhsCol),
        z: T[zRowIdx][rhsCol],
        shadowPrices,
      },
    };
  }

  /* ---- 2D feasible-region polygon (for the geometry panel) ----
     Only meaningful when nStruct === 2.  Enumerates all constraint-line
     intersections (incl. axes), keeps feasible ones, orders them CCW. */
  function feasiblePolygon(config) {
    const cons = config.constraints;
    // half-planes a·x <= b, plus x1>=0, x2>=0  (-x<=0)
    const planes = cons.map(con => ({ a: con.coeffs[0], b: con.coeffs[1], c: con.rhs }));
    planes.push({ a: -1, b: 0, c: 0 });   // x1 >= 0
    planes.push({ a: 0, b: -1, c: 0 });   // x2 >= 0

    const feasible = (x, y) =>
      planes.every(p => p.a * x + p.b * y <= p.c + 1e-7);

    const pts = [];
    for (let i = 0; i < planes.length; i++) {
      for (let j = i + 1; j < planes.length; j++) {
        const p = planes[i], q = planes[j];
        const det = p.a * q.b - q.a * p.b;
        if (Math.abs(det) < 1e-12) continue;
        const x = (p.c * q.b - q.c * p.b) / det;
        const y = (p.a * q.c - q.a * p.c) / det;
        if (feasible(x, y)) pts.push([x, y]);
      }
    }
    // dedupe + sort CCW around centroid
    const uniq = [];
    for (const [x, y] of pts) {
      if (!uniq.some(u => Math.abs(u[0] - x) < 1e-6 && Math.abs(u[1] - y) < 1e-6))
        uniq.push([x, y]);
    }
    if (uniq.length < 3) return uniq;
    const cx = uniq.reduce((s, p) => s + p[0], 0) / uniq.length;
    const cy = uniq.reduce((s, p) => s + p[1], 0) / uniq.length;
    uniq.sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
    return uniq;
  }

  global.Simplex = { solve, feasiblePolygon };
})(typeof window !== "undefined" ? window : globalThis);
