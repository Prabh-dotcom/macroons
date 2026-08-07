// routes/inventoryRoutes.js

const express = require("express");
const router = express.Router();

const inventoryController = require("../controllers/inventoryController");
const { verifyToken, allowRoles } = require("../middlewares/authMiddleware");

router.use(verifyToken);

// Specific routes BEFORE "/:id" so they don't get swallowed by the param route
router.get("/", inventoryController.getAllInventory);
router.get("/stats/summary", inventoryController.getStats);
router.get("/export/excel", inventoryController.exportExcel);
router.get("/meta/categories", inventoryController.getCategories);
router.get("/:id", inventoryController.getInventoryById);
router.post("/", allowRoles("admin", "super_admin", "staff"), inventoryController.createInventory);
router.put("/:id", allowRoles("admin", "super_admin", "staff"), inventoryController.updateInventory);
router.delete("/:id", allowRoles("admin", "super_admin"), inventoryController.deleteInventory);

module.exports = router;
