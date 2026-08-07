// controllers/inventoryController.js

const InventoryModel = require("../models/inventoryModel");
const ProductModel = require("../models/productModel");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");
const XLSX = require("xlsx"); // npm install xlsx -- not yet in package.json, add it

// GET /api/inventory?search=&status=&categoryId=&page=&limit=
exports.getAllInventory = asyncHandler(async (req, res) => {
    const { search, status, categoryId, page, limit } = req.query;

    const result = await InventoryModel.getAll({
        search,
        status,
        categoryId,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 10
    });

    return apiResponse.success(res, 200, "Inventory fetched successfully.", result);
});

// GET /api/inventory/:id
exports.getInventoryById = asyncHandler(async (req, res) => {
    const item = await InventoryModel.getById(req.params.id);

    if (!item) {
        return apiResponse.error(res, 404, "Inventory item not found.");
    }

    return apiResponse.success(res, 200, "Inventory item fetched successfully.", item);
});

// POST /api/inventory
// Body: { category_name, product_name, model_name, warranty_months,
//         serial_number, batch_number, mfg_date, status }
exports.createInventory = asyncHandler(async (req, res) => {
    const {
        category_name, product_name, model_name, warranty_months,
        serial_number, batch_number, mfg_date, status
    } = req.body;

    if (!category_name || !product_name || !model_name || !serial_number || !mfg_date) {
        return apiResponse.error(res, 400, "Category, product name, model, serial number and MFG date are required.");
    }

    const exists = await InventoryModel.serialExists(serial_number);
    if (exists) {
        return apiResponse.error(res, 409, `Serial number "${serial_number}" already exists in inventory.`);
    }

    // Find-or-create category and product -- ismein duplicate categories/products nahi banenge
    const category_id = await ProductModel.findOrCreateCategory(category_name);
    const product_id = await ProductModel.findOrCreateProduct({
        category_id, product_name, model_name, warranty_months
    });

    const inventoryId = await InventoryModel.create({
        product_id, serial_number, batch_number, mfg_date, status
    });

    return apiResponse.success(res, 201, "Inventory item added successfully.", { inventory_id: inventoryId });
});

// PUT /api/inventory/:id
exports.updateInventory = asyncHandler(async (req, res) => {
    const existing = await InventoryModel.getById(req.params.id);
    if (!existing) {
        return apiResponse.error(res, 404, "Inventory item not found.");
    }

    const { serial_number, batch_number, mfg_date, status } = req.body;

    if (!serial_number || !mfg_date) {
        return apiResponse.error(res, 400, "Serial number and MFG date are required.");
    }

    const duplicateSerial = await InventoryModel.serialExists(serial_number, req.params.id);
    if (duplicateSerial) {
        return apiResponse.error(res, 409, `Serial number "${serial_number}" already used by another item.`);
    }

    await InventoryModel.update(req.params.id, { serial_number, batch_number, mfg_date, status });

    return apiResponse.success(res, 200, "Inventory item updated successfully.");
});

// DELETE /api/inventory/:id
exports.deleteInventory = asyncHandler(async (req, res) => {
    const existing = await InventoryModel.getById(req.params.id);
    if (!existing) {
        return apiResponse.error(res, 404, "Inventory item not found.");
    }

    // NOTE: agar yeh serial kisi dispatch/warranty/replacement me use ho
    // chuka hai, foreign key ON DELETE RESTRICT isse block karega
    // (errorHandler.js isko clean message me convert karta hai).
    await InventoryModel.remove(req.params.id);

    return apiResponse.success(res, 200, "Inventory item deleted successfully.");
});

// GET /api/inventory/meta/categories -- form ke dropdown ke liye
exports.getCategories = asyncHandler(async (req, res) => {
    const categories = await ProductModel.getAllCategories();
    return apiResponse.success(res, 200, "Categories fetched successfully.", categories);
});

// GET /api/inventory/stats/summary -- 4 dashboard cards
exports.getStats = asyncHandler(async (req, res) => {
    const stats = await InventoryModel.getStats();
    return apiResponse.success(res, 200, "Inventory stats fetched successfully.", stats);
});

// GET /api/inventory/export/excel?search=&status=&categoryId=
// Exports whatever filters are currently applied on the table -- not just the current page.
exports.exportExcel = asyncHandler(async (req, res) => {
    const { search, status, categoryId } = req.query;
    const rows = await InventoryModel.getAllForExport({ search, status, categoryId });

    const excelRows = rows.map((r, i) => ({
        "#": i + 1,
        "Category": r.category_name,
        "Product": r.product_name,
        "Model": r.model_name,
        "Serial Number": r.serial_number,
        "Batch Number": r.batch_number || "-",
        "MFG Date": r.mfg_date ? new Date(r.mfg_date).toISOString().split("T")[0] : "-",
        "Warranty (Months)": r.warranty_months,
        "Status": r.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
        "Content-Disposition",
        `attachment; filename="inventory-export-${Date.now()}.xlsx"`
    );
    res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
});
