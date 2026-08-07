// controllers/replacementController.js

const ReplacementModel = require("../models/replacementModel");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

exports.lookupOldSerial = asyncHandler(async (req, res) => {
    const { serial } = req.query;
    if (!serial) return apiResponse.error(res, 400, "Serial number is required.");

    const result = await ReplacementModel.lookupOldSerial(serial);
    if (!result) return apiResponse.error(res, 404, "Serial number not found in inventory.");
    if (!result.warranty_id) return apiResponse.error(res, 409, "This serial has no warranty record -- cannot process replacement.");

    return apiResponse.success(res, 200, "Serial found.", result);
});

exports.lookupNewSerial = asyncHandler(async (req, res) => {
    const { serial } = req.query;
    if (!serial) return apiResponse.error(res, 400, "Serial number is required.");

    const result = await ReplacementModel.lookupNewSerial(serial);
    if (!result) return apiResponse.error(res, 404, "Serial number not found in inventory.");
    if (result.status !== "in_stock") return apiResponse.error(res, 409, `This serial is "${result.status}", not available for replacement.`);

    return apiResponse.success(res, 200, "Serial found.", result);
});

exports.getStats = asyncHandler(async (req, res) => {
    const stats = await ReplacementModel.getStats();
    return apiResponse.success(res, 200, "Stats fetched successfully.", {
        total: stats.total || 0,
        approved: stats.approved || 0,
        pending: stats.pending || 0,
        rejected: stats.rejected || 0
    });
});

exports.getAllReplacements = asyncHandler(async (req, res) => {
    const { search, status, page, limit } = req.query;

    const result = await ReplacementModel.getAll({
        search,
        status,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 10
    });

    return apiResponse.success(res, 200, "Replacement records fetched successfully.", result);
});

exports.getReplacementById = asyncHandler(async (req, res) => {
    const item = await ReplacementModel.getById(req.params.id);
    if (!item) return apiResponse.error(res, 404, "Replacement record not found.");
    return apiResponse.success(res, 200, "Replacement record fetched successfully.", item);
});

exports.createReplacement = asyncHandler(async (req, res) => {
    const { old_inventory_id, dealer_id, customer_name, customer_phone } = req.body;

    if (!old_inventory_id || !dealer_id || !customer_name || !customer_phone) {
        return apiResponse.error(res, 400, "Old serial (resolved), customer name and mobile are required.");
    }

    const replacementId = await ReplacementModel.create(req.body);

    return apiResponse.success(res, 201, "Replacement request saved successfully.", { replacement_id: replacementId });
});

exports.updateReplacementStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!["pending", "approved", "completed", "rejected"].includes(status)) {
        return apiResponse.error(res, 400, "Invalid status value.");
    }

    const existing = await ReplacementModel.getById(req.params.id);
    if (!existing) return apiResponse.error(res, 404, "Replacement record not found.");

    await ReplacementModel.updateStatus(req.params.id, status);

    return apiResponse.success(res, 200, `Replacement ${status} successfully.`);
});

exports.deleteReplacement = asyncHandler(async (req, res) => {
    const existing = await ReplacementModel.getById(req.params.id);
    if (!existing) return apiResponse.error(res, 404, "Replacement record not found.");

    await ReplacementModel.remove(req.params.id);

    return apiResponse.success(res, 200, "Replacement record deleted successfully.");
});
