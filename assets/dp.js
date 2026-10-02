/* ============================================================================
   Reusable dynamic-programming engine for the SCM dashboards.
   Shortest path through a graph whose nodes are ALREADY IN ORDER (script §5.2,
   §5.4, §5.6.1: every finite deterministic DP is such a path). RECORDS every
   candidate evaluation, so a UI can replay Table 5.1 / Table 5.3 of the script
   line by line, exactly as on paper.

   Input
     { nodes:     ["A", "C", "B", "D", "E"],   // topological (solving) order
       arcs:      [{ from:"A", to:"B", c:4 }, ...],   // c ≥ 0, input order = tie order
       direction: "backward" | "forward" }

       backward: value[last] = 0, walk the nodes in reverse, candidates are the
                 arcs OUT of the node:   value(i) = min_j { c_ij + value(j) }
       forward:  value[first] = 0, walk the nodes in order, candidates are the
                 arcs INTO the node:     value(j) = min_i { value(i) + c_ij }

   Output
     { events: [...], value, via, path, total, reachable }

   Events (each carries snap = { value, via, solved } AFTER the event)
     init        { terminal }                            value 0 at the terminal node
     open        { node, arcs }                          the node's candidate arcs, in order
     candidate   { node, other, c, otherValue, total,    one line of arithmetic
                   bestSoFar, isBest, tie, index, count }
     close       { node, value, via, candidates }        the node is solved
     unreachable { node }                                no finite candidate
     done        { path, total }                         read the via entries

   Rules (stated in the narration, keep them in sync)
     - Ties go to the candidate listed first; the later equal one carries tie=true.
     - Candidates whose neighbour is ∞ are still emitted (total ∞) -- on paper you
       would write them down and cross them out.

   Pure, dependency-free.
   ========================================================================== */

(function (global) {
  "use strict";

  const INF = Infinity;

  function snapshot(value, via, solved) {
    return {
      value: Object.assign({}, value),
      via: Object.assign({}, via),
      solved: solved.slice(),
    };
  }

  function solve(cfg) {
    const nodes = cfg.nodes.slice();
    const backward = cfg.direction !== "forward";
    const walk = backward ? nodes.slice().reverse() : nodes.slice();
    const terminal = walk[0];
    const start = walk[walk.length - 1];        // where the path is read from

    const value = {}, via = {};
    nodes.forEach(n => { value[n] = INF; via[n] = null; });
    value[terminal] = 0;
    const solved = [terminal];
    const events = [];

    events.push({ type: "init", terminal, snap: snapshot(value, via, solved) });

    walk.slice(1).forEach(node => {
      // candidate arcs, in input order
      const arcs = cfg.arcs.filter(a => backward ? a.from === node : a.to === node)
        .map(a => ({ from: a.from, to: a.to, c: Number(a.c),
                     other: backward ? a.to : a.from }));
      events.push({ type: "open", node, arcs: arcs.slice(), snap: snapshot(value, via, solved) });

      let best = INF, bestVia = null;
      const candidates = [];
      arcs.forEach((a, k) => {
        const otherValue = value[a.other];
        const total = a.c + otherValue;
        const isBest = total < best;
        const tie = !isBest && total === best && total !== INF;
        if (isBest) { best = total; bestVia = a.other; }
        const cand = { node, other: a.other, c: a.c, otherValue, total,
                       bestSoFar: best, bestVia, isBest, tie, index: k, count: arcs.length };
        candidates.push(cand);
        events.push(Object.assign({ type: "candidate" }, cand, { snap: snapshot(value, via, solved) }));
      });

      if (best === INF) {
        events.push({ type: "unreachable", node, snap: snapshot(value, via, solved) });
        solved.push(node);
        return;
      }
      value[node] = best; via[node] = bestVia;
      solved.push(node);
      events.push({ type: "close", node, value: best, via: bestVia, candidates,
                    snap: snapshot(value, via, solved) });
    });

    const reachable = value[start] !== INF;
    let path = null;
    if (reachable) {
      path = [];
      for (let n = start; n !== null && n !== undefined; n = via[n]) path.push(n);
      if (!backward) path.reverse();          // forward: via points to predecessors
    }
    events.push({ type: reachable ? "done" : "unreachable", node: start, path, total: value[start],
                  snap: snapshot(value, via, solved) });

    return { events, value, via, path, total: value[start], reachable, terminal, start };
  }

  /* Orient an undirected network by a node order: every open road points from
     the endpoint that comes first in `order` to the one that comes later
     (script §5.2 / §5.7.1). Roads touching a node not in `order` are dropped. */
  function orient(edges, order) {
    const rank = {}; order.forEach((n, i) => rank[n] = i);
    const arcs = [];
    edges.forEach(e => {
      if (e.closed) return;
      if (rank[e.u] === undefined || rank[e.v] === undefined) return;
      const flip = rank[e.u] > rank[e.v];
      arcs.push({ from: flip ? e.v : e.u, to: flip ? e.u : e.v, c: Number(e.w) });
    });
    return arcs;
  }

  global.DP = { solve, orient };
})(typeof window !== "undefined" ? window : globalThis);
