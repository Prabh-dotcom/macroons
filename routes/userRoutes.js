// routes/userRoutes.js

const express = require("express");
const router = express.Router();

const userController = require("../controllers/userController");
const { verifyToken, allowRoles } = require("../middlewares/authMiddleware");

router.use(verifyToken);
router.use(allowRoles("admin", "super_admin")); // sirf admin hi staff users manage kar sakta hai

router.get("/", userController.getAllUsers);
router.get("/:id", userController.getUserById);
router.post("/", userController.createUser);
router.put("/:id", userController.updateUser);
router.delete("/:id", userController.deleteUser);

module.exports = router;
