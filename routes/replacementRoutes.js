// routes/replacementRoutes.js

const express = require("express");
const router = express.Router();

const replacementController = require("../controllers/replacementController");
const { verifyToken, allowRoles } = require("../middlewares/authMiddleware");

router.use(verifyToken);

router.get("/lookup-old-serial", replacementController.lookupOldSerial);
router.get("/lookup-new-serial", replacementController.lookupNewSerial);
router.get("/stats", replacementController.getStats);
router.get("/", replacementController.getAllReplacements);
router.get("/:id", replacementController.getReplacementById);
router.post("/", allowRoles("admin", "super_admin", "staff"), replacementController.createReplacement);
router.put("/:id/status", allowRoles("admin", "super_admin", "staff"), replacementController.updateReplacementStatus);
router.delete("/:id", allowRoles("admin", "super_admin"), replacementController.deleteReplacement);

module.exports = router;
