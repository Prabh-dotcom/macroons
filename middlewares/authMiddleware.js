// middlewares/authMiddleware.js
//
// Do middlewares:
//   1. verifyToken   -> confirms the request has a valid JWT (user is logged in)
//   2. allowRoles     -> confirms the logged-in user has permission
//                        (e.g. only 'admin'/'super_admin' can delete a dealer)
//
// USAGE in routes:
//   router.delete("/:id", verifyToken, allowRoles("admin","super_admin"), dealerController.deleteDealer);

const jwt = require("jsonwebtoken");

exports.verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization; // expected: "Bearer <token>"

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Access denied. No token provided."
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { user_id, role } — set during login, see authController.js
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token. Please log in again."
        });
    }
};

exports.allowRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to perform this action."
            });
        }
        next();
    };
};
