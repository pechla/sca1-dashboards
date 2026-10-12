/* ============================================================================
   Reusable Dijkstra engine for the SCM dashboards.
   Shortest route from a source to a target on an UNDIRECTED network with
   non-negative lengths. RECORDS every pick and every single relaxation as an
   event with a full snapshot of the label table, so a UI can replay the
   script's label table cell by cell.

   Input
     { nodes:  ["A", "B", ...],                   // order = column order
       edges:  [{ u:"A", v:"B", w:4, closed:false }, ...],   // two-way roads
       source: "A", target: "E" }

   Output
     { events: [...], dist, pred, order, path, pathLength, reachable }

   Events (each carries snap = { dist, pred, finalized, order } AFTER the event)
     init                                          all ∞ except source = 0
     pick    { node, d, candidates, tie }          smallest tentative label finalized
     relax   { from, to, w, old, new, improved, skipped }   one arc checked
     done    { path, length }                      target finalized
     unreachable                                   no finite label left, target open

   Rules (stated in the narration, keep them in sync)
     - Ties on the smallest label go to the node listed first in `nodes`.
     - Arcs into already-finalized nodes are not relaxed; the first relax event
       of a node lists them in `skipped` so the UI can mention them once.
     - Stops when the TARGET is finalized (the script's stopping rule), not when
       every node is.

   Pure, dependency-free.
   ========================================================================== */

(function (global) {
  "use strict";

  const INF = Infinity;

  function snapshot(dist, pred, finalized, order) {
    return {
      dist: Object.assign({}, dist),
      pred: Object.assign({}, pred),
      finalized: Object.assign({}, finalized),
      order: order.slice(),
    };
  }

  function solve(cfg) {
    const nodes = cfg.nodes.slice();
    const rank = {}; nodes.forEach((n, i) => rank[n] = i);
    const source = cfg.source, target = cfg.target;

    // adjacency: each open road becomes two arcs, neighbours in `nodes` order
    const adj = {}; nodes.forEach(n => adj[n] = []);
    cfg.edges.forEach(e => {
      if (e.closed) return;
      const w = Number(e.w);
      adj[e.u].push({ to: e.v, w });
      adj[e.v].push({ to: e.u, w });
    });
    nodes.forEach(n => adj[n].sort((a, b) => rank[a.to] - rank[b.to]));

    const dist = {}, pred = {}, finalized = {};
    nodes.forEach(n => { dist[n] = INF; pred[n] = null; finalized[n] = false; });
    dist[source] = 0;
    const order = [];
    const events = [];

    events.push({ type: "init", snap: snapshot(dist, pred, finalized, order) });

    let reachable = false;
    for (;;) {
      // step 1: pick the unfinalized node with the smallest finite label
      let best = null;
      const candidates = [];
      nodes.forEach(n => {
        if (finalized[n] || dist[n] === INF) return;
        candidates.push(n);
        if (best === null || dist[n] < dist[best]) best = n;
      });
      if (best === null) {
        events.push({ type: "unreachable", snap: snapshot(dist, pred, finalized, order) });
        break;
      }
      const tie = candidates.filter(n => dist[n] === dist[best] && n !== best);
      finalized[best] = true;
      order.push(best);
      events.push({
        type: "pick", node: best, d: dist[best], candidates, tie,
        snap: snapshot(dist, pred, finalized, order),
      });

      if (best === target) {
        reachable = true;
        events.push({ type: "done", path: pathTo(target, pred), length: dist[target],
                      snap: snapshot(dist, pred, finalized, order) });
        break;
      }

      // step 2: relax every arc leaving `best` into an unfinalized neighbour
      const skipped = adj[best].filter(a => finalized[a.to]).map(a => a.to);
      let first = true;
      adj[best].forEach(a => {
        if (finalized[a.to]) return;
        const old = dist[a.to];
        const cand = dist[best] + a.w;
        const improved = cand < old;
        if (improved) { dist[a.to] = cand; pred[a.to] = best; }
        events.push({
          type: "relax", from: best, to: a.to, w: a.w, old, new: cand, improved,
          skipped: first ? skipped : [],
          snap: snapshot(dist, pred, finalized, order),
        });
        first = false;
      });
      if (first && skipped.length) {
        // nothing to relax at all: surface the skip so the UI can say so
        events.push({ type: "noop", from: best, skipped,
                      snap: snapshot(dist, pred, finalized, order) });
      }
    }

    return {
      events, dist, pred, order,
      path: reachable ? pathTo(target, pred) : null,
      pathLength: reachable ? dist[target] : INF,
      reachable,
    };
  }

  /* Read the predecessor chain back from `node` to the source. */
  function pathTo(node, pred) {
    const p = [];
    for (let n = node; n !== null && n !== undefined; n = pred[n]) p.unshift(n);
    return p;
  }

  global.Dijkstra = { solve, pathTo };
})(typeof window !== "undefined" ? window : globalThis);
