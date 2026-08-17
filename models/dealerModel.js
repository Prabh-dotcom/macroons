// models/dealerModel.js
//
// Yahan sirf SQL queries hain — koi business logic nahi (validation,
// password hashing waghera controller me hota hai). Yeh separation
// isliye important hai: agar kal ORM (Sequelize/Prisma) me switch
// karna pade, sirf yeh ek file badalni padegi, controller nahi.

const db = require("../config/db");

// GET all dealers, with search + filter + pagination + sorting
// Query params handled: search, status, page, limit, sortBy, sortOrder
exports.getAll = async ({ search, status, page = 1, limit = 10, sortBy = "created_at", sortOrder = "DESC" }) => {

    // Whitelist sortable columns -- IMPORTANT: never put req.query directly
    // into ORDER BY without whitelisting, that is a SQL injection risk.
    const allowedSortColumns = ["dealer_name", "dealer_code", "city", "created_at", "dealer_status"];
    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : "created_at";
    const safeSortOrder = sortOrder === "ASC" ? "ASC" : "DESC";

    const offset = (Math.max(1, page) - 1) * limit;

    let whereClauses = [];
    let params = [];

    if (search) {
        whereClauses.push("(dealer_name LIKE ? OR dealer_code LIKE ? OR phone LIKE ? OR city LIKE ?)");
        const likeSearch = `%${search}%`;
        params.push(likeSearch, likeSearch, likeSearch, likeSearch);
    }

    if (status) {
        whereClauses.push("dealer_status = ?");
        params.push(status);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const dataQuery = `
        SELECT dealer_id, dealer_code, login_id, dealer_name, contact_person,
               phone, email, city, district, state, dealer_status, reward_eligible, created_at
        FROM dealers
        ${whereSql}
        ORDER BY ${safeSortBy} ${safeSortOrder}
        LIMIT ? OFFSET ?
    `;

    const countQuery = `SELECT COUNT(*) AS total FROM dealers ${whereSql}`;

    const [rows] = await db.query(dataQuery, [...params, Number(limit), Number(offset)]);
    const [countResult] = await db.query(countQuery, params);

    return {
        dealers: rows,
        pagination: {
            total: countResult[0].total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(countResult[0].total / limit)
        }
    };
};

exports.getById = async (dealerId) => {
    const [rows] = await db.query(
        `SELECT dealer_id, dealer_code, login_id, dealer_name, contact_person,
                phone, email, address_line, city, district, state, pincode, gst_number,
                dealer_status, reward_eligible, created_at, updated_at
         FROM dealers WHERE dealer_id = ?`,
        [dealerId]
    );
    return rows[0] || null;
};

exports.codeExists = async (dealerCode) => {
    const [rows] = await db.query("SELECT dealer_id FROM dealers WHERE dealer_code = ?", [dealerCode]);
    return rows.length > 0;
};

exports.create = async (dealer) => {
    const [result] = await db.query(
        `INSERT INTO dealers
            (dealer_code, login_id, password_hash, dealer_name, contact_person,
             phone, email, address_line, city, district, state, pincode, gst_number,
             dealer_status, reward_eligible)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            dealer.dealer_code, dealer.login_id, dealer.password_hash, dealer.dealer_name,
            dealer.contact_person || null, dealer.phone, dealer.email || null,
            dealer.address_line || null, dealer.city || null, dealer.district || null, dealer.state || null,
            dealer.pincode || null, dealer.gst_number || null,
            dealer.dealer_status || "active", dealer.reward_eligible ?? 1
        ]
    );
    return result.insertId;
};

exports.update = async (dealerId, dealer) => {
    const [result] = await db.query(
        `UPDATE dealers SET
            dealer_name = ?, contact_person = ?, phone = ?, email = ?,
            address_line = ?, city = ?, district = ?, state = ?, pincode = ?, gst_number = ?,
            dealer_status = ?, reward_eligible = ?
         WHERE dealer_id = ?`,
        [
            dealer.dealer_name, dealer.contact_person || null, dealer.phone,
            dealer.email || null, dealer.address_line || null, dealer.city || null,
            dealer.district || null, dealer.state || null, dealer.pincode || null, dealer.gst_number || null,
            dealer.dealer_status, dealer.reward_eligible, dealerId
        ]
    );
    return result.affectedRows > 0;
};

exports.remove = async (dealerId) => {
    const [result] = await db.query("DELETE FROM dealers WHERE dealer_id = ?", [dealerId]);
    return result.affectedRows > 0;
};

exports.findByLoginId = async (loginId) => {
    const [rows] = await db.query("SELECT * FROM dealers WHERE login_id = ?", [loginId]);
    return rows[0] || null;
};