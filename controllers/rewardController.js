// controllers/rewardController.js
//
// dealerController.js jaisa hi pattern -- request/response yahan,
// actual SQL models/rewardModel.js me.

const RewardModel = require("../models/rewardModel.js");
const SettingsModel = require("../models/settingsModel");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

/* =========================================================
   ADMIN SIDE
========================================================= */

// GET /api/reward/stats
exports.getStats = asyncHandler(async (req, res) => {
    const stats = await RewardModel.getGlobalStats();
    return apiResponse.success(res, 200, "Reward stats fetched successfully.", stats);
});

// GET /api/reward/dealers?search=
exports.searchDealers = asyncHandler(async (req, res) => {
    const { search } = req.query;
    if (!search || search.trim().length === 0) {
        return apiResponse.success(res, 200, "No search term provided.", []);
    }
    const dealers = await RewardModel.searchDealers(search.trim());
    return apiResponse.success(res, 200, "Dealers fetched successfully.", dealers);
});

// GET /api/reward/wallet/:dealerId
exports.getDealerWallet = asyncHandler(async (req, res) => {
    const wallet = await RewardModel.getDealerWallet(req.params.dealerId);
    if (!wallet) {
        return apiResponse.error(res, 404, "Dealer not found.");
    }
    return apiResponse.success(res, 200, "Dealer wallet fetched successfully.", wallet);
});

// GET /api/reward/transactions?dealer_id=&search=&status=&dateFrom=&dateTo=&page=&limit=
exports.getTransactions = asyncHandler(async (req, res) => {
    const { dealer_id, search, status, dateFrom, dateTo, page, limit } = req.query;

    const result = await RewardModel.getTransactions({
        dealer_id: dealer_id ? Number(dealer_id) : undefined,
        search,
        status,
        dateFrom,
        dateTo,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 10
    });

    return apiResponse.success(res, 200, "Transactions fetched successfully.", result);
});

// GET /api/reward/transactions/:id
exports.getTransactionById = asyncHandler(async (req, res) => {
    const txn = await RewardModel.getTransactionById(req.params.id);
    if (!txn) {
        return apiResponse.error(res, 404, "Transaction not found.");
    }
    return apiResponse.success(res, 200, "Transaction fetched successfully.", txn);
});

// POST /api/reward/transactions
exports.createTransaction = asyncHandler(async (req, res) => {
    const { dealer_id, transaction_type, points } = req.body;

    const dealerExists = await RewardModel.dealerExists(dealer_id);
    if (!dealerExists) {
        return apiResponse.error(res, 404, "Dealer not found.");
    }

    const status = req.body.status || "approved";

    // Redemption (debit) ke liye Settings > Reward Settings ki Minimum
    // Redeem Points aur Maximum Redeem Per Month live enforce hoti hain.
    if (transaction_type === "debit") {
        const [minRedeem, maxRedeemPerMonth] = await Promise.all([
            SettingsModel.getByKey("min_redeem_points", "500"),
            SettingsModel.getByKey("max_redeem_per_month", "5000")
        ]);

        if (Number(points) < Number(minRedeem)) {
            return apiResponse.error(res, 400, `Minimum ${minRedeem} points required to redeem.`);
        }

        const redeemedThisMonth = await RewardModel.getDebitPointsThisMonth(dealer_id);
        if (redeemedThisMonth + Number(points) > Number(maxRedeemPerMonth)) {
            return apiResponse.error(
                res, 400,
                `Maximum ${maxRedeemPerMonth} points allowed per month. Dealer has already redeemed ${redeemedThisMonth} points this month.`
            );
        }
    }

    // Debit that would push an approved balance negative is blocked --
    // pending debits (e.g. a redemption request awaiting approval) are
    // fine since they don't affect the balance until approved.
    if (transaction_type === "debit" && status === "approved") {
        const currentBalance = await RewardModel.getCurrentBalance(dealer_id);
        if (currentBalance < Number(points)) {
            return apiResponse.error(res, 400, `Insufficient balance. Dealer only has ${currentBalance} points available.`);
        }
    }

    const transactionId = await RewardModel.createTransaction({
        ...req.body,
        status,
        created_by: req.user?.user_id || null
    });

    return apiResponse.success(res, 201, "Reward transaction saved successfully.", { transaction_id: transactionId });
});

// PUT /api/reward/transactions/:id
exports.updateTransaction = asyncHandler(async (req, res) => {
    const existing = await RewardModel.getTransactionById(req.params.id);
    if (!existing) {
        return apiResponse.error(res, 404, "Transaction not found.");
    }

    if (req.body.transaction_type === "debit" && req.body.status === "approved") {
        // exclude this transaction's own current effect before checking
        const currentBalance = await RewardModel.getCurrentBalance(existing.dealer_id);
        const ownEffect = existing.status === "approved"
            ? (existing.transaction_type === "credit" ? existing.points : -existing.points)
            : 0;
        const balanceWithoutThis = currentBalance - ownEffect;
        if (balanceWithoutThis < Number(req.body.points)) {
            return apiResponse.error(res, 400, `Insufficient balance. Dealer only has ${balanceWithoutThis} points available.`);
        }
    }

    await RewardModel.updateTransaction(req.params.id, req.body);
    return apiResponse.success(res, 200, "Transaction updated successfully.");
});

// PUT /api/reward/transactions/:id/approve
exports.approveTransaction = asyncHandler(async (req, res) => {
    const existing = await RewardModel.getTransactionById(req.params.id);
    if (!existing) {
        return apiResponse.error(res, 404, "Transaction not found.");
    }

    if (existing.transaction_type === "debit") {
        const currentBalance = await RewardModel.getCurrentBalance(existing.dealer_id);
        if (currentBalance < existing.points) {
            return apiResponse.error(res, 400, `Cannot approve -- insufficient balance. Dealer only has ${currentBalance} points available.`);
        }
    }

    await RewardModel.setStatus(req.params.id, "approved");
    return apiResponse.success(res, 200, "Transaction approved successfully.");
});

// PUT /api/reward/transactions/:id/reject
exports.rejectTransaction = asyncHandler(async (req, res) => {
    const existing = await RewardModel.getTransactionById(req.params.id);
    if (!existing) {
        return apiResponse.error(res, 404, "Transaction not found.");
    }

    await RewardModel.setStatus(req.params.id, "rejected");
    return apiResponse.success(res, 200, "Transaction rejected.");
});

/* =========================================================
   DEALER SELF-SERVICE SIDE (dealer portal)
========================================================= */

// GET /api/reward/my-wallet
exports.getMyWallet = asyncHandler(async (req, res) => {
    if (req.user.type !== "dealer") {
        return apiResponse.error(res, 403, "This endpoint is only for dealer accounts.");
    }

    const wallet = await RewardModel.getDealerWallet(req.user.dealer_id);
    const monthly = await RewardModel.getMyMonthlyStats(req.user.dealer_id);

    return apiResponse.success(res, 200, "Wallet fetched successfully.", { ...wallet, ...monthly });
});

// GET /api/reward/my-transactions?search=&dateFrom=&dateTo=&page=&limit=
exports.getMyTransactions = asyncHandler(async (req, res) => {
    if (req.user.type !== "dealer") {
        return apiResponse.error(res, 403, "This endpoint is only for dealer accounts.");
    }

    const { search, dateFrom, dateTo, reference_type, page, limit } = req.query;

    const result = await RewardModel.getTransactions({
        dealer_id: req.user.dealer_id,
        search,
        dateFrom,
        dateTo,
        reference_type,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 10
    });

    return apiResponse.success(res, 200, "Transactions fetched successfully.", result);
});