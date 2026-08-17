// routes/settingsRoutes.js

const express = require("express");
const router = express.Router();

const settingsController = require("../controllers/settingsController");
const { verifyToken, allowRoles } = require("../middlewares/authMiddleware");

router.use(verifyToken);
router.use(allowRoles("admin", "super_admin"));

router.get("/", settingsController.getSettings);
router.put("/warranty", settingsController.updateWarrantySettings);
router.put("/reward", settingsController.updateRewardSettings);
router.put("/security", settingsController.updateSecuritySettings);

module.exports = router;