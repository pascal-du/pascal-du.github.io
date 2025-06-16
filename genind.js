// genind.js

let sigmaInstance;

// 1) Layer generators (unchanged)…
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
        const dx = pos[a].x - pos[b].x,
              dy = pos[a].y - pos[b].y;
        if (Math.hypot(dx, dy) < r) g.addEdge(a, b);
      })
    );
  } else if (type === "wm") {
    const α = 0.2, β = 0.4, dmax = Math.SQRT2, ids = g.nodes();
    ids.forEach((a,i) =>
      ids.slice(i+1).forEach(b => {
        const dx = pos[a].x - pos[b].x,
              dy = pos[a].y - pos[b].y,
              d  = Math.hypot(dx, dy);
        if (Math.random() < α * Math.exp(-d/(β*dmax)))
          g.addEdge(a, b);
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
    if (type === "mesh" || type === "star") {
      cluster.slice(1).forEach(b => g.addEdge(cluster[0], b));
    } else if (type === "ring") {
      cluster.forEach((n,j) =>
        g.addEdge(n, cluster[(j+1)%cluster.length])
      );
    } else if (type === "bus") {
      cluster.slice(0,-1).forEach((n,j) =>
        g.addEdge(n, cluster[j+1])
      );
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
    cluster.slice(1).forEach(b => g.addEdge(cluster[0], b));
  }
  return { graph: g, ids };
}

function combineGraph(base, netIds, ctrlIds, sensIds, clusters = 5, fixed = 3) {
  const sortedNet = [...netIds].sort();
  // connect controller → network
  for (let i = 0; i < clusters; i++) {
    const ctr = ctrlIds.filter(n => n.startsWith(`C${i}_`)).sort();
    for (let j = 0; j < fixed; j++) {
      base.addEdge(ctr[j % ctr.length], sortedNet[(i + j) % sortedNet.length]);
    }
  }
  // connect each controller cluster to its sensor cluster
  for (let i = 0; i < clusters; i++) {
    const c0 = ctrlIds.filter(n => n.startsWith(`C${i}_`)).sort()[0];
    const s0 = sensIds.filter(n => n.startsWith(`S${i}_`)).sort()[0];
    if (c0 && s0) base.addEdge(c0, s0);
  }
  return base;
}

// 2) Main routine:
function initTopology() {
  const container = document.getElementById("container");
  if (sigmaInstance) {
    sigmaInstance.kill();
    container.innerHTML = "";
  }

  // a) read inputs
  const numNetwork  = parseInt(document.getElementById("inpNetwork").value, 10);
  const numClusters = parseInt(document.getElementById("inpClusters").value, 10);
  const perCluster  = parseInt(document.getElementById("inpPerCluster").value, 10);

  // b) gen layers
  const net  = generateNetworkLayer(numNetwork,  "ba");
  const ctrl = generateControllerLayer(numClusters, perCluster, "ring");
  const sens = generateSensorLayer(numClusters, perCluster);

  // c) merge into G
  const G = new graphology.Graph();
  [net.graph, ctrl.graph, sens.graph].forEach(layer => {
    layer.forEachNode((n,attrs) => G.addNode(n, { ...attrs }));
    layer.forEachEdge((e,attrs,s,t) => G.addEdge(s, t, { key:e, ...attrs }));
  });

  // d) stitch cross-layer edges
  combineGraph(G, net.ids, ctrl.ids, sens.ids, numClusters, perCluster - 1);

  // e) define layout constants
  const rNet      = 1.0;
  const rCtrl     = 2.0;
  const rSens     = 3.0;
  const sliceAngle = (2 * Math.PI) / numClusters;
  // dynamic entry/target
  const entry  = [net.ids[0], net.ids[net.ids.length - 1]];
  const target = [
    `S${numClusters-1}_${perCluster-1}`,
    `S${numClusters-2}_${perCluster-1}`
  ];

  // f) assign concentric (x,y) + color + size
  G.forEachNode(n => {
    let radius, angle;
    if (n.startsWith("N")) {
      radius = Math.random() * 0.5 * rNet;
      angle  = Math.random() * 2 * Math.PI;
    } else if (n.startsWith("C")) {
      const i = +n.match(/^C(\d+)_/)[1];
      angle  = i * sliceAngle + (Math.random()-0.5)*sliceAngle*0.4;
      radius = rCtrl + (Math.random()-0.5)*0.2;
    } else {
      const i = +n.match(/^S(\d+)_/)[1];
      angle  = i * sliceAngle + (Math.random()-0.5)*sliceAngle*0.4;
      radius = rSens + (Math.random()-0.5)*0.2;
    }

    // guaranteed numeric
    G.setNodeAttribute(n, "x", radius * Math.cos(angle));
    G.setNodeAttribute(n, "y", radius * Math.sin(angle));
    G.setNodeAttribute(n, "size", 5 + Math.random()*5);

    let c = "blue";
    if (entry.includes(n))       c = "green";
    else if (target.includes(n)) c = "purple";
    else if (n.startsWith("C"))   c = "red";
    else if (n.startsWith("S"))   c = "orange";
    G.setNodeAttribute(n, "color", c);
    G.setNodeAttribute(n, "label", n);
  });

  // g) enforce minimum spacing via ForceAtlas2
  forceAtlas2.assign(G, {
    iterations:                     200,
    scalingRatio:                   10,
    gravity:                        0.1,
    outboundAttractionDistribution: false,
    edgeWeightInfluence:            0,
    barnesHutOptimize:              true,
    barnesHutTheta:                 0.5
  });

  // h) finally render
  sigmaInstance = new Sigma(G, container);
}

// wire up button
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("generate")
          .addEventListener("click", initTopology);
});
