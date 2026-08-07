// models/replacementModel.js
const db = require("../config/db");

// Old serial search: product details + warranty info + dealer + customer
// (customer/dealer info us serial ki warranty record se aati hai)
exports.lookupOldSerial = async (serialNumber) => {
    const [rows] = await db.query(
        `SELECT
            inv.inventory_id, inv.serial_number, inv.batch_number,
            p.product_name, p.model_name, c.category_name,
            w.warranty_id, w.status AS warranty_status, w.activation_date, w.expiry_date,
            w.customer_name, w.customer_phone, w.customer_city, w.customer_address,
            dl.dealer_id, dl.dealer_name, dl.dealer_code, dl.phone AS dealer_phone
         FROM inventory inv
         JOIN products p ON inv.product_id = p.product_id
         JOIN product_categories c ON p.category_id = c.category_id
         LEFT JOIN warranty w ON w.inventory_id = inv.inventory_id
         LEFT JOIN dealers dl ON dl.dealer_id = w.dealer_id
         WHERE inv.serial_number = ?`,
        [serialNumber]
    );
    return rows[0] || null;
};

// New serial search: must be in_stock
exports.lookupNewSerial = async (serialNumber) => {
    const [rows] = await db.query(
        `SELECT inv.inventory_id, inv.serial_number, inv.batch_number, inv.status,
                p.product_name, p.model_name, c.category_name
         FROM inventory inv
         JOIN products p ON inv.product_id = p.product_id
         JOIN product_categories c ON p.category_id = c.category_id
         WHERE inv.serial_number = ?`,
        [serialNumber]
    );
    return rows[0] || null;
};

exports.getStats = async () => {
    const [rows] = await db.query(`
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'approved' OR status = 'completed' THEN 1 ELSE 0 END) AS approved,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
        FROM replacements
    `);
    return rows[0];
};

exports.getAll = async ({ search, status, page = 1, limit = 10 }) => {
    const offset = (Math.max(1, page) - 1) * limit;

    let whereClauses = [];
    let params = [];

    if (search) {
        whereClauses.push("(r.replacement_id LIKE ? OR oldInv.serial_number LIKE ? OR r.customer_name LIKE ?)");
        const likeSearch = `%${search}%`;
        params.push(likeSearch, likeSearch, likeSearch);
    }

    if (status) {
        whereClauses.push("r.status = ?");
        params.push(status);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const dataQuery = `
        SELECT
            r.replacement_id, r.reason, r.complaint_type, r.status, r.created_at,
            r.customer_name, r.customer_phone,
            oldInv.serial_number AS old_serial_number,
            newInv.serial_number AS new_serial_number,
            dl.dealer_name, dl.dealer_code
        FROM replacements r
        JOIN inventory oldInv ON r.old_inventory_id = oldInv.inventory_id
        LEFT JOIN inventory newInv ON r.new_inventory_id = newInv.inventory_id
        JOIN dealers dl ON r.dealer_id = dl.dealer_id
        ${whereSql}
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?
    `;

    const countQuery = `
        SELECT COUNT(*) AS total
        FROM replacements r
        JOIN inventory oldInv ON r.old_inventory_id = oldInv.inventory_id
        JOIN dealers dl ON r.dealer_id = dl.dealer_id
        ${whereSql}
    `;

    const [rows] = await db.query(dataQuery, [...params, Number(limit), Number(offset)]);
    const [countResult] = await db.query(countQuery, params);

    return {
        replacements: rows,
        pagination: {
            total: countResult[0].total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(countResult[0].total / limit)
        }
    };
};

exports.getById = async (replacementId) => {
    const [rows] = await db.query(
        `SELECT r.*, oldInv.serial_number AS old_serial_number,
                newInv.serial_number AS new_serial_number,
                dl.dealer_name, dl.dealer_code
         FROM replacements r
         JOIN inventory oldInv ON r.old_inventory_id = oldInv.inventory_id
         LEFT JOIN inventory newInv ON r.new_inventory_id = newInv.inventory_id
         JOIN dealers dl ON r.dealer_id = dl.dealer_id
         WHERE r.replacement_id = ?`,
        [replacementId]
    );
    return rows[0] || null;
};

// Transaction: replacement row banao, old serial ko "defective" karo,
// naya serial diya gaya ho to use "dispatched" karo.
exports.create = async (data) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [result] = await connection.query(
            `INSERT INTO replacements
                (old_inventory_id, new_inventory_id, dealer_id, company_name,
                 customer_name, customer_phone, customer_city, customer_address,
                 reason, complaint_type, inspection_status, inspection_remarks,
                 replacement_date, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.old_inventory_id, data.new_inventory_id || null, data.dealer_id,
                data.company_name || null, data.customer_name, data.customer_phone,
                data.customer_city || null, data.customer_address || null,
                data.reason || null, data.complaint_type || null,
                data.inspection_status || null, data.inspection_remarks || null,
                data.replacement_date || null, data.status || "pending"
            ]
        );

        await connection.query(
            "UPDATE inventory SET status = 'defective' WHERE inventory_id = ?",
            [data.old_inventory_id]
        );

        if (data.new_inventory_id) {
            await connection.query(
                "UPDATE inventory SET status = 'dispatched' WHERE inventory_id = ?",
                [data.new_inventory_id]
            );
        }

        await connection.commit();
        return result.insertId;

    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};

exports.updateStatus = async (replacementId, status) => {
    const [result] = await db.query(
        "UPDATE replacements SET status = ? WHERE replacement_id = ?",
        [status, replacementId]
    );
    return result.affectedRows > 0;
};

exports.remove = async (replacementId) => {
    const [result] = await db.query("DELETE FROM replacements WHERE replacement_id = ?", [replacementId]);
    return result.affectedRows > 0;
};
