// routes/dispatchRoutes.js

const express = require("express");
const router = express.Router();

const dispatchController = require("../controllers/dispatchController");
const { verifyToken, allowRoles } = require("../middlewares/authMiddleware");

router.use(verifyToken);

router.get("/stats", dispatchController.getStats);
router.get("/", dispatchController.getAllDispatch);
router.get("/:id", dispatchController.getDispatchById);
router.post("/", allowRoles("admin", "super_admin", "staff"), dispatchController.createDispatch);
router.delete("/:id", allowRoles("admin", "super_admin"), dispatchController.deleteDispatch);

module.exports = router;
