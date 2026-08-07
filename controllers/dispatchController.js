// controllers/dispatchController.js

const DispatchModel = require("../models/dispatchModel");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

exports.getAllDispatch = asyncHandler(async (req, res) => {
    const { search, status, page, limit } = req.query;

    const result = await DispatchModel.getAll({
        search,
        status,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 10
    });

    return apiResponse.success(res, 200, "Dispatch records fetched successfully.", result);
});

exports.getDispatchById = asyncHandler(async (req, res) => {
    const item = await DispatchModel.getById(req.params.id);

    if (!item) {
        return apiResponse.error(res, 404, "Dispatch record not found.");
    }

    return apiResponse.success(res, 200, "Dispatch record fetched successfully.", item);
});

// POST /api/dispatch
// Body: { invoice_number, company_name, dealer_id, dispatch_date,
//         transport_name, lr_number, remarks, inventory_id }
exports.createDispatch = asyncHandler(async (req, res) => {
    const { invoice_number, dealer_id, dispatch_date, inventory_id } = req.body;

    if (!invoice_number || !dealer_id || !dispatch_date || !inventory_id) {
        return apiResponse.error(res, 400, "Invoice number, dealer, dispatch date and serial number are required.");
    }

    const exists = await DispatchModel.invoiceExists(invoice_number);
    if (exists) {
        return apiResponse.error(res, 409, `Invoice number "${invoice_number}" already exists.`);
    }

    const dispatchId = await DispatchModel.create(req.body);

    return apiResponse.success(res, 201, "Battery dispatched successfully.", { dispatch_id: dispatchId });
});

exports.deleteDispatch = asyncHandler(async (req, res) => {
    const existing = await DispatchModel.getById(req.params.id);
    if (!existing) {
        return apiResponse.error(res, 404, "Dispatch record not found.");
    }

    await DispatchModel.remove(req.params.id);

    return apiResponse.success(res, 200, "Dispatch record deleted and serial returned to stock.");
});
