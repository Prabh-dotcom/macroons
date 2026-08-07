// routes/warrantyRoutes.js

const express = require("express");
const router = express.Router();

const warrantyController = require("../controllers/warrantyController");
const { verifyToken, allowRoles } = require("../middlewares/authMiddleware");

router.use(verifyToken);

router.get("/lookup-serial", warrantyController.lookupSerial);
router.get("/", warrantyController.getAllWarranty);
router.get("/:id", warrantyController.getWarrantyById);
router.post("/", allowRoles("admin", "super_admin", "staff"), warrantyController.createWarranty);
router.delete("/:id", allowRoles("admin", "super_admin"), warrantyController.deleteWarranty);

module.exports = router;
