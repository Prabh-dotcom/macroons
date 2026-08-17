// routes/userRoutes.js

const express = require("express");
const router = express.Router();

const userController = require("../controllers/userController");
const { verifyToken, allowRoles } = require("../middlewares/authMiddleware");

router.use(verifyToken);

// Change password apna khud ka -- koi bhi logged-in user (staff/admin/super_admin)
// kar sakta hai, isliye yeh role-restriction se pehle aur ":id" route se pehle hai
// (warna Express "change-password" ko ":id" ke roop me match kar leta).
router.put("/change-password", userController.changeOwnPassword);

router.use(allowRoles("admin", "super_admin")); // aage sab sirf admin ke liye

router.get("/", userController.getAllUsers);
router.get("/:id", userController.getUserById);
router.post("/", userController.createUser);
router.put("/:id", userController.updateUser);
router.delete("/:id", userController.deleteUser);

module.exports = router;