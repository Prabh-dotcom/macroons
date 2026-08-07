// validators/rewardValidator.js
//
// dealerValidator.js jaisa hi hand-written pattern -- koi extra
// package nahi, seedha field-by-field check.

const REFERENCE_TYPES = ["warranty", "dispatch", "sales", "manual", "redemption"];
const STATUS_VALUES = ["pending", "approved", "rejected"];

const validateTransaction = (req, res, next) => {
    const { dealer_id, transaction_type, points, transaction_date, status, reference_type } = req.body;
    const errors = [];

    if (!dealer_id || isNaN(Number(dealer_id))) {
        errors.push("A valid dealer is required.");
    }

    if (!transaction_type || !["credit", "debit"].includes(transaction_type)) {
        errors.push("Transaction type must be either 'credit' or 'debit'.");
    }

    if (points === undefined || points === null || points === "" || isNaN(Number(points)) || Number(points) <= 0) {
        errors.push("Points must be a positive number.");
    }

    if (!transaction_date || isNaN(Date.parse(transaction_date))) {
        errors.push("A valid transaction date is required.");
    }

    if (status && !STATUS_VALUES.includes(status)) {
        errors.push("Status must be one of: pending, approved, rejected.");
    }

    if (reference_type && !REFERENCE_TYPES.includes(reference_type)) {
        errors.push("Invalid reference type.");
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: "Validation failed.",
            errors
        });
    }

    next();
};

module.exports = { validateTransaction };
