const { query } = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const requireBoardAccess = asyncHandler(async (req, _res, next) => {
  const boardId =
    req.params.boardId || req.params.id || req.body.board_id || req.query.board_id;

  if (!boardId) throw ApiError.badRequest("whiteboard id is required");

  const { rows } = await query(
    `SELECT b.id, b.owner_id, m.role
       FROM whiteboards b
       LEFT JOIN whiteboard_members m
         ON m.whiteboard_id = b.id AND m.user_id = $2
      WHERE b.id = $1`,
    [boardId, req.user.id]
  );

  const board = rows[0];
  if (!board) throw ApiError.notFound("Whiteboard not found");

  const isOwner = board.owner_id === req.user.id;
  if (!isOwner && !board.role) {
    throw ApiError.forbidden("You do not have access to this whiteboard");
  }

  req.board = {
    id: board.id,
    owner_id: board.owner_id,
    role: isOwner ? "owner" : board.role,
  };
  next();
});

const requireEditAccess = (req, _res, next) => {
  if (!req.board) return next(ApiError.forbidden("Access not resolved"));
  if (req.board.role === "viewer") {
    return next(ApiError.forbidden("You have view-only access to this whiteboard"));
    }
    next();
    };
module.exports = { requireBoardAccess, requireEditAccess };