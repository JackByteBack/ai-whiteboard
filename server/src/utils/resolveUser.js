const { query } = require("../config/db");
const neonAuth = require("../config/neonauth");
const ApiError = require("./ApiError");

const resolveUserFromToken = async (token) => {
  let claims;
  try {
    claims = await neonAuth.verify(token);
  } catch {
    throw ApiError.unauthorized("Invalid or expired token");
  }
  const email = String(claims.email || "").trim().toLowerCase();
  const name = String(claims.name || claims.email || "User").trim();
  if (!email) throw ApiError.unauthorized("Neon Auth session has no email");

  const { rows } = await query(
    `INSERT INTO users (name, email)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, email, name`,
    [name, email]
  );
  return { id: rows[0].id, email: rows[0].email, name: rows[0].name };
};

module.exports = { resolveUserFromToken };
