// controllers/reportController.js

const ReportModel = require("../models/reportModel");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

exports.getDashboardStats = asyncHandler(async (req, res) => {
    const stats = await ReportModel.getDashboardStats();
    return apiResponse.success(res, 200, "Stats fetched successfully.", stats);
});

exports.getSummary = asyncHandler(async (req, res) => {
    const summary = await ReportModel.getSummary();
    return apiResponse.success(res, 200, "Summary fetched successfully.", summary);
});

exports.getReports = asyncHandler(async (req, res) => {
    const {
        search, fromDate, toDate, reportType, status,
        dealer, category, productName, modelNumber, state,
        page, limit
    } = req.query;

    const result = await ReportModel.getReports({
        search, fromDate, toDate, reportType, status,
        dealer, category, productName, modelNumber, state,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 15
    });

    return apiResponse.success(res, 200, "Reports fetched successfully.", result);
});
