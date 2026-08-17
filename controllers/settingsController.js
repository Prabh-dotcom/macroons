// controllers/settingsController.js

const SettingsModel = require("../models/settingsModel");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

// Default values -- agar table khaali hai (fresh DB, migration abhi run
// nahi hui) to bhi form khaali "-" ki jagah yeh sensible defaults dikhayega.
const DEFAULTS = {
    warranty_default_months: "24",
    warranty_start_from: "dispatch_date",
    grace_period_days: "90",
    replacement_allowed: "yes",
    warranty_expiry_alert: "enabled",
    reminder_before_expiry_days: "30",

    warranty_reward_points: "50",
    dispatch_reward_points: "10",
    replacement_reward_points: "0",
    min_redeem_points: "500",
    max_redeem_per_month: "5000",

    session_timeout_minutes: "30",
    two_factor_enabled: "no"
};

exports.getSettings = asyncHandler(async (req, res) => {
    const stored = await SettingsModel.getAll();
    const settings = { ...DEFAULTS, ...stored };
    return apiResponse.success(res, 200, "Settings fetched successfully.", settings);
});

exports.updateWarrantySettings = asyncHandler(async (req, res) => {
    const {
        warranty_default_months, warranty_start_from, grace_period_days,
        replacement_allowed, warranty_expiry_alert, reminder_before_expiry_days
    } = req.body;

    const errors = [];
    if (!warranty_default_months || isNaN(warranty_default_months) || Number(warranty_default_months) <= 0) {
        errors.push("Default Warranty (Months) must be a valid positive number.");
    }
    if (!["dispatch_date", "invoice_date", "activation_date"].includes(warranty_start_from)) {
        errors.push("Warranty Start From must be a valid option.");
    }
    if (grace_period_days === undefined || isNaN(grace_period_days) || Number(grace_period_days) < 0) {
        errors.push("Grace Period (Days) must be a valid number.");
    }
    if (!["yes", "no"].includes(replacement_allowed)) {
        errors.push("Replacement Allowed must be Yes or No.");
    }
    if (!["enabled", "disabled"].includes(warranty_expiry_alert)) {
        errors.push("Auto Warranty Expiry Alert must be Enabled or Disabled.");
    }
    if (reminder_before_expiry_days === undefined || isNaN(reminder_before_expiry_days) || Number(reminder_before_expiry_days) < 0) {
        errors.push("Reminder Before Expiry (Days) must be a valid number.");
    }

    if (errors.length) return apiResponse.error(res, 400, "Please fix the following and try again.", errors);

    await SettingsModel.updateMany({
        warranty_default_months, warranty_start_from, grace_period_days,
        replacement_allowed, warranty_expiry_alert, reminder_before_expiry_days
    });

    return apiResponse.success(res, 200, "Warranty settings updated successfully.");
});

exports.updateRewardSettings = asyncHandler(async (req, res) => {
    const {
        warranty_reward_points, dispatch_reward_points, replacement_reward_points,
        min_redeem_points, max_redeem_per_month
    } = req.body;

    const errors = [];
    const numericFields = {
        "Warranty Reward Points": warranty_reward_points,
        "Dispatch Reward Points": dispatch_reward_points,
        "Replacement Reward Points": replacement_reward_points,
        "Minimum Redeem Points": min_redeem_points,
        "Maximum Redeem Per Month": max_redeem_per_month
    };
    for (const [label, value] of Object.entries(numericFields)) {
        if (value === undefined || value === "" || isNaN(value) || Number(value) < 0) {
            errors.push(`${label} must be a valid non-negative number.`);
        }
    }
    if (!errors.length && Number(min_redeem_points) > Number(max_redeem_per_month)) {
        errors.push("Minimum Redeem Points cannot be greater than Maximum Redeem Per Month.");
    }

    if (errors.length) return apiResponse.error(res, 400, "Please fix the following and try again.", errors);

    await SettingsModel.updateMany({
        warranty_reward_points, dispatch_reward_points, replacement_reward_points,
        min_redeem_points, max_redeem_per_month
    });

    return apiResponse.success(res, 200, "Reward settings updated successfully.");
});

exports.updateSecuritySettings = asyncHandler(async (req, res) => {
    const { session_timeout_minutes, two_factor_enabled } = req.body;

    const errors = [];
    if (session_timeout_minutes === undefined || isNaN(session_timeout_minutes) || Number(session_timeout_minutes) < 5) {
        errors.push("Session Timeout must be at least 5 minutes.");
    }
    if (!["yes", "no"].includes(two_factor_enabled)) {
        errors.push("Two-Factor Authentication value is invalid.");
    }

    if (errors.length) return apiResponse.error(res, 400, "Please fix the following and try again.", errors);

    await SettingsModel.updateMany({ session_timeout_minutes, two_factor_enabled });

    return apiResponse.success(res, 200, "Security settings updated successfully.");
});