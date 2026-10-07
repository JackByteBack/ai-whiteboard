const { query } = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { emitToBoard } = require("../realtime");
const { deleteUploadByUrl } = require("../utils/fileCleanup");

const VALID_TYPES = [
  "text",
  "sticky",
  "rect",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "draw",
  "bullet",
  "image",
  "chart",
  "emoji",
];

const touchBoard = (boardId) =>
  query("UPDATE whiteboards SET updated_at = now() WHERE id = $1", [boardId]);

const createElement = asyncHandler(async (req, res) => {
  const { type } = req.body;
  if (!VALID_TYPES.includes(type)) throw ApiError.badRequest("Invalid element type");
  const data = req.body.data && typeof req.body.data === "object" ? req.body.data : {};
  const z = Number.isFinite(req.body.z) ? req.body.z : 1000;

  const { rows } = await query(
    `INSERT INTO elements (whiteboard_id, type, data, z, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, type, data, z, created_by, updated_at`,
    [req.board.id, type, JSON.stringify(data), z, req.user.id]
  );
  await touchBoard(req.board.id);

  const element = rows[0];
  emitToBoard(req.board.id, "element:created", element, req.get("x-socket-id"));
  res.status(201).json({ element });
});

const updateElement = asyncHandler(async (req, res) => {
  const fields = [];
  const values = [];
  let i = 1;

  if (req.body.data !== undefined) {
    if (typeof req.body.data !== "object") throw ApiError.badRequest("data must be an object");
    fields.push(`data = $${i++}`);
    values.push(JSON.stringify(req.body.data));
  }
  if (req.body.z !== undefined && Number.isFinite(req.body.z)) {
    fields.push(`z = $${i++}`);
    values.push(req.body.z);
  }
  if (!fields.length) throw ApiError.badRequest("No valid fields to update");

  fields.push(`updated_at = now()`);
  values.push(req.params.elementId, req.board.id);

  const { rows } = await query(
    `UPDATE elements SET ${fields.join(", ")}
      WHERE id = $${i++} AND whiteboard_id = $${i}
      RETURNING id, type, data, z, created_by, updated_at`,
    values
  );
  if (!rows.length) throw ApiError.notFound("Element not found");
  await touchBoard(req.board.id);

  const element = rows[0];
  emitToBoard(req.board.id, "element:updated", element, req.get("x-socket-id"));
  res.json({ element });
});

const deleteElement = asyncHandler(async (req, res) => {
  const { rows } = await query(
    "DELETE FROM elements WHERE id = $1 AND whiteboard_id = $2 RETURNING id, type, data",
    [req.params.elementId, req.board.id]
  );
  if (!rows[0]) throw ApiError.notFound("Element not found");
  if (rows[0].type === "image") deleteUploadByUrl(rows[0].data?.src);
  await touchBoard(req.board.id);

  emitToBoard(
    req.board.id,
    "element:deleted",
    { id: req.params.elementId },
    req.get("x-socket-id")
  );
  res.json({ success: true });
});

const bulkCreate = asyncHandler(async (req, res) => {
  const incoming = Array.isArray(req.body.elements) ? req.body.elements : [];
  const valid = incoming.filter((e) => VALID_TYPES.includes(e.type));
  if (!valid.length) throw ApiError.badRequest("No valid elements to create");

  const created = [];
  for (const e of valid) {
    const data = e.data && typeof e.data === "object" ? e.data : {};
    const z = Number.isFinite(e.z) ? e.z : 1000;
    const { rows } = await query(
      `INSERT INTO elements (whiteboard_id, type, data, z, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, type, data, z, created_by, updated_at`,
      [req.board.id, e.type, JSON.stringify(data), z, req.user.id]
    );
    created.push(rows[0]);
  }
  await touchBoard(req.board.id);

  for (const element of created) {
    emitToBoard(req.board.id, "element:created", element, req.get("x-socket-id"));
  }
  res.status(201).json({ elements: created });
});

module.exports = { createElement, updateElement, deleteElement, bulkCreate };
