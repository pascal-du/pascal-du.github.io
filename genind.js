// genind.js

let sigmaInstance;

/** 1. Topology generators **/
function generateNetworkLayer(numNodes = 7, type = "ba") {
  const g = new graphology.Graph();
  const pos = {};
  for (let i = 0; i < numNodes; i++) {
    const id = `N${i}`;
    g.addNode(id);
    pos[id] = { x: Math.random(), y: Math.random() };
  }
  if (type === "ba") {
    g.clear();
    g.addNode("N0"); g.addNode("N1"); g.addEdge("N0", "N1");
    const weighted = ["N0","N1","N0","N1"];
    for (let i = 2; i < numNodes; i++) {
      const id = `N${i}`; g.addNode(id);
      const targets = new Set();
      while (targets.size < 2)
        targets.add(weighted[Math.floor(Math.random()*weighted.length)]);
      targets.forEach(t => g.addEdge(id, t));
      for (let k = 0; k < g.degree(id); k++) weighted.push(id);
      targets.forEach(t => weighted.push(t));
    }
  } else if (type === "rg") {
    const r = 0.4, ids = g.nodes();
    ids.forEach((a,i) =>
      ids.slice(i+1).forEach(b => {
        const dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y;
        if (Math.hypot(dx, dy) < r) g.addEdge(a, b);
      })
    );
  } else if (type === "wm") {
    const α=0.2, β=0.4, dmax=Math.SQRT2, ids = g.nodes();
    ids.forEach((a,i) =>
      ids.slice(i+1).forEach(b => {
        const dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y;
        const d = Math.hypot(dx, dy);
        if (Math.random() < α * Math.exp(-d/(β*dmax))) g.addEdge(a, b);
      })
    );
  }
  return { graph: g, ids: g.nodes() };
}

function generateControllerLayer(clusters = 5, per = 4, type = "ring") {
  const g = new graphology.Graph(), ids = [];
  for (let i = 0; i < clusters; i++) {
    const cluster = [];
    for (let j = 0; j < per; j++) {
      const id = `C${i}_${j}`; g.addNode(id);
      cluster.push(id); ids.push(id);
    }
    if (type==="mesh"||type==="star") {
      cluster.slice(1).forEach(b=>g.addEdge(cluster[0],b));
    } else if (type==="ring") {
      cluster.forEach((n,j)=>g.addEdge(n, cluster[(j+1)%cluster.length]));
    } else if (type==="bus") {
      cluster.slice(0,-1).forEach((n,j)=>g.addEdge(n, cluster[j+1]));
    }
  }
  return { graph: g, ids };
}

function generateSensorLayer(clusters = 5, per = 4) {
  const g = new graphology.Graph(), ids = [];
  for (let i = 0; i < clusters; i++) {
    const cluster = [];
    for (let j = 0; j < per; j++) {
      const id = `S${i}_${j}`; g.addNode(id);
      cluster.push(id); ids.push(id);
    }
    cluster.slice(1).forEach(b=>g.addEdge(cluster[0],b));
  }
  return { graph: g, ids };
}

function combineGraph(base, netIds, ctrlIds, sensIds, clusters = 5, fixed = 3) {
  const sortedNet = [...netIds].sort();
  for (let i = 0; i < clusters; i++) {
    const ctr = ctrlIds.filter(n=>n.startsWith(`C${i}_`)).sort();
    for (let j = 0; j < fixed; j++) {
      base.addEdge(ctr[j%ctr.length], sortedNet[(i+j)%sortedNet.length]);
    }
  }
  for (let i = 0; i < clusters; i++) {
    const c0 = ctrlIds.filter(n=>n.startsWith(`C${i}_`)).sort()[0];
    const s0 = sensIds.filter(n=>n.startsWith(`S${i}_`)).sort()[0];
    if (c0 && s0) base.addEdge(c0, s0);
  }
  return base;
}

/** 2. Core‐path computation **/
function buildAdjacency(G) {
  const adj = {};
  G.forEachNode(n => { adj[n] = G.neighbors(n); });
  return adj;
}

