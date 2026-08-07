// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

router.post("/login", authController.staffLogin);
router.post("/dealer-login", authController.dealerLogin);

module.exports = router;
