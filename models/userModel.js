// models/userModel.js
const db = require("../config/db");

exports.findByEmail = async (email) => {
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    return rows[0] || null;
};

exports.updateLastLogin = async (userId) => {
    await db.query("UPDATE users SET last_login_at = NOW() WHERE user_id = ?", [userId]);
};

exports.create = async (user) => {
    const [result] = await db.query(
        `INSERT INTO users (full_name, email, mobile, password_hash, role, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [user.full_name, user.email, user.mobile, user.password_hash, user.role || "staff", user.status || "active"]
    );
    return result.insertId;
};

// -----------------------------------------------------------------
// Admin panel "Settings > Users" CRUD -- alag se, kyunki authModel
// wala "create" sirf seedAdmin.js jaisi cheezon ke liye tha.
// -----------------------------------------------------------------

exports.getAll = async ({ search, role, status, page = 1, limit = 10 }) => {
    const offset = (Math.max(1, page) - 1) * limit;

    let whereClauses = [];
    let params = [];

    if (search) {
        whereClauses.push("(full_name LIKE ? OR email LIKE ? OR mobile LIKE ?)");
        const likeSearch = `%${search}%`;
        params.push(likeSearch, likeSearch, likeSearch);
    }
    if (role) {
        whereClauses.push("role = ?");
        params.push(role);
    }
    if (status) {
        whereClauses.push("status = ?");
        params.push(status);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const dataQuery = `
        SELECT user_id, full_name, email, mobile, role, status, last_login_at, created_at
        FROM users
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `;
    const countQuery = `SELECT COUNT(*) AS total FROM users ${whereSql}`;

    const [rows] = await db.query(dataQuery, [...params, Number(limit), Number(offset)]);
    const [countResult] = await db.query(countQuery, params);

    return {
        users: rows,
        pagination: {
            total: countResult[0].total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(countResult[0].total / limit)
        }
    };
};

exports.getById = async (userId) => {
    const [rows] = await db.query(
        "SELECT user_id, full_name, email, mobile, role, status, last_login_at, created_at FROM users WHERE user_id = ?",
        [userId]
    );
    return rows[0] || null;
};

exports.emailExists = async (email, excludeUserId = null) => {
    let query = "SELECT user_id FROM users WHERE email = ?";
    const params = [email];
    if (excludeUserId) {
        query += " AND user_id != ?";
        params.push(excludeUserId);
    }
    const [rows] = await db.query(query, params);
    return rows.length > 0;
};

exports.update = async (userId, { full_name, mobile, role, status }) => {
    const [result] = await db.query(
        "UPDATE users SET full_name = ?, mobile = ?, role = ?, status = ? WHERE user_id = ?",
        [full_name, mobile, role, status, userId]
    );
    return result.affectedRows > 0;
};

exports.updatePassword = async (userId, password_hash) => {
    const [result] = await db.query(
        "UPDATE users SET password_hash = ? WHERE user_id = ?",
        [password_hash, userId]
    );
    return result.affectedRows > 0;
};

exports.remove = async (userId) => {
    const [result] = await db.query("DELETE FROM users WHERE user_id = ?", [userId]);
    return result.affectedRows > 0;
};


// Self-service "Change Password" ke liye -- current password verify
// karna hai isliye password_hash bhi chahiye (normal getById me nahi hota)
exports.getByIdWithPassword = async (userId) => {
    const [rows] = await db.query("SELECT * FROM users WHERE user_id = ?", [userId]);
    return rows[0] || null;
};