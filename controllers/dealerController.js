// controllers/dealerController.js
//
// Har function ek route se juda hai (routes/dealerRoutes.js dekho).
// Yeh layer request/response handle karta hai, actual SQL model
// (dealerModel.js) me hai.

const bcrypt = require("bcrypt");
const DealerModel = require("../models/dealerModel.js");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

// Auto-generates a unique dealer code like "DLR1000", "DLR1001"...
// Retries a few times in the rare case of a collision.
const generateUniqueDealerCode = async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
        const random = Math.floor(Math.random() * 9000) + 1000;
        const code = `DLR${random}`;
        const exists = await DealerModel.codeExists(code);
        if (!exists) return code;
    }
    throw new Error("Could not generate a unique dealer code, please retry.");
};

// GET /api/dealers?search=&status=&page=&limit=&sortBy=&sortOrder=
exports.getAllDealers = asyncHandler(async (req, res) => {
    const { search, status, page, limit, sortBy, sortOrder } = req.query;

    const result = await DealerModel.getAll({
        search,
        status,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 10,
        sortBy,
        sortOrder
    });

    return apiResponse.success(res, 200, "Dealers fetched successfully.", result);
});

// GET /api/dealers/:id
exports.getDealerById = asyncHandler(async (req, res) => {
    const dealer = await DealerModel.getById(req.params.id);

    if (!dealer) {
        return apiResponse.error(res, 404, "Dealer not found.");
    }

    return apiResponse.success(res, 200, "Dealer fetched successfully.", dealer);
});

// POST /api/dealers
exports.createDealer = asyncHandler(async (req, res) => {
    const dealer_code = await generateUniqueDealerCode();
    const password_hash = await bcrypt.hash(req.body.password, 10);

    const dealerId = await DealerModel.create({
        ...req.body,
        dealer_code,
        password_hash
    });

    return apiResponse.success(res, 201, "Dealer created successfully.", {
        dealer_id: dealerId,
        dealer_code
    });
});

// PUT /api/dealers/:id
exports.updateDealer = asyncHandler(async (req, res) => {
    const existing = await DealerModel.getById(req.params.id);
    if (!existing) {
        return apiResponse.error(res, 404, "Dealer not found.");
    }

    await DealerModel.update(req.params.id, req.body);

    return apiResponse.success(res, 200, "Dealer updated successfully.");
});

// DELETE /api/dealers/:id
exports.deleteDealer = asyncHandler(async (req, res) => {
    const existing = await DealerModel.getById(req.params.id);
    if (!existing) {
        return apiResponse.error(res, 404, "Dealer not found.");
    }

    // NOTE: agar dealer ka dispatch/warranty/reward history hai to
    // foreign key ON DELETE RESTRICT isse block kar dega, aur woh
    // error middlewares/errorHandler.js me handle hota hai
    // (ER_ROW_IS_REFERENCED_2). Yeh jaan-boojh kar kiya hai — history
    // wale dealer ko delete nahi hone dena chahiye, use "inactive"
    // status me daalna chahiye instead.
    await DealerModel.remove(req.params.id);

    return apiResponse.success(res, 200, "Dealer deleted successfully.");
});
