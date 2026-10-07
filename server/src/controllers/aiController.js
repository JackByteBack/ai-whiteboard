const { query } = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const ai = require("../services/aiService");
const { emitToBoard } = require("../realtime");

const STICKY_COLORS = ["#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#ddd6fe", "#fed7aa"];
const STICKY = 190;
const GAP = 24;

const persistElements = async (boardId, userId, socketId, specs) => {
  const created = [];
  let z = Date.now();
  for (const s of specs) {
    const { rows } = await query(
      `INSERT INTO elements (whiteboard_id, type, data, z, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, type, data, z, created_by, updated_at`,
      [boardId, s.type, JSON.stringify(s.data), z++, userId]
    );
    created.push(rows[0]);
  }
  await query("UPDATE whiteboards SET updated_at = now() WHERE id = $1", [boardId]);
  for (const element of created) emitToBoard(boardId, "element:created", element, socketId);
  return created;
};

const brainstorm = asyncHandler(async (req, res) => {
  const topic = (req.body.topic || "").trim();
  if (!topic) throw ApiError.badRequest("A topic or prompt is required");
  const count = Math.min(Math.max(parseInt(req.body.count, 10) || 6, 1), 12);
  const originX = Number.isFinite(req.body.x) ? req.body.x : 80;
  const originY = Number.isFinite(req.body.y) ? req.body.y : 80;

  const notes = await ai.brainstormNotes(topic, count);
  const cols = Math.ceil(Math.sqrt(notes.length));

  const specs = notes.map((n, i) => ({
    type: "sticky",
    data: {
      x: originX + (i % cols) * (STICKY + GAP),
      y: originY + Math.floor(i / cols) * (STICKY + GAP),
      w: STICKY,
      h: STICKY,
      fill: STICKY_COLORS[i % STICKY_COLORS.length],
      text: n.text,
      fontSize: 16,
    },
  }));

  const elements = await persistElements(req.board.id, req.user.id, req.get("x-socket-id"), specs);
  res.status(201).json({ elements });
});

const outline = asyncHandler(async (req, res) => {
  const topic = (req.body.topic || "").trim();
  if (!topic) throw ApiError.badRequest("A topic is required");
  const count = Math.min(Math.max(parseInt(req.body.count, 10) || 6, 1), 12);
  const originX = Number.isFinite(req.body.x) ? req.body.x : 80;
  const originY = Number.isFinite(req.body.y) ? req.body.y : 80;

  const { title, points } = await ai.generateOutline(topic, count);

  const specs = [
    {
      type: "text",
      data: { x: originX, y: originY, w: 360, text: title, fontSize: 28, color: "#16161d", weight: 700 },
    },
    {
      type: "bullet",
      data: { x: originX, y: originY + 52, w: 360, items: points, fontSize: 16, color: "#16161d" },
    },
  ];

  const elements = await persistElements(req.board.id, req.user.id, req.get("x-socket-id"), specs);
  res.status(201).json({ elements });
});

const NODE = { rect: { w: 180, h: 72 }, ellipse: { w: 170, h: 72 }, diamond: { w: 170, h: 110 } };
const GAP_X = 60;
const GAP_Y = 80;

const borderPoint = (n, tx, ty) => {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const scale = 1 / Math.max(Math.abs(dx) / (n.w / 2), Math.abs(dy) / (n.h / 2));
  return { x: cx + dx * scale, y: cy + dy * scale };
};

const diagram = asyncHandler(async (req, res) => {
  const topic = (req.body.topic || "").trim();
  if (!topic) throw ApiError.badRequest("A topic is required");
  const count = Math.min(Math.max(parseInt(req.body.count, 10) || 8, 2), 12);
  const originX = Number.isFinite(req.body.x) ? req.body.x : 120;
  const originY = Number.isFinite(req.body.y) ? req.body.y : 120;

  const { nodes, edges } = await ai.generateDiagram(topic, count);

  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  const level = new Map(nodes.map((n) => [n.id, 0]));
  const queue = nodes.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id);
  if (!queue.length && nodes.length) queue.push(nodes[0].id);
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of edges.filter((e) => e.from === id)) {
      level.set(e.to, Math.max(level.get(e.to) || 0, (level.get(id) || 0) + 1));
      queue.push(e.to);
    }
  }

  const byLevel = {};
  for (const n of nodes) (byLevel[level.get(n.id)] ||= []).push(n);
  const placed = {};
  for (const [lvl, group] of Object.entries(byLevel)) {
    const y = originY + Number(lvl) * (NODE.diamond.h + GAP_Y);
    const rowW = group.reduce((s, n) => s + NODE[n.shape].w + GAP_X, -GAP_X);
    let cursor = originX + 200 - rowW / 2;
    for (const n of group) {
      const size = NODE[n.shape];
      placed[n.id] = { x: cursor, y, w: size.w, h: size.h };
      cursor += size.w + GAP_X;
    }
  }

  const specs = [];
  for (const n of nodes) {
    const p = placed[n.id];
    specs.push({
      type: n.shape,
      data: {
        x: p.x, y: p.y, w: p.w, h: p.h,
        fill: n.shape === "ellipse" ? "#ebf6ef" : n.shape === "diamond" ? "#fef9c3" : "#eef4ff",
        stroke: "#2f8159", strokeWidth: 2, radius: n.shape === "rect" ? 12 : 0,
        label: n.label,
      },
    });
  }
  for (const e of edges) {
    const a = placed[e.from], b = placed[e.to];
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const start = borderPoint(a, bc.x, bc.y);
    const end = borderPoint(b, ac.x, ac.y);
    specs.push({ type: "arrow", data: { x1: start.x, y1: start.y, x2: end.x, y2: end.y, stroke: "#475569", strokeWidth: 2 } });
    if (e.label) {
      specs.push({
        type: "text",
        data: { x: (start.x + end.x) / 2 + 6, y: (start.y + end.y) / 2 - 10, w: 60, text: e.label, fontSize: 13, color: "#475569", weight: 600 },
      });
    }
  }

  const elements = await persistElements(req.board.id, req.user.id, req.get("x-socket-id"), specs);
  res.status(201).json({ elements });
});

