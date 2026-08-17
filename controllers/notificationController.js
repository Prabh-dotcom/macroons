// controllers/notificationController.js

const NotificationModel = require("../models/notificationModel");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

exports.getMyNotifications = asyncHandler(async (req, res) => {
    const { role, dealer_id } = req.user;
    const { unreadOnly } = req.query;

    const notifications = await NotificationModel.getForUser({
        role,
        dealerId: dealer_id,
        unreadOnly: unreadOnly === "true"
    });

    return apiResponse.success(res, 200, "Notifications fetched successfully.", notifications);
});

exports.getUnreadCount = asyncHandler(async (req, res) => {
    const { role, dealer_id } = req.user;
    const count = await NotificationModel.getUnreadCount({ role, dealerId: dealer_id });
    return apiResponse.success(res, 200, "Unread count fetched successfully.", { count });
});

exports.markRead = asyncHandler(async (req, res) => {
    await NotificationModel.markRead(req.params.id);
    return apiResponse.success(res, 200, "Notification marked as read.");
});

exports.markAllRead = asyncHandler(async (req, res) => {
    const { role, dealer_id } = req.user;
    await NotificationModel.markAllRead({ role, dealerId: dealer_id });
    return apiResponse.success(res, 200, "All notifications marked as read.");
});