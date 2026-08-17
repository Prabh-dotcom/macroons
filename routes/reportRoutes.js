// routes/reportRoutes.js

const express = require("express");
const router = express.Router();

const reportController = require("../controllers/reportController");
const { verifyToken } = require("../middlewares/authMiddleware");

router.use(verifyToken);

router.get("/stats", reportController.getDashboardStats);
router.get("/summary", reportController.getSummary);
router.get("/charts", reportController.getCharts);
router.get("/", reportController.getReports);

module.exports = router;