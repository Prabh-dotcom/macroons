// validators/dealerValidator.js
//
// Simple hand-written validation — koi extra npm package nahi use kiya
// (jaise express-validator) taaki tumhare existing package.json me kuch
// naya install na karna pade. Agar aage validation complex ho jaye
// (jaise 20+ fields), tab express-validator ya zod install karna
// zyada maintainable hoga — abhi ke liye yeh kaafi hai.

const validateDealer = (req, res, next) => {
    const { dealer_name, phone, login_id, password } = req.body;
    const errors = [];

    if (!dealer_name || dealer_name.trim().length < 2) {
        errors.push("Dealer name is required (minimum 2 characters).");
    }

    if (!phone || !/^[0-9]{10}$/.test(phone)) {
        errors.push("A valid 10-digit phone number is required.");
    }

    if (!login_id || login_id.trim().length < 4) {
        errors.push("Login ID is required (minimum 4 characters).");
    }

    // Password required only on CREATE, not on UPDATE
    if (req.method === "POST") {
        if (!password || password.length < 6) {
            errors.push("Password is required (minimum 6 characters).");
        }
    }

    if (req.body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)) {
        errors.push("Email format is invalid.");
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: "Validation failed.",
            errors
        });
    }

    next();
};

module.exports = { validateDealer };
