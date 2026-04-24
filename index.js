const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const USER_ID = "kartikgupta_12082005";
const EMAIL_ID = "kg2834@srmist.edu.in";
const COLLEGE_ROLL_NUMBER = "RA2311033010045";

function isValidEntry(entry) {
  return /^[A-Z]->[A-Z]$/.test(entry);
}

function buildTrees(edges) {
  const children = {}; // parent -> [children]
  const parentCount = {}; // child -> parent (first parent wins)
  const allNodes = new Set();

  for (const edge of edges) {
    const [parent, child] = edge.split("->");
    allNodes.add(parent);
    allNodes.add(child);

    if (!children[parent]) children[parent] = [];

    // Diamond case: first-encountered parent edge wins
    if (parentCount[child] === undefined) {
      parentCount[child] = parent;
      children[parent].push(child);
    }
    // else: silently discard this edge (child already has a parent)
  }

  // Find roots: nodes that never appear as a child
  const childNodes = new Set(Object.keys(parentCount));
  const roots = [...allNodes].filter((n) => !childNodes.has(n)).sort();

  // Group nodes into connected components
  // For each root, do DFS to find all nodes in that tree
  const visited = new Set();
  const groups = [];

  for (const root of roots) {
    const group = [];
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (visited.has(node)) continue;
      visited.add(node);
      group.push(node);
      for (const child of children[node] || []) {
        stack.push(child);
      }
    }
    groups.push({ root, nodes: group });
  }

  // Remaining unvisited nodes form pure cycles (no root)
  const remaining = [...allNodes].filter((n) => !visited.has(n));
  if (remaining.length > 0) {
    // Group remaining into connected components
    const cycleAdj = {};
    for (const node of remaining) {
      cycleAdj[node] = [];
      for (const child of children[node] || []) {
        if (remaining.includes(child)) cycleAdj[node].push(child);
      }
      // also reverse edges
    }
    // BFS/DFS to find connected components among remaining
    const cycleVisited = new Set();
    for (const node of remaining.sort()) {
      if (cycleVisited.has(node)) continue;
      const group = [];
      const stack = [node];
      // undirected traversal for grouping
      const undirected = {};
      for (const n of remaining) {
        undirected[n] = new Set();
      }
      for (const n of remaining) {
        for (const c of children[n] || []) {
          if (remaining.includes(c)) {
            undirected[n].add(c);
            undirected[c].add(n);
          }
        }
      }
      const bfsQueue = [node];
      while (bfsQueue.length) {
        const cur = bfsQueue.shift();
        if (cycleVisited.has(cur)) continue;
        cycleVisited.add(cur);
        group.push(cur);
        for (const nb of undirected[cur] || []) {
          bfsQueue.push(nb);
        }
      }
      // Use lexicographically smallest node as root for pure cycles
      const cycleRoot = group.sort()[0];
      groups.push({ root: cycleRoot, nodes: group, isCycle: true });
    }
  }

  return { groups, children };
}

function hasCycle(root, children, nodes) {
  const nodeSet = new Set(nodes);
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  for (const n of nodes) color[n] = WHITE;

  function dfs(node) {
    color[node] = GRAY;
    for (const child of children[node] || []) {
      if (!nodeSet.has(child)) continue;
      if (color[child] === GRAY) return true;
      if (color[child] === WHITE && dfs(child)) return true;
    }
    color[node] = BLACK;
    return false;
  }

  return dfs(root);
}

function buildTree(node, children, visited = new Set()) {
  if (visited.has(node)) return {};
  visited.add(node);
  const subtree = {};
  for (const child of children[node] || []) {
    subtree[child] = buildTree(child, children, new Set(visited));
  }
  return subtree;
}

function calcDepth(node, children, visited = new Set()) {
  if (visited.has(node)) return 1;
  visited.add(node);
  const kids = children[node] || [];
  if (kids.length === 0) return 1;
  let max = 0;
  for (const child of kids) {
    const d = calcDepth(child, children, new Set(visited));
    if (d > max) max = d;
  }
  return 1 + max;
}

app.post("/bfhl", (req, res) => {
  const { data } = req.body;

  if (!Array.isArray(data)) {
    return res.status(400).json({ error: "data must be an array" });
  }

  const invalidEntries = [];
  const duplicateEdges = [];
  const validEdges = [];
  const seenEdges = new Set();

  for (let entry of data) {
    // Trim whitespace first
    const trimmed = typeof entry === "string" ? entry.trim() : String(entry);

    if (!isValidEntry(trimmed)) {
      invalidEntries.push(trimmed);
      continue;
    }

    // Self-loop check (already covered by regex but just in case)
    const [parent, child] = trimmed.split("->");
    if (parent === child) {
      invalidEntries.push(trimmed);
      continue;
    }

    if (seenEdges.has(trimmed)) {
      // Only push to duplicate_edges once regardless of repetitions
      if (!duplicateEdges.includes(trimmed)) {
        duplicateEdges.push(trimmed);
      }
    } else {
      seenEdges.add(trimmed);
      validEdges.push(trimmed);
    }
  }

  const { groups, children } = buildTrees(validEdges);

  const hierarchies = [];
  let totalTrees = 0;
  let totalCycles = 0;
  let largestDepth = -1;
  let largestRoot = null;

  for (const group of groups) {
    const { root, nodes, isCycle } = group;

    // Check for cycle even in non-pure-cycle groups
    const cycleDetected = isCycle || hasCycle(root, children, nodes);

    if (cycleDetected) {
      totalCycles++;
      hierarchies.push({
        root,
        tree: {},
        has_cycle: true,
      });
    } else {
      totalTrees++;
      const tree = { [root]: buildTree(root, children) };
      const depth = calcDepth(root, children);

      hierarchies.push({ root, tree, depth });

      // Track largest tree (tiebreak: lexicographically smaller root)
      if (
        depth > largestDepth ||
        (depth === largestDepth && root < largestRoot)
      ) {
        largestDepth = depth;
        largestRoot = root;
      }
    }
  }

  const summary = {
    total_trees: totalTrees,
    total_cycles: totalCycles,
    largest_tree_root: largestRoot || "",
  };

  return res.json({
    user_id: USER_ID,
    email_id: EMAIL_ID,
    college_roll_number: COLLEGE_ROLL_NUMBER,
    hierarchies,
    invalid_entries: invalidEntries,
    duplicate_edges: duplicateEdges,
    summary,
  });
});

app.get("/", (req, res) => res.send("BFHL API is running. Use POST /bfhl"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
