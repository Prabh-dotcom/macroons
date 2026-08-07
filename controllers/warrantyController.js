// controllers/warrantyController.js

const WarrantyModel = require("../models/warrantyModel");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

// GET /api/warranty/lookup-serial?serial=XXX
exports.lookupSerial = asyncHandler(async (req, res) => {
    const { serial } = req.query;
    if (!serial) {
        return apiResponse.error(res, 400, "Serial number is required.");
    }

    const result = await WarrantyModel.lookupSerialForWarranty(serial);

    if (!result) {
        return apiResponse.error(res, 404, "Serial number not found in inventory.");
    }
    if (!result.dealer_id) {
        return apiResponse.error(res, 409, "This serial hasn't been dispatched to any dealer yet.");
    }

    return apiResponse.success(res, 200, "Serial found.", result);
});

exports.getAllWarranty = asyncHandler(async (req, res) => {
    const { search, status, page, limit } = req.query;

    const result = await WarrantyModel.getAll({
        search,
        status,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 10
    });

    return apiResponse.success(res, 200, "Warranty records fetched successfully.", result);
});

exports.getWarrantyById = asyncHandler(async (req, res) => {
    const item = await WarrantyModel.getById(req.params.id);
    if (!item) {
        return apiResponse.error(res, 404, "Warranty record not found.");
    }
    return apiResponse.success(res, 200, "Warranty record fetched successfully.", item);
});

// POST /api/warranty
exports.createWarranty = asyncHandler(async (req, res) => {
    const {
        inventory_id, dealer_id, customer_name, customer_phone,
        activation_date, warranty_months
    } = req.body;

    if (!inventory_id || !dealer_id || !customer_name || !customer_phone || !activation_date || !warranty_months) {
        return apiResponse.error(res, 400, "Serial (with dealer resolved), customer name, mobile, activation date and warranty period are required.");
    }

    const alreadyExists = await WarrantyModel.serialAlreadyUnderWarranty(inventory_id);
    if (alreadyExists) {
        return apiResponse.error(res, 409, "This serial number already has a warranty record.");
    }

    // Expiry date = activation date + warranty period (months)
    const expiry = new Date(activation_date);
    expiry.setMonth(expiry.getMonth() + Number(warranty_months));
    const expiry_date = expiry.toISOString().split("T")[0];

    const warrantyId = await WarrantyModel.create({
        ...req.body,
        expiry_date,
        activated_by: req.user.user_id || null
    });

    return apiResponse.success(res, 201, "Warranty activated successfully.", { warranty_id: warrantyId, expiry_date });
});

exports.deleteWarranty = asyncHandler(async (req, res) => {
    const existing = await WarrantyModel.getById(req.params.id);
    if (!existing) {
        return apiResponse.error(res, 404, "Warranty record not found.");
    }

    await WarrantyModel.remove(req.params.id);

    return apiResponse.success(res, 200, "Warranty record deleted successfully.");
});
