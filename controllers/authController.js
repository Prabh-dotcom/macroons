// controllers/authController.js
//
// Do alag login endpoints hain kyunki staff (users table) aur dealers
// (dealers table) alag tables hain:
//   POST /api/auth/login          -> admin/staff login
//   POST /api/auth/dealer-login   -> dealer login
//
// Dono me password bcrypt se compare hota hai (kabhi plain text compare
// nahi karte), aur success par ek JWT token milta hai jo aage har
// protected request ke "Authorization: Bearer <token>" header me jaata hai.

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const UserModel = require("../models/userModel");
const DealerModel = require("../models/dealerModel.js");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

const generateToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "8h" });
};

// POST /api/auth/login  (admin/staff)
exports.staffLogin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return apiResponse.error(res, 400, "Email and password are required.");
    }

    const user = await UserModel.findByEmail(email);

    // IMPORTANT: same error message whether email doesn't exist or
    // password is wrong. Telling the attacker "email not found" vs
    // "wrong password" separately makes it easier to guess valid emails.
    if (!user || user.status !== "active") {
        return apiResponse.error(res, 401, "Invalid email or password.");
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
        return apiResponse.error(res, 401, "Invalid email or password.");
    }

    await UserModel.updateLastLogin(user.user_id);

    const token = generateToken({ user_id: user.user_id, role: user.role, type: "staff" });

    return apiResponse.success(res, 200, "Login successful.", {
        token,
        user: { user_id: user.user_id, full_name: user.full_name, role: user.role }
    });
});

// POST /api/auth/dealer-login
exports.dealerLogin = asyncHandler(async (req, res) => {
    const { login_id, password } = req.body;

    if (!login_id || !password) {
        return apiResponse.error(res, 400, "Login ID and password are required.");
    }

    const dealer = await DealerModel.findByLoginId(login_id);

    if (!dealer || dealer.dealer_status !== "active") {
        return apiResponse.error(res, 401, "Invalid login ID or password.");
    }

    const passwordMatches = await bcrypt.compare(password, dealer.password_hash);
    if (!passwordMatches) {
        return apiResponse.error(res, 401, "Invalid login ID or password.");
    }

    const token = generateToken({ dealer_id: dealer.dealer_id, role: "dealer", type: "dealer" });

    return apiResponse.success(res, 200, "Login successful.", {
        token,
        dealer: { dealer_id: dealer.dealer_id, dealer_name: dealer.dealer_name, dealer_code: dealer.dealer_code }
    });
});
