// routes/warrantyRoutes.js

const express = require("express");
const router = express.Router();

const warrantyController = require("../controllers/warrantyController");
const { verifyToken, allowRoles } = require("../middlewares/authMiddleware");

router.use(verifyToken);

router.get("/lookup-serial", warrantyController.lookupSerial);
router.get("/stats/summary", warrantyController.getStats);
router.get("/", warrantyController.getAllWarranty);
router.get("/:id", warrantyController.getWarrantyById);
// "dealer" allowed too -- createWarranty itself enforces the 90-day
// self-activation window and that a dealer can only act on their own
// dispatched stock (see controllers/warrantyController.js).
router.post("/", allowRoles("admin", "super_admin", "staff", "dealer"), warrantyController.createWarranty);
router.delete("/:id", allowRoles("admin", "super_admin"), warrantyController.deleteWarranty);

module.exports = router;