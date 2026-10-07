const { query } = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { emitToBoard } = require("../realtime");
const { deleteUploadByUrl } = require("../utils/fileCleanup");

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const listBoards = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT b.id, b.title, b.description, b.background, b.bg_color, b.owner_id,
            b.created_at, b.updated_at,
            (b.owner_id = $1) AS is_owner,
            COALESCE(cnt.n, 0)::int AS element_count
       FROM whiteboards b
       LEFT JOIN whiteboard_members m
         ON m.whiteboard_id = b.id AND m.user_id = $1
       LEFT JOIN (
         SELECT whiteboard_id, COUNT(*) AS n FROM elements GROUP BY whiteboard_id
       ) cnt ON cnt.whiteboard_id = b.id
      WHERE b.owner_id = $1 OR m.user_id = $1
      ORDER BY b.updated_at DESC`,
    [req.user.id]
  );
  res.json({ boards: rows });
});

const createBoard = asyncHandler(async (req, res) => {
  const title = (req.body.title || "").trim() || "Untitled whiteboard";
  const description = (req.body.description || "").trim() || null;
  const background = ["dots", "grid", "plain"].includes(req.body.background)
    ? req.body.background
    : "dots";
  const bg_color = HEX_RE.test(req.body.bg_color || "") ? req.body.bg_color : "#ffffff";

  const { rows } = await query(
    `INSERT INTO whiteboards (title, description, background, bg_color, owner_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [title, description, background, bg_color, req.user.id]
  );
  res.status(201).json({ board: rows[0] });
});

const getBoard = asyncHandler(async (req, res) => {
  const [boardRes, elementsRes, membersRes] = await Promise.all([
    query("SELECT * FROM whiteboards WHERE id = $1", [req.board.id]),
    query(
      "SELECT id, type, data, z, created_by, updated_at FROM elements WHERE whiteboard_id = $1 ORDER BY z ASC",
      [req.board.id]
    ),
    query(
      `SELECT u.id, u.name, u.email, u.avatar_url, 'owner' AS role
         FROM whiteboards b
         JOIN users u ON u.id = b.owner_id
        WHERE b.id = $1
       UNION
       SELECT u.id, u.name, u.email, u.avatar_url, m.role
         FROM whiteboard_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.whiteboard_id = $1`,
      [req.board.id]
    ),
  ]);

  res.json({
    board: { ...boardRes.rows[0], role: req.board.role },
    elements: elementsRes.rows,
    members: membersRes.rows,
  });
});

const updateBoard = asyncHandler(async (req, res) => {
  const fields = [];
  const values = [];
  let i = 1;

  if (req.body.title !== undefined) {
    fields.push(`title = $${i++}`);
    values.push((req.body.title || "").trim() || "Untitled whiteboard");
  }
  if (req.body.description !== undefined) {
    fields.push(`description = $${i++}`);
    values.push((req.body.description || "").trim() || null);
  }
  if (req.body.background !== undefined && ["dots", "grid", "plain"].includes(req.body.background)) {
    fields.push(`background = $${i++}`);
    values.push(req.body.background);
  }
  if (req.body.bg_color !== undefined && HEX_RE.test(req.body.bg_color)) {
    fields.push(`bg_color = $${i++}`);
    values.push(req.body.bg_color);
  }
  if (!fields.length) throw ApiError.badRequest("No valid fields to update");

  fields.push(`updated_at = now()`);
  values.push(req.board.id);

  const { rows } = await query(
    `UPDATE whiteboards SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  emitToBoard(req.board.id, "board:updated", rows[0], req.get("x-socket-id"));
  res.json({ board: rows[0] });
});

const deleteBoard = asyncHandler(async (req, res) => {
  if (req.board.role !== "owner") throw ApiError.forbidden("Only the owner can delete a whiteboard");

  const imgs = await query(
    `SELECT data FROM elements WHERE whiteboard_id = $1 AND type = 'image'`,
    [req.board.id]
  );
  for (const r of imgs.rows) deleteUploadByUrl(r.data?.src);

  await query("DELETE FROM whiteboards WHERE id = $1", [req.board.id]);
  res.json({ success: true });
});

const addMember = asyncHandler(async (req, res) => {
  if (req.board.role !== "owner") throw ApiError.forbidden("Only the owner can share this whiteboard");
  const email = (req.body.email || "").trim().toLowerCase();
  const role = ["editor", "viewer"].includes(req.body.role) ? req.body.role : "editor";
  if (!email) throw ApiError.badRequest("An email is required");

  const userRes = await query("SELECT id, name, email, avatar_url FROM users WHERE email = $1", [email]);
  const invitee = userRes.rows[0];
  if (!invitee) throw ApiError.notFound("No user found with that email");
  if (invitee.id === req.board.owner_id) throw ApiError.badRequest("The owner already has full access");

  await query(
    `INSERT INTO whiteboard_members (whiteboard_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (whiteboard_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [req.board.id, invitee.id, role]
  );

  const member = { ...invitee, role };
  emitToBoard(req.board.id, "member:added", member);
  res.status(201).json({ member });
});

const removeMember = asyncHandler(async (req, res) => {
  if (req.board.role !== "owner") throw ApiError.forbidden("Only the owner can manage members");
  await query(
    "DELETE FROM whiteboard_members WHERE whiteboard_id = $1 AND user_id = $2",
    [req.board.id, req.params.userId]
  );
  emitToBoard(req.board.id, "member:removed", { userId: req.params.userId });
  res.json({ success: true });
});

module.exports = {
  listBoards,
  createBoard,
  getBoard,
  updateBoard,
  deleteBoard,
  addMember,
  removeMember,
};
