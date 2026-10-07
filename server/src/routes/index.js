const express = require("express");
const userRoutes = require("./userRoutes");
const whiteboardRoutes = require("./whiteboardRoutes");

const router = express.Router();

router.get("/health", (_req, res) => res.json({ status: "ok" }));
router.use("/users", userRoutes);
router.use("/boards", whiteboardRoutes);
router.use("/whiteboards", whiteboardRoutes);

module.exports = router;
