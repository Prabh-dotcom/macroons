// routes/notificationRoutes.js
//
// Dono admin aur dealer isi ek route se apni-apni notifications
// dekhte hain -- controller khud decide karta hai role dekh ke
// (req.user.role) ki kaunsi notifications dikhani hain.

const express = require("express");
const router = express.Router();

const notificationController = require("../controllers/notificationController");
const { verifyToken } = require("../middlewares/authMiddleware");

router.use(verifyToken);

router.get("/", notificationController.getMyNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.put("/:id/read", notificationController.markRead);
router.put("/mark-all-read", notificationController.markAllRead);

module.exports = router;
