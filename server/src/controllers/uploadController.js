const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const storage = require("../config/storage");
const { UPLOAD_DIR } = require("../config/uploads");

const EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest("No image file provided");

  const ext = EXT[req.file.mimetype] || "bin";
  const key = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;

  let url;
  if (storage.isEnabled()) {
    url = await storage.putObject(key, req.file.buffer, req.file.mimetype);
  } else {
    fs.writeFileSync(path.join(UPLOAD_DIR, key), req.file.buffer);
    const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
    url = `${base}/uploads/${key}`;
  }

  res.status(201).json({ url, size: req.file.size, mimetype: req.file.mimetype });
});

module.exports = { uploadImage };
