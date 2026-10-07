const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { resolveUserFromToken } = require("../utils/resolveUser");

const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized("Missing authentication token");

  try {
    req.user = await resolveUserFromToken(token);
  } catch (err) {
    if (err.isApiError) throw err;
    throw ApiError.unauthorized("Invalid or expired token");
  }
  next();
});

module.exports = { requireAuth };
