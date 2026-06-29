(() => {
  const NORMAL = "normal";
  const ENTRY = "entry";
  const EXIT = "exit";
  const NODE_COLORS = {
    [NORMAL]: "#7aa2ff",
    [ENTRY]: "#39d98a",
    [EXIT]: "#ff7b72"
  };

  const state = {
    nodes: new Map(),
    edges: [],
    positions: new Map(),
    pathEdgeKeys: new Set(),
    editMode: false,
    renderer: null,
    graph: null,
    wobbleFrame: null,
    draggingNode: null,
    suppressNextClick: false,
    syncingEditors: false
  };

  const els = {
    container: document.getElementById("container"),
    nodeCount: document.getElementById("nodeCount"),
    attachCount: document.getElementById("attachCount"),
    seedCount: document.getElementById("seedCount"),
    clickRole: document.getElementById("clickRole"),
    generate: document.getElementById("generate"),
    editMode: document.getElementById("editMode"),
    calculate: document.getElementById("calculate"),
    clearPaths: document.getElementById("clearPaths"),
    nodeEditor: document.getElementById("nodeEditor"),
    edgeEditor: document.getElementById("edgeEditor"),
    message: document.getElementById("message"),
    paths: document.getElementById("paths"),
    nodeTotal: document.getElementById("nodeTotal"),
    edgeTotal: document.getElementById("edgeTotal"),
    entryTotal: document.getElementById("entryTotal"),
    exitTotal: document.getElementById("exitTotal")
  };

  if (!window.graphology || !window.Sigma) {
    setMessage("Graph libraries failed to load. Check your connection and reload the page.", true);
    return;
  }

  function edgeKey(a, b) {
    return [a, b].sort().join("--");
  }

  function sanitizeId(value) {
    return value.trim().replace(/\s+/g, "_");
  }

  function setMessage(text, isError = false) {
    els.message.textContent = text;
    els.message.classList.toggle("error", isError);
  }

  function addNode(id, type = NORMAL) {
    if (!id) return;
    state.nodes.set(id, [NORMAL, ENTRY, EXIT].includes(type) ? type : NORMAL);
    if (!state.positions.has(id)) {
      state.positions.set(id, {
        x: Math.cos(state.positions.size) + (Math.random() - 0.5),
        y: Math.sin(state.positions.size) + (Math.random() - 0.5)
      });
    }
  }

  function addEdge(source, target) {
    if (!source || !target || source === target) return false;
    if (!state.nodes.has(source) || !state.nodes.has(target)) return false;
    const key = edgeKey(source, target);
    if (state.edges.some(edge => edge.key === key)) return false;
    state.edges.push({ source, target, key });
    return true;
  }

  function generateBarabasiAlbert(totalNodes, attachCount, seedCount) {
    state.nodes.clear();
    state.edges = [];
    state.positions.clear();
    state.pathEdgeKeys.clear();
    els.paths.innerHTML = "";

    const n = Math.max(2, totalNodes);
    const seed = Math.min(Math.max(2, seedCount), n);
    const m = Math.min(Math.max(1, attachCount), seed);
    const weighted = [];

    for (let i = 0; i < seed; i += 1) {
      addNode(`N${i}`, NORMAL);
    }

    for (let i = 0; i < seed; i += 1) {
      for (let j = i + 1; j < seed; j += 1) {
        addEdge(`N${i}`, `N${j}`);
      }
    }

    state.nodes.forEach((_, id) => {
      const degree = Math.max(1, state.edges.filter(edge => edge.source === id || edge.target === id).length);
      for (let i = 0; i < degree; i += 1) weighted.push(id);
    });

    for (let i = seed; i < n; i += 1) {
      const id = `N${i}`;
      const targets = new Set();
      addNode(id, NORMAL);

      while (targets.size < Math.min(m, i)) {
        targets.add(weighted[Math.floor(Math.random() * weighted.length)]);
      }

      targets.forEach(target => {
        addEdge(id, target);
        weighted.push(id, target);
      });
    }

    state.nodes.set("N0", ENTRY);
    state.nodes.set(`N${n - 1}`, EXIT);
  }

  function buildGraph(runLayout = false) {
    const GraphClass = graphology.UndirectedGraph || graphology.Graph;
    const graph = new GraphClass({ multi: false, allowSelfLoops: false });

    state.nodes.forEach((type, id) => {
      const position = state.positions.get(id) || { x: Math.random(), y: Math.random() };
      graph.addNode(id, {
        label: id,
        x: position.x,
        y: position.y,
        size: 7,
        color: NODE_COLORS[type],
        borderColor: NODE_COLORS[type],
        role: type
      });
    });

    state.edges.forEach(edge => {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return;
      graph.addEdgeWithKey(edge.key, edge.source, edge.target, {
        color: state.pathEdgeKeys.has(edge.key) ? "#ffd166" : "#626262",
        size: state.pathEdgeKeys.has(edge.key) ? 3 : 1
      });
    });

    if (runLayout && graph.order > 1 && window.forceAtlas2) {
      forceAtlas2.assign(graph, {
        iterations: 180,
        scalingRatio: 8,
        gravity: 0.08,
        edgeWeightInfluence: 0,
        barnesHutOptimize: true
      });
    }

    graph.forEachNode(id => {
      state.positions.set(id, {
        x: graph.getNodeAttribute(id, "x"),
        y: graph.getNodeAttribute(id, "y")
      });
    });

    return graph;
  }

  function render(runLayout = false) {
    const graph = buildGraph(runLayout);
    if (state.wobbleFrame) {
      window.cancelAnimationFrame(state.wobbleFrame);
      state.wobbleFrame = null;
    }
    if (state.renderer) {
      state.renderer.kill();
    }

    state.graph = graph;
    state.renderer = new Sigma(graph, els.container, {
      renderEdgeLabels: false,
      labelDensity: 0.12,
      labelRenderedSizeThreshold: 7,
      labelColor: { color: "#ffffff" },
      defaultEdgeColor: "#626262"
    });

    state.renderer.on("clickNode", ({ node }) => {
      if (state.suppressNextClick) {
        state.suppressNextClick = false;
        return;
      }
      if (!state.editMode) return;
      const nextType = nextRole(state.nodes.get(node));
      state.nodes.set(node, nextType);
      state.pathEdgeKeys.clear();
      els.paths.innerHTML = "";
      syncEditors();
      render(false);
      setMessage(`${node} set to ${nextType}.`);
    });

    enableNodeDragging(graph);
    startWobble(graph);
    updateStats();
  }

  function updateNodePosition(node, position) {
    state.positions.set(node, { x: position.x, y: position.y });
    state.graph.setNodeAttribute(node, "x", position.x);
    state.graph.setNodeAttribute(node, "y", position.y);
  }

  function enableNodeDragging(graph) {
    let moved = false;
    const mouse = state.renderer.getMouseCaptor();

    state.renderer.on("downNode", ({ node, event }) => {
      state.draggingNode = node;
      moved = false;
      els.container.classList.add("dragging");
      graph.setNodeAttribute(node, "size", 9);
      if (event && event.preventSigmaDefault) event.preventSigmaDefault();
      if (event && event.original) {
        event.original.preventDefault();
        event.original.stopPropagation();
      }
    });

    mouse.on("mousemovebody", event => {
      if (!state.draggingNode) return;
      moved = true;
      const position = state.renderer.viewportToGraph({ x: event.x, y: event.y });
      updateNodePosition(state.draggingNode, position);
      if (event.preventSigmaDefault) event.preventSigmaDefault();
      if (event.original) {
        event.original.preventDefault();
        event.original.stopPropagation();
      }
    });

    mouse.on("mouseup", () => {
      if (!state.draggingNode) return;
      graph.setNodeAttribute(state.draggingNode, "size", 7);
      state.suppressNextClick = moved;
      state.draggingNode = null;
      els.container.classList.remove("dragging");
    });
  }

  function startWobble(graph) {
    const amplitude = 0.035;
    const speed = 0.0022;

    function tick(time) {
      graph.forEachNode(id => {
        if (id === state.draggingNode) return;
        const base = state.positions.get(id);
        if (!base) return;
        const phase = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
        graph.setNodeAttribute(id, "x", base.x + Math.sin(time * speed + phase) * amplitude);
        graph.setNodeAttribute(id, "y", base.y + Math.cos(time * speed * 1.17 + phase) * amplitude);
      });
      state.renderer.refresh();
      state.wobbleFrame = window.requestAnimationFrame(tick);
    }

    state.wobbleFrame = window.requestAnimationFrame(tick);
  }

  function nextRole(current) {
    const action = els.clickRole.value;
    if (action !== "cycle") return action;
    if (current === NORMAL) return ENTRY;
    if (current === ENTRY) return EXIT;
    return NORMAL;
  }

  function syncEditors() {
    state.syncingEditors = true;
    els.nodeEditor.value = [...state.nodes.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([id, type]) => `${id},${type}`)
      .join("\n");
    els.edgeEditor.value = [...state.edges]
      .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
      .map(edge => `${edge.source},${edge.target}`)
      .join("\n");
    state.syncingEditors = false;
  }

  function parseEditors() {
    if (state.syncingEditors) return;

    const nextNodes = new Map();
    const nextEdges = [];
    const errors = [];

    els.nodeEditor.value.split(/\n/).forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const [rawId, rawType = NORMAL] = trimmed.split(",").map(part => part.trim());
      const id = sanitizeId(rawId);
      const type = rawType.toLowerCase();
      if (!id) {
        errors.push(`Node line ${index + 1} has no id.`);
        return;
      }
      if (![NORMAL, ENTRY, EXIT].includes(type)) {
        errors.push(`Node line ${index + 1} has unknown type "${rawType}".`);
        return;
      }
      nextNodes.set(id, type);
      if (!state.positions.has(id)) {
        state.positions.set(id, {
          x: Math.random() * 2 - 1,
          y: Math.random() * 2 - 1
        });
      }
    });

    const seenEdges = new Set();
    els.edgeEditor.value.split(/\n/).forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const [rawSource, rawTarget] = trimmed.split(",").map(part => sanitizeId(part || ""));
      if (!rawSource || !rawTarget) {
        errors.push(`Edge line ${index + 1} needs source,target.`);
        return;
      }
      if (rawSource === rawTarget) {
        errors.push(`Edge line ${index + 1} is a self-loop.`);
        return;
      }
      if (!nextNodes.has(rawSource) || !nextNodes.has(rawTarget)) {
        errors.push(`Edge line ${index + 1} references a missing node.`);
        return;
      }
      const key = edgeKey(rawSource, rawTarget);
      if (seenEdges.has(key)) return;
      seenEdges.add(key);
      nextEdges.push({ source: rawSource, target: rawTarget, key });
    });

    if (errors.length) {
      setMessage(errors.slice(0, 3).join(" "), true);
      return;
    }

    state.nodes = nextNodes;
    state.edges = nextEdges;
    state.pathEdgeKeys.clear();
    els.paths.innerHTML = "";
    setMessage("Graph updated from editor.");
    render(false);
  }

  function updateStats() {
    els.nodeTotal.textContent = state.nodes.size;
    els.edgeTotal.textContent = state.edges.length;
    els.entryTotal.textContent = [...state.nodes.values()].filter(type => type === ENTRY).length;
    els.exitTotal.textContent = [...state.nodes.values()].filter(type => type === EXIT).length;
  }

  function adjacency() {
    const adj = new Map();
    state.nodes.forEach((_, id) => adj.set(id, []));
    state.edges.forEach(edge => {
      adj.get(edge.source).push(edge.target);
      adj.get(edge.target).push(edge.source);
    });
    return adj;
  }

  function allShortestPaths(source, target, adj) {
    const queue = [source];
    const distance = new Map([[source, 0]]);
    const parents = new Map([[source, []]]);

    for (let i = 0; i < queue.length; i += 1) {
      const node = queue[i];
      const nextDistance = distance.get(node) + 1;
      for (const neighbor of adj.get(node) || []) {
        if (!distance.has(neighbor)) {
          distance.set(neighbor, nextDistance);
          parents.set(neighbor, [node]);
          queue.push(neighbor);
        } else if (distance.get(neighbor) === nextDistance) {
          parents.get(neighbor).push(node);
        }
      }
    }

    if (!distance.has(target)) return [];

    const paths = [];
    function backtrack(node, path) {
      if (node === source) {
        paths.push([source, ...path.reverse()]);
        return;
      }
      for (const parent of parents.get(node) || []) {
        backtrack(parent, [...path, node]);
      }
    }
    backtrack(target, []);
    return paths;
  }

  function calculatePaths() {
    const entries = [...state.nodes.entries()].filter(([, type]) => type === ENTRY).map(([id]) => id);
    const exits = [...state.nodes.entries()].filter(([, type]) => type === EXIT).map(([id]) => id);

    state.pathEdgeKeys.clear();
    els.paths.innerHTML = "";

    if (!entries.length || !exits.length) {
      setMessage("Set at least one entry node and one exit node.", true);
      render(false);
      return;
    }

    const adj = adjacency();
    const allPaths = [];

    entries.forEach(entry => {
      exits.forEach(exit => {
        if (entry === exit) return;
        allShortestPaths(entry, exit, adj).forEach(path => allPaths.push(path));
      });
    });

    allPaths.forEach(path => {
      for (let i = 0; i < path.length - 1; i += 1) {
        state.pathEdgeKeys.add(edgeKey(path[i], path[i + 1]));
      }
    });

    if (!allPaths.length) {
      els.paths.textContent = "No entry-to-exit path exists.";
      setMessage("No shortest paths found.");
    } else {
      const fragment = document.createDocumentFragment();
      allPaths.forEach((path, index) => {
        const div = document.createElement("div");
        div.className = "path-item";
        div.textContent = `${index + 1}. ${path.join(" -> ")} (${path.length - 1} edges)`;
        fragment.appendChild(div);
      });
      els.paths.appendChild(fragment);
      setMessage(`Calculated ${allPaths.length} shortest path${allPaths.length === 1 ? "" : "s"}.`);
    }

    render(false);
  }

  function debounce(fn, wait) {
    let timeout;
    return (...args) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => fn(...args), wait);
    };
  }

  els.generate.addEventListener("click", () => {
    const totalNodes = Number.parseInt(els.nodeCount.value, 10);
    const attachCount = Number.parseInt(els.attachCount.value, 10);
    const seedCount = Number.parseInt(els.seedCount.value, 10);
    generateBarabasiAlbert(totalNodes, attachCount, seedCount);
    syncEditors();
    render(true);
    setMessage("Generated a Barabasi-Albert graph.");
  });

  els.editMode.addEventListener("click", () => {
    state.editMode = !state.editMode;
    els.editMode.classList.toggle("active", state.editMode);
    els.editMode.setAttribute("aria-pressed", String(state.editMode));
    els.editMode.textContent = state.editMode ? "click on" : "click off";
    setMessage(state.editMode ? "Click nodes to change their role." : "Node click editing disabled.");
  });

  els.calculate.addEventListener("click", calculatePaths);
  els.clearPaths.addEventListener("click", () => {
    state.pathEdgeKeys.clear();
    els.paths.innerHTML = "";
    setMessage("Path highlights cleared.");
    render(false);
  });

  const parseEditorsDebounced = debounce(parseEditors, 300);
  els.nodeEditor.addEventListener("input", parseEditorsDebounced);
  els.edgeEditor.addEventListener("input", parseEditorsDebounced);

  generateBarabasiAlbert(
    Number.parseInt(els.nodeCount.value, 10),
    Number.parseInt(els.attachCount.value, 10),
    Number.parseInt(els.seedCount.value, 10)
  );
  syncEditors();
  render(true);
  setMessage("Generated a Barabasi-Albert graph.");
})();
