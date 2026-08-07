// controllers/dashboardController.js

const DashboardModel = require("../models/dashboardModel");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

exports.getKPIs = asyncHandler(async (req, res) => {
    const data = await DashboardModel.getKPIs();
    return apiResponse.success(res, 200, "KPIs fetched successfully.", data);
});

exports.getAlerts = asyncHandler(async (req, res) => {
    const data = await DashboardModel.getAlerts();
    return apiResponse.success(res, 200, "Alerts fetched successfully.", data);
});

exports.getRecentDispatch = asyncHandler(async (req, res) => {
    const data = await DashboardModel.getRecentDispatch();
    return apiResponse.success(res, 200, "Recent dispatch fetched successfully.", data);
});

exports.getRecentWarranty = asyncHandler(async (req, res) => {
    const data = await DashboardModel.getRecentWarranty();
    return apiResponse.success(res, 200, "Recent warranty fetched successfully.", data);
});

exports.getTopDealers = asyncHandler(async (req, res) => {
    const data = await DashboardModel.getTopDealers();
    return apiResponse.success(res, 200, "Top dealers fetched successfully.", data);
});

exports.getRewardSummary = asyncHandler(async (req, res) => {
    const data = await DashboardModel.getRewardSummary();
    return apiResponse.success(res, 200, "Reward summary fetched successfully.", data);
});

exports.getRecentActivity = asyncHandler(async (req, res) => {
    const data = await DashboardModel.getRecentActivity();
    return apiResponse.success(res, 200, "Recent activity fetched successfully.", data);
});

exports.quickSearch = asyncHandler(async (req, res) => {
    const { term } = req.query;
    if (!term || term.trim().length < 2) {
        return apiResponse.success(res, 200, "Search results.", []);
    }
    const data = await DashboardModel.quickSearch(term.trim());
    return apiResponse.success(res, 200, "Search results.", data);
});
