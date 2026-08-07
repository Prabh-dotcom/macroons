// models/warrantyModel.js
const db = require("../config/db");

// Serial number search karte hi product details AUR dealer details dono
// milte hain -- dealer wahi hai jisko yeh serial dispatch hua tha
// (dispatch_items table se link karke). Agar yeh serial kabhi dispatch
// hi nahi hua, dealer info null aayega (frontend ko batayenge "pehle
// dispatch karo").
exports.lookupSerialForWarranty = async (serialNumber) => {
    const [rows] = await db.query(
        `SELECT
            inv.inventory_id, inv.serial_number, inv.batch_number, inv.mfg_date,
            p.product_name, p.model_name, p.warranty_months,
            c.category_name,
            dl.dealer_id, dl.dealer_name, dl.dealer_code, dl.phone AS dealer_phone,
            dl.email AS dealer_email, dl.state AS dealer_state, dl.city AS dealer_city
         FROM inventory inv
         JOIN products p ON inv.product_id = p.product_id
         JOIN product_categories c ON p.category_id = c.category_id
         LEFT JOIN dispatch_items di ON di.inventory_id = inv.inventory_id
         LEFT JOIN dispatch dp ON dp.dispatch_id = di.dispatch_id
         LEFT JOIN dealers dl ON dl.dealer_id = dp.dealer_id
         WHERE inv.serial_number = ?
         ORDER BY dp.dispatch_date DESC
         LIMIT 1`,
        [serialNumber]
    );
    return rows[0] || null;
};

exports.getAll = async ({ search, status, page = 1, limit = 10 }) => {
    const offset = (Math.max(1, page) - 1) * limit;

    let whereClauses = [];
    let params = [];

    if (search) {
        whereClauses.push("(inv.serial_number LIKE ? OR w.customer_name LIKE ? OR dl.dealer_name LIKE ?)");
        const likeSearch = `%${search}%`;
        params.push(likeSearch, likeSearch, likeSearch);
    }

    if (status) {
        whereClauses.push("w.status = ?");
        params.push(status);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const dataQuery = `
        SELECT
            w.warranty_id, w.activation_date, w.expiry_date, w.status,
            w.customer_name, w.customer_phone, w.remarks, w.created_at,
            inv.serial_number, p.product_name, p.model_name, c.category_name,
            dl.dealer_id, dl.dealer_name, dl.dealer_code
        FROM warranty w
        JOIN inventory inv ON w.inventory_id = inv.inventory_id
        JOIN products p ON inv.product_id = p.product_id
        JOIN product_categories c ON p.category_id = c.category_id
        JOIN dealers dl ON w.dealer_id = dl.dealer_id
        ${whereSql}
        ORDER BY w.created_at DESC
        LIMIT ? OFFSET ?
    `;

    const countQuery = `
        SELECT COUNT(*) AS total
        FROM warranty w
        JOIN inventory inv ON w.inventory_id = inv.inventory_id
        JOIN dealers dl ON w.dealer_id = dl.dealer_id
        ${whereSql}
    `;

    const [rows] = await db.query(dataQuery, [...params, Number(limit), Number(offset)]);
    const [countResult] = await db.query(countQuery, params);

    return {
        warranty: rows,
        pagination: {
            total: countResult[0].total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(countResult[0].total / limit)
        }
    };
};

exports.getById = async (warrantyId) => {
    const [rows] = await db.query(
        `SELECT w.*, inv.serial_number, p.product_name, p.model_name, c.category_name,
                dl.dealer_name, dl.dealer_code
         FROM warranty w
         JOIN inventory inv ON w.inventory_id = inv.inventory_id
         JOIN products p ON inv.product_id = p.product_id
         JOIN product_categories c ON p.category_id = c.category_id
         JOIN dealers dl ON w.dealer_id = dl.dealer_id
         WHERE w.warranty_id = ?`,
        [warrantyId]
    );
    return rows[0] || null;
};

exports.serialAlreadyUnderWarranty = async (inventoryId, excludeWarrantyId = null) => {
    let query = "SELECT warranty_id FROM warranty WHERE inventory_id = ?";
    const params = [inventoryId];
    if (excludeWarrantyId) {
        query += " AND warranty_id != ?";
        params.push(excludeWarrantyId);
    }
    const [rows] = await db.query(query, params);
    return rows.length > 0;
};

exports.create = async (data) => {
    const [result] = await db.query(
        `INSERT INTO warranty
            (inventory_id, dealer_id, customer_name, customer_phone, customer_email,
             customer_state, customer_district, customer_city, customer_pincode, customer_address,
             invoice_number, purchase_date, activation_date, expiry_date, status, activated_by, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            data.inventory_id, data.dealer_id, data.customer_name, data.customer_phone,
            data.customer_email || null, data.customer_state || null, data.customer_district || null,
            data.customer_city || null, data.customer_pincode || null, data.customer_address || null,
            data.invoice_number || null, data.purchase_date || null, data.activation_date,
            data.expiry_date, data.status || "active", data.activated_by || null, data.remarks || null
        ]
    );
    return result.insertId;
};

exports.remove = async (warrantyId) => {
    const [result] = await db.query("DELETE FROM warranty WHERE warranty_id = ?", [warrantyId]);
    return result.affectedRows > 0;
};
