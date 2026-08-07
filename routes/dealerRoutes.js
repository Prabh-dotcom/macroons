// routes/dealerRoutes.js

const express = require("express");
const router = express.Router();

const dealerController = require("../controllers/dealerController");
const { validateDealer } = require("../validators/dealerValidator");
const { verifyToken, allowRoles } = require("../middlewares/authMiddleware");

// Every dealer route requires a logged-in staff/admin user
router.use(verifyToken);

router.get("/", dealerController.getAllDealers);
router.get("/:id", dealerController.getDealerById);
router.post("/", allowRoles("admin", "super_admin", "staff"), validateDealer, dealerController.createDealer);
router.put("/:id", allowRoles("admin", "super_admin", "staff"), validateDealer, dealerController.updateDealer);

// Only admins can delete — staff can create/edit but not delete
router.delete("/:id", allowRoles("admin", "super_admin"), dealerController.deleteDealer);

module.exports = router;
