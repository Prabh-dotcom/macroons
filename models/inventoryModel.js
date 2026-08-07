// models/inventoryModel.js
const db = require("../config/db");

exports.getAll = async ({ search, status, categoryId, page = 1, limit = 10 }) => {
    const offset = (Math.max(1, page) - 1) * limit;

    let whereClauses = [];
    let params = [];

    if (search) {
        whereClauses.push("(inv.serial_number LIKE ? OR inv.batch_number LIKE ? OR p.product_name LIKE ? OR p.model_name LIKE ?)");
        const likeSearch = `%${search}%`;
        params.push(likeSearch, likeSearch, likeSearch, likeSearch);
    }

    if (status) {
        whereClauses.push("inv.status = ?");
        params.push(status);
    }

    if (categoryId) {
        whereClauses.push("p.category_id = ?");
        params.push(categoryId);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const dataQuery = `
        SELECT
            inv.inventory_id, inv.serial_number, inv.batch_number, inv.mfg_date,
            inv.status, inv.created_at,
            p.product_id, p.product_name, p.model_name, p.warranty_months,
            c.category_id, c.category_name
        FROM inventory inv
        JOIN products p ON inv.product_id = p.product_id
        JOIN product_categories c ON p.category_id = c.category_id
        ${whereSql}
        ORDER BY inv.created_at DESC
        LIMIT ? OFFSET ?
    `;

    const countQuery = `
        SELECT COUNT(*) AS total
        FROM inventory inv
        JOIN products p ON inv.product_id = p.product_id
        JOIN product_categories c ON p.category_id = c.category_id
        ${whereSql}
    `;

    const [rows] = await db.query(dataQuery, [...params, Number(limit), Number(offset)]);
    const [countResult] = await db.query(countQuery, params);

    return {
        inventory: rows,
        pagination: {
            total: countResult[0].total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(countResult[0].total / limit)
        }
    };
};

exports.getById = async (inventoryId) => {
    const [rows] = await db.query(
        `SELECT inv.*, p.product_name, p.model_name, p.warranty_months, c.category_name
         FROM inventory inv
         JOIN products p ON inv.product_id = p.product_id
         JOIN product_categories c ON p.category_id = c.category_id
         WHERE inv.inventory_id = ?`,
        [inventoryId]
    );
    return rows[0] || null;
};

exports.serialExists = async (serialNumber, excludeInventoryId = null) => {
    let query = "SELECT inventory_id FROM inventory WHERE serial_number = ?";
    const params = [serialNumber];

    if (excludeInventoryId) {
        query += " AND inventory_id != ?";
        params.push(excludeInventoryId);
    }

    const [rows] = await db.query(query, params);
    return rows.length > 0;
};

exports.create = async ({ product_id, serial_number, batch_number, mfg_date, status }) => {
    const [result] = await db.query(
        `INSERT INTO inventory (product_id, serial_number, batch_number, mfg_date, status)
         VALUES (?, ?, ?, ?, ?)`,
        [product_id, serial_number, batch_number || null, mfg_date, status || "in_stock"]
    );
    return result.insertId;
};

exports.update = async (inventoryId, { serial_number, batch_number, mfg_date, status }) => {
    const [result] = await db.query(
        `UPDATE inventory SET serial_number = ?, batch_number = ?, mfg_date = ?, status = ?
         WHERE inventory_id = ?`,
        [serial_number, batch_number || null, mfg_date, status, inventoryId]
    );
    return result.affectedRows > 0;
};

exports.remove = async (inventoryId) => {
    const [result] = await db.query("DELETE FROM inventory WHERE inventory_id = ?", [inventoryId]);
    return result.affectedRows > 0;
};

/* =========================================================
   DASHBOARD STATS -- 4 summary cards
========================================================= */
exports.getStats = async () => {
    const [[row]] = await db.query(`
        SELECT
            COUNT(*) AS total_inventory,
            COALESCE(SUM(CASE WHEN status = 'in_stock' THEN 1 ELSE 0 END), 0) AS available_stock,
            COALESCE(SUM(CASE WHEN status = 'dispatched' THEN 1 ELSE 0 END), 0) AS dispatched_stock
        FROM inventory
    `);

    // "Replaced" isn't an inventory.status value (schema has in_stock/
    // dispatched/sold/defective/returned) -- a completed replacement is
    // recorded in the replacements table instead, so that's the real
    // source of truth for this card.
    const [[replacedRow]] = await db.query(
        `SELECT COUNT(*) AS replaced_count FROM replacements WHERE status = 'completed'`
    );

    return {
        total_inventory: Number(row.total_inventory),
        available_stock: Number(row.available_stock),
        dispatched_stock: Number(row.dispatched_stock),
        replaced_count: Number(replacedRow.replaced_count)
    };
};

/* =========================================================
   EXPORT -- same filters as getAll but no pagination, used by
   the Export Excel button so the export matches what's on screen
========================================================= */
exports.getAllForExport = async ({ search, status, categoryId }) => {
    let whereClauses = [];
    let params = [];

    if (search) {
        whereClauses.push("(inv.serial_number LIKE ? OR inv.batch_number LIKE ? OR p.product_name LIKE ? OR p.model_name LIKE ?)");
        const likeSearch = `%${search}%`;
        params.push(likeSearch, likeSearch, likeSearch, likeSearch);
    }

    if (status) {
        whereClauses.push("inv.status = ?");
        params.push(status);
    }

    if (categoryId) {
        whereClauses.push("p.category_id = ?");
        params.push(categoryId);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const [rows] = await db.query(`
        SELECT
            inv.serial_number, inv.batch_number, inv.mfg_date, inv.status,
            p.product_name, p.model_name, p.warranty_months, c.category_name
        FROM inventory inv
        JOIN products p ON inv.product_id = p.product_id
        JOIN product_categories c ON p.category_id = c.category_id
        ${whereSql}
        ORDER BY inv.created_at DESC
    `, params);

    return rows;
};
