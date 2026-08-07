// routes/rewardRoutes.js
//
// Reward Wallet module -- same pattern as dealerRoutes.js. Controller
// (controllers/rewardController.js) already had all the logic and
// models/rewardModel.js already had all the SQL -- this file was still
// the old 501 placeholder, so none of it was reachable. Wiring it up.

const express = require("express");
const router = express.Router();

const rewardController = require("../controllers/rewardController");
const { validateTransaction } = require("../validators/rewardValidator");
const { verifyToken, allowRoles } = require("../middlewares/authMiddleware");

// Every reward route requires a logged-in user (staff/admin OR dealer --
// the dealer-only endpoints below re-check req.user.type themselves).
router.use(verifyToken);

/* =========================================================
   DEALER SELF-SERVICE (dealer portal) -- must come before the
   admin ":dealerId" style routes so "/my-wallet" etc. aren't
   swallowed by a param route.
========================================================= */
router.get("/my-wallet", rewardController.getMyWallet);
router.get("/my-transactions", rewardController.getMyTransactions);

/* =========================================================
   ADMIN SIDE
========================================================= */
router.get("/stats", rewardController.getStats);
router.get("/dealers", rewardController.searchDealers);
router.get("/wallet/:dealerId", rewardController.getDealerWallet);

router.get("/transactions", rewardController.getTransactions);
router.get("/transactions/:id", rewardController.getTransactionById);

router.post(
    "/transactions",
    allowRoles("admin", "super_admin", "staff"),
    validateTransaction,
    rewardController.createTransaction
);

router.put(
    "/transactions/:id",
    allowRoles("admin", "super_admin", "staff"),
    validateTransaction,
    rewardController.updateTransaction
);

router.put(
    "/transactions/:id/approve",
    allowRoles("admin", "super_admin", "staff"),
    rewardController.approveTransaction
);

router.put(
    "/transactions/:id/reject",
    allowRoles("admin", "super_admin", "staff"),
    rewardController.rejectTransaction
);

module.exports = router;