function isInduced(path, candidate, adj) {
  for (let i = 0; i + 1 < path.length; i++) {
    if (adj[path[i]].includes(candidate)) return false;
  }
  return true;
}

function genCorePaths(adj, s, t, path, visited, acc) {
  const newPath = path.concat(s);
  const VC = new Set(acc.flat());
  if (VC.has(s)) {
    acc.push(newPath);
    return;
  }
  const neighbors = adj[s] || [];
  if (neighbors.includes(t) && isInduced(newPath, t, adj)) {
    acc.push(newPath.concat(t));
    return;
  }
  const nextVisited = new Set(visited);
  nextVisited.add(s);
  neighbors.forEach(n=>nextVisited.add(n));
  for (const nbr of neighbors) {
    if (!visited.has(nbr) && isInduced(newPath, nbr, adj))
      genCorePaths(adj, nbr, t, newPath, nextVisited, acc);
  }
}

function computeAllCorePaths(G, entry, target) {
  const adj = buildAdjacency(G), all = [];
  for (const s of entry)
    for (const t of target) {
      const tmp = [];
      genCorePaths(adj, s, t, [], new Set(), tmp);
      all.push(...tmp);
    }
  return all;
}







function initTopology() {
  const container = document.getElementById("container");

  // 1) Tear down any existing Sigma instance
  if (sigmaInstance) {
    sigmaInstance.kill();
    container.innerHTML = "";
  }

  // 2) Read inputs
  const numNetwork  = +document.getElementById("inpNetwork").value;
  const numClusters = +document.getElementById("inpClusters").value;
  const perCluster  = +document.getElementById("inpPerCluster").value;

  // 3) Generate and merge your three layers into G
  const net  = generateNetworkLayer(numNetwork, "ba");
  const ctrl = generateControllerLayer(numClusters, perCluster, "ring");
  const sens = generateSensorLayer(numClusters, perCluster);
  const G = new graphology.Graph();
  [net.graph, ctrl.graph, sens.graph].forEach(layer => {
    layer.forEachNode((n, attrs) => G.addNode(n, { ...attrs }));
    layer.forEachEdge((e, attrs, s, t) => G.addEdge(s, t, { key: e, ...attrs }));
  });
  combineGraph(G, net.ids, ctrl.ids, sens.ids, numClusters, perCluster - 1);

  // 4) Concentric layout + color + label + highlight flag
  const rNet = 1, rCtrl = 2, rSens = 3;
  const slice = (2 * Math.PI) / numClusters;
  const entry  = [net.ids[0], net.ids[net.ids.length - 1]];
  const target = [`S${numClusters-1}_${perCluster-1}`, `S${numClusters-2}_${perCluster-1}`];

  G.forEachNode(n => {
    let radius, angle;
    if (n.startsWith("N")) {
      radius = Math.random() * rNet;
      angle  = Math.random() * Math.PI;
    } else if (n.startsWith("C")) {
      const i = +n.match(/^C(\d+)_/)[1];
      angle  = i * slice + (Math.random())*slice*0.4;
      radius = rCtrl + (Math.random());
    } else {
      const i = +n.match(/^S(\d+)_/)[1];
      angle  = i * slice + (Math.random())*slice*0.4;
      radius = rSens + (Math.random());
    }
    G.setNodeAttribute(n,"x", radius*Math.cos(angle));
    G.setNodeAttribute(n,"y", radius*Math.sin(angle));
    const baseSize = 8;
    G.setNodeAttribute(n,"size", baseSize);

    let color = "blue";
    if (entry.includes(n))       color = "green";
    else if (target.includes(n)) color = "purple";
    else if (n.startsWith("C"))   color = "red";
    else if (n.startsWith("S"))   color = "orange";
    G.setNodeAttribute(n,"color", color);

    G.setNodeAttribute(n,"label", n);
    G.setNodeAttribute(n,"_highlighted", false);
  });

  // 5) Default edge styling
  G.forEachEdge((e, _, s, t) => {
    G.setEdgeAttribute(e,"color","#888");
    G.setEdgeAttribute(e,"size",1);
  });

  // 6) Enforce spacing
  forceAtlas2.assign(G, {
    iterations:200, scalingRatio:10, gravity:0.2,
    outboundAttractionDistribution:false,
    edgeWeightInfluence:0, barnesHutOptimize:true,
    barnesHutTheta:1
  });

  // 7) Compute core attack paths
  const corePaths = computeAllCorePaths(G, entry, target);

  // 8) Build lookup maps
  const nodeToPaths = {}, pathEdges = [];
  corePaths.forEach((path, pi) => {
    path.forEach(n => (nodeToPaths[n] ||= []).push(pi));
    const set = new Set();
    for (let i = 0; i + 1 < path.length; i++) {
      const u = path[i], v = path[i+1];
      set.add(`${u}:::${v}`);
      set.add(`${v}:::${u}`);
    }
    pathEdges.push(set);
  });

  // 9) Instantiate Sigma with the correct nodeReducer signature
  sigmaInstance = new Sigma(G, container, {
    nodeReducer: (nodeId, data) => {
      // If not highlighted, draw normally:
      if (!G.getNodeAttribute(nodeId, "_highlighted")) return data;
      // If highlighted, first draw a white halo (by returning
      // white + bigger size), then Sigma will draw the real node
      // on top in the next pass automatically.
      return {
        ...data,
        color: "#ff746c",
        size:  data.size * 1.4
      };
    }
  });


    // … after instantiating Sigma and before returning or ending initTopology …

  // 1) Snapshot final positions
  const finalPos = {};
  G.forEachNode(n => {
    finalPos[n] = {
      x: G.getNodeAttribute(n, "x"),
      y: G.getNodeAttribute(n, "y")
    };
    // reset each to the center (or any single start location)
    G.setNodeAttribute(n, "x", 0);
    G.setNodeAttribute(n, "y", 0);
  });
  sigmaInstance.refresh();

  // 2) Animate nodes into place with wobble
  const duration = 600;                   // ms
  const start    = performance.now();

  function animate(time) {
    const t = Math.min((time - start) / duration, 1);  // [0,1]
    const wobbleAmp = (1 - t) * 3;                   // decaying from 0.5 to 0
    const eased= 1 - Math.pow(1 - t, 5);

    G.forEachNode(n => {
      const { x: fx, y: fy } = finalPos[n];
      // linear interp + random jitter
      const x = fx * t  * eased + (Math.random() *0.2);
      const y = fy * t  * eased + (Math.random() *0.4);
      G.setNodeAttribute(n, "x", x);
      G.setNodeAttribute(n, "y", y);
    });

    sigmaInstance.refresh();
    if (t < 1) requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);

  



  // 10) Hover handlers
  sigmaInstance.on("enterNode", ({node}) => {
    const using = new Set(nodeToPaths[node] || []);

    // Highlight edges
    G.forEachEdge((e, _, s, t) => {
      const active = pathEdges.some((set, pi) => using.has(pi) && set.has(`${s}:::${t}`));
      G.setEdgeAttribute(e, "color", active ? "#a47dab" : "#888");
      G.setEdgeAttribute(e, "size",  active ? 3     : 1);
    });

    // Toggle node highlight flags
    G.forEachNode(n => {
      const active = (nodeToPaths[n] || []).some(pi => using.has(pi));
      G.setNodeAttribute(n, "_highlighted", active);
    });

    sigmaInstance.refresh();
  });

  sigmaInstance.on("leaveNode", () => {
    // Reset edges
    G.forEachEdge(e => {
      G.setEdgeAttribute(e, "color", "#888");
      G.setEdgeAttribute(e, "size", 1);
    });
    // Clear highlight flags
    G.forEachNode(n => G.setNodeAttribute(n, "_highlighted", false));
    sigmaInstance.refresh();
  });
}










// wire up
document.addEventListener("DOMContentLoaded", ()=>{
  document.getElementById("generate").addEventListener("click", initTopology);
});