const chart = asyncHandler(async (req, res) => {
  const topic = (req.body.topic || "").trim();
  if (!topic) throw ApiError.badRequest("Describe the chart you want");
  const originX = Number.isFinite(req.body.x) ? req.body.x : 120;
  const originY = Number.isFinite(req.body.y) ? req.body.y : 120;

  const spec = await ai.generateChart(topic);
  const w = 380, h = 260;
  const elements = await persistElements(req.board.id, req.user.id, req.get("x-socket-id"), [
    { type: "chart", data: { x: originX, y: originY, w, h, ...spec } },
  ]);
  res.status(201).json({ elements });
});

const TEXT_FIELD = { text: "text", sticky: "text", bullet: "items", rect: "label", ellipse: "label", diamond: "label" };
const contentOf = (el) =>
  el.type === "bullet" ? (el.data.items || []).join("\n") : el.data[TEXT_FIELD[el.type]] || "";

const editSelection = asyncHandler(async (req, res) => {
  const instruction = (req.body.instruction || "").trim();
  const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
  if (!instruction) throw ApiError.badRequest("Describe the change you want");
  if (!ids.length) throw ApiError.badRequest("Select one or more elements first");

  const { rows } = await query(
    `SELECT id, type, data FROM elements
      WHERE whiteboard_id = $1 AND id = ANY($2)
        AND type IN ('text','sticky','bullet','rect','ellipse','diamond','chart')`,
    [req.board.id, ids]
  );

  const charts = rows.filter((el) => el.type === "chart");
  const editable = rows.filter((el) => el.type !== "chart" && contentOf(el).trim());
  if (!editable.length && !charts.length)
    throw ApiError.badRequest("None of the selected elements can be edited by AI");

  const persist = async (id, data) => {
    const { rows: r } = await query(
      `UPDATE elements SET data = $1, updated_at = now()
        WHERE id = $2 AND whiteboard_id = $3
        RETURNING id, type, data, z, created_by, updated_at`,
      [JSON.stringify(data), id, req.board.id]
    );
    if (r[0]) {
      updated.push(r[0]);
      emitToBoard(req.board.id, "element:updated", r[0], req.get("x-socket-id"));
    }
  };

  const updated = [];

  if (editable.length) {
    const items = editable.map((el) => ({ id: el.id, content: contentOf(el) }));
    const edits = await ai.editElements(instruction, items);
    for (const el of editable) {
      if (!edits.has(el.id)) continue;
      const content = edits.get(el.id);
      const data = { ...el.data };
      if (el.type === "bullet") data.items = content.split("\n").map((s) => s.trim()).filter(Boolean);
      else data[TEXT_FIELD[el.type]] = content;
      await persist(el.id, data);
    }
  }

  for (const c of charts) {
    const spec = await ai.editChart(instruction, c.data);
    await persist(c.id, { ...c.data, ...spec });
  }

  await query("UPDATE whiteboards SET updated_at = now() WHERE id = $1", [req.board.id]);
  res.json({ elements: updated });
});

const summary = asyncHandler(async (req, res) => {
  const [boardRes, elemRes] = await Promise.all([
    query("SELECT title FROM whiteboards WHERE id = $1", [req.board.id]),
    query(
      "SELECT type, data FROM elements WHERE whiteboard_id = $1 AND type IN ('text','sticky','bullet')",
      [req.board.id]
    ),
  ]);

  const notes = [];
  for (const el of elemRes.rows) {
    if (el.type === "bullet" && Array.isArray(el.data.items)) {
      notes.push(...el.data.items.map((s) => String(s)));
    } else if (el.data.text) {
      notes.push(String(el.data.text));
    }
  }

  const result = await ai.summarizeBoard({
    boardTitle: boardRes.rows[0]?.title || "Whiteboard",
    notes,
  });
  res.json({ summary: result });
});

module.exports = { brainstorm, outline, diagram, chart, editSelection, summary };
