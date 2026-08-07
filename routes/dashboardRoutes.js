// routes/dashboardRoutes.js

const express = require("express");
const router = express.Router();

const dashboardController = require("../controllers/dashboardController");
const { verifyToken } = require("../middlewares/authMiddleware");

router.use(verifyToken);

router.get("/kpis", dashboardController.getKPIs);
router.get("/alerts", dashboardController.getAlerts);
router.get("/recent-dispatch", dashboardController.getRecentDispatch);
router.get("/recent-warranty", dashboardController.getRecentWarranty);
router.get("/top-dealers", dashboardController.getTopDealers);
router.get("/reward-summary", dashboardController.getRewardSummary);
router.get("/recent-activity", dashboardController.getRecentActivity);
router.get("/search", dashboardController.quickSearch);

module.exports = router;
