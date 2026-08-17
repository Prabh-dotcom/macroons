// controllers/userController.js
// Admin panel "Settings > Users" -- staff/admin account CRUD.

const bcrypt = require("bcrypt");
const UserModel = require("../models/userModel");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

exports.getAllUsers = asyncHandler(async (req, res) => {
    const { search, role, status, page, limit } = req.query;

    const result = await UserModel.getAll({
        search, role, status,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 10
    });

    return apiResponse.success(res, 200, "Users fetched successfully.", result);
});

exports.getUserById = asyncHandler(async (req, res) => {
    const user = await UserModel.getById(req.params.id);
    if (!user) return apiResponse.error(res, 404, "User not found.");
    return apiResponse.success(res, 200, "User fetched successfully.", user);
});

exports.createUser = asyncHandler(async (req, res) => {
    const { full_name, email, mobile, role, password } = req.body;

    if (!full_name || !email || !password) {
        return apiResponse.error(res, 400, "Full name, email and password are required.");
    }
    if (password.length < 6) {
        return apiResponse.error(res, 400, "Password must be at least 6 characters.");
    }

    const exists = await UserModel.emailExists(email);
    if (exists) {
        return apiResponse.error(res, 409, "A user with this email already exists.");
    }

    const password_hash = await bcrypt.hash(password, 10);

    const userId = await UserModel.create({
        full_name, email, mobile: mobile || "0000000000",
        password_hash, role: role || "staff", status: req.body.status || "active"
    });

    return apiResponse.success(res, 201, "User created successfully.", { user_id: userId });
});

exports.updateUser = asyncHandler(async (req, res) => {
    const existing = await UserModel.getById(req.params.id);
    if (!existing) return apiResponse.error(res, 404, "User not found.");

    const { full_name, mobile, role, status } = req.body;
    if (!full_name || !role || !status) {
        return apiResponse.error(res, 400, "Full name, role and status are required.");
    }

    await UserModel.update(req.params.id, { full_name, mobile, role, status });

    // Password sirf tab update hoga jab naya password diya gaya ho
    if (req.body.password) {
        if (req.body.password.length < 6) {
            return apiResponse.error(res, 400, "Password must be at least 6 characters.");
        }
        const password_hash = await bcrypt.hash(req.body.password, 10);
        await UserModel.updatePassword(req.params.id, password_hash);
    }

    return apiResponse.success(res, 200, "User updated successfully.");
});

exports.deleteUser = asyncHandler(async (req, res) => {
    const existing = await UserModel.getById(req.params.id);
    if (!existing) return apiResponse.error(res, 404, "User not found.");

    // Apna khud ka account delete karne se rok do -- warna khud hi lockout ho jaoge
    if (Number(req.params.id) === req.user.user_id) {
        return apiResponse.error(res, 400, "You cannot delete your own account while logged in.");
    }

    await UserModel.remove(req.params.id);

    return apiResponse.success(res, 200, "User deleted successfully.");
});


// PUT /api/users/change-password  -- logged-in user apna khud ka password badalta hai
exports.changeOwnPassword = asyncHandler(async (req, res) => {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
        return apiResponse.error(res, 400, "Current password and new password are required.");
    }
    if (new_password.length < 6) {
        return apiResponse.error(res, 400, "New password must be at least 6 characters.");
    }

    const user = await UserModel.getByIdWithPassword(req.user.user_id);
    if (!user) {
        return apiResponse.error(res, 404, "User not found.");
    }

    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) {
        return apiResponse.error(res, 401, "Current password is incorrect.");
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await UserModel.updatePassword(req.user.user_id, newHash);

    return apiResponse.success(res, 200, "Password changed successfully.");
});