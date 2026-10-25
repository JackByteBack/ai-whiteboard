require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");

const { errorHandler, notFoundHandler } = require("./src/middleware/errorHandler");
const apiRoutes = require("./src/routes");
const { initSocket } = require("./src/socket");
const { UPLOAD_DIR } = require("./src/config/uploads");
const storage = require("./src/config/storage");

const app = express();

app.use(
  cors({
    // comma-separated list; vite falls back to 5174 when 5173 is taken
    origin: (process.env.CLIENT_URL || "http://localhost:5173,http://localhost:5174").split(","),
    credentials: true,
  })
);
app.use(express.json({ limit: "5mb" }));

app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "30d", immutable: true }));
app.get("/uploads/:key", async (req, res, next) => {
  if (!storage.isEnabled()) return next();
  try {
    const { stream, contentType, contentLength } = await storage.getObject(req.params.key);
    if (contentType) res.type(contentType);
    if (contentLength) res.set("Content-Length", String(contentLength));
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    stream.pipe(res);
  } catch (err) {
    next();
  }
});

app.get("/", (_req, res) =>
  res.json({ name: "AI Whiteboard Notes API", status: "running" })
);

app.use("/api", apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);
initSocket(server);

const PORT = process.env.PORT || 5050;
server.listen(PORT, () => {
  console.log(`API + Socket.IO listening on http://localhost:${PORT}`);
});

module.exports = app;
