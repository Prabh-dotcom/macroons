// routes/dealerPortalRoutes.js
//
// Yeh sab routes /dealer/*.html pages ke liye hain. Sirf "dealer" role
// wale token hi in routes ko access kar sakte hain -- admin token
// dealer portal ka data nahi dekh sakta, aur ek dealer doosre dealer
// ka data nahi dekh sakta (dealer_id JWT token se aata hai).

const express = require("express");
const router = express.Router();

const dealerPortalController = require("../controllers/dealerPortalController");
const uploadDealerPhoto = require("../middlewares/uploadDealerPhoto");
const uploadReplacementFiles = require("../middlewares/uploadReplacementFiles");
const { verifyToken, allowRoles } = require("../middlewares/authMiddleware");

router.use(verifyToken);
router.use(allowRoles("dealer"));

router.get("/dashboard", dealerPortalController.getDashboard);
router.get("/search", dealerPortalController.quickSearch);
router.get("/activity", dealerPortalController.getRecentActivity);
router.post("/replacements", uploadReplacementFiles, dealerPortalController.createReplacement);
router.get("/warranty", dealerPortalController.getWarrantyList);
router.get("/warranty/stats", dealerPortalController.getWarrantyStats);
router.get("/reports/summary", dealerPortalController.getReportSummary);
router.get("/reports/sales", dealerPortalController.getSalesReport);
router.get("/reports/warranty", dealerPortalController.getWarrantyReport);
router.get("/reports/replacement", dealerPortalController.getReplacementReport);
router.get("/reports/reward", dealerPortalController.getRewardReport);

router.get("/profile", dealerPortalController.getProfile);
router.put("/profile", dealerPortalController.updateProfile);
router.put("/profile/password", dealerPortalController.changePassword);
router.post("/profile/photo", uploadDealerPhoto, dealerPortalController.uploadPhoto);

module.exports = router;