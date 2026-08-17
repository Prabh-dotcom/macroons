// models/dispatchModel.js
//
// Dispatch = header (invoice level) + 1 item (serial number) is form ke
// liye. Jab dispatch create hota hai, teen cheezein ek saath honi
// zaroori hain: dispatch row banana, dispatch_items row banana, aur
// inventory ka status "in_stock" se "dispatched" karna. Agar beech me
// koi step fail ho jaye, sab wapas rollback hona chahiye -- isliye
// yahan MySQL TRANSACTION use kiya hai, alag-alag queries nahi.

const db = require("../config/db");

exports.getAll = async ({ search, status, page = 1, limit = 10, sortBy = "created_at", sortOrder = "DESC" }) => {
    const offset = (Math.max(1, page) - 1) * limit;

    // Whitelist sortable columns -- raw req.query kabhi ORDER BY me
    // seedha nahi daalte, warna SQL injection ka risk hota hai.
    const allowedSortColumns = {
        invoice_number: "dp.invoice_number",
        dealer_name: "dl.dealer_name",
        dispatch_date: "dp.dispatch_date",
        status: "dp.status"
    };
    const safeSortBy = allowedSortColumns[sortBy] || "dp.created_at";
    const safeSortOrder = sortOrder === "ASC" ? "ASC" : "DESC";

    let whereClauses = [];
    let params = [];

    if (search) {
        whereClauses.push("(dp.invoice_number LIKE ? OR dp.company_name LIKE ? OR dl.dealer_name LIKE ? OR inv.serial_number LIKE ?)");
        const likeSearch = `%${search}%`;
        params.push(likeSearch, likeSearch, likeSearch, likeSearch);
    }

    if (status) {
        whereClauses.push("dp.status = ?");
        params.push(status);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const dataQuery = `
        SELECT
            dp.dispatch_id, dp.invoice_number, dp.company_name, dp.dispatch_date,
            dp.transport_name, dp.lr_number, dp.remarks, dp.status, dp.created_at,
            dl.dealer_id, dl.dealer_name, dl.dealer_code, dl.phone AS dealer_phone,
            dl.state AS dealer_state,
            inv.inventory_id, inv.serial_number, inv.batch_number,
            p.product_name, p.model_name, c.category_name
        FROM dispatch dp
        JOIN dealers dl ON dp.dealer_id = dl.dealer_id
        JOIN dispatch_items di ON di.dispatch_id = dp.dispatch_id
        JOIN inventory inv ON di.inventory_id = inv.inventory_id
        JOIN products p ON inv.product_id = p.product_id
        JOIN product_categories c ON p.category_id = c.category_id
        ${whereSql}
        ORDER BY ${safeSortBy} ${safeSortOrder}
        LIMIT ? OFFSET ?
    `;

    const countQuery = `
        SELECT COUNT(*) AS total
        FROM dispatch dp
        JOIN dealers dl ON dp.dealer_id = dl.dealer_id
        JOIN dispatch_items di ON di.dispatch_id = dp.dispatch_id
        JOIN inventory inv ON di.inventory_id = inv.inventory_id
        ${whereSql}
    `;

    const [rows] = await db.query(dataQuery, [...params, Number(limit), Number(offset)]);
    const [countResult] = await db.query(countQuery, params);

    return {
        dispatch: rows,
        pagination: {
            total: countResult[0].total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(countResult[0].total / limit)
        }
    };
};

exports.getStats = async () => {
    const [[total]] = await db.query("SELECT COUNT(*) AS c FROM dispatch");
    const [[today]] = await db.query("SELECT COUNT(*) AS c FROM dispatch WHERE dispatch_date = CURDATE()");
    const [[activeDealers]] = await db.query(
        "SELECT COUNT(DISTINCT dealer_id) AS c FROM dispatch WHERE status IN ('dispatched','delivered')"
    );
    const [[pending]] = await db.query("SELECT COUNT(*) AS c FROM dispatch WHERE status = 'pending'");

    return {
        total_dispatch: total.c,
        today_dispatch: today.c,
        active_dealers: activeDealers.c,
        pending_dispatch: pending.c
    };
};

exports.getById = async (dispatchId) => {
    const [rows] = await db.query(
        `SELECT
            dp.*, dl.dealer_name, dl.dealer_code, dl.phone AS dealer_phone,
            inv.inventory_id, inv.serial_number, inv.batch_number,
            p.product_name, p.model_name, c.category_name
         FROM dispatch dp
         JOIN dealers dl ON dp.dealer_id = dl.dealer_id
         JOIN dispatch_items di ON di.dispatch_id = dp.dispatch_id
         JOIN inventory inv ON di.inventory_id = inv.inventory_id
         JOIN products p ON inv.product_id = p.product_id
         JOIN product_categories c ON p.category_id = c.category_id
         WHERE dp.dispatch_id = ?`,
        [dispatchId]
    );
    return rows[0] || null;
};

exports.invoiceExists = async (invoiceNumber, excludeDispatchId = null) => {
    let query = "SELECT dispatch_id FROM dispatch WHERE invoice_number = ?";
    const params = [invoiceNumber];
    if (excludeDispatchId) {
        query += " AND dispatch_id != ?";
        params.push(excludeDispatchId);
    }
    const [rows] = await db.query(query, params);
    return rows.length > 0;
};

// Yeh function ek TRANSACTION use karta hai -- teeno steps ya to
// sab pass hote hain, ya sab fail hote hain (koi half-done state nahi).
exports.create = async ({
    invoice_number, company_name, dealer_id, dispatch_date,
    transport_name, lr_number, remarks, inventory_id
}) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Confirm serial abhi bhi "in_stock" hai (kisi aur dispatch me na chala gaya ho)
        const [invRows] = await connection.query(
            "SELECT status FROM inventory WHERE inventory_id = ? FOR UPDATE",
            [inventory_id]
        );

        if (invRows.length === 0) {
            throw Object.assign(new Error("Selected serial number not found."), { statusCode: 404 });
        }
        if (invRows[0].status !== "in_stock") {
            throw Object.assign(new Error("This serial number is not available for dispatch (already dispatched/sold)."), { statusCode: 409 });
        }

        // 2. Dispatch header banao
        const [dispatchResult] = await connection.query(
            `INSERT INTO dispatch (invoice_number, company_name, dealer_id, dispatch_date, transport_name, lr_number, remarks, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'dispatched')`,
            [invoice_number, company_name || null, dealer_id, dispatch_date, transport_name || null, lr_number || null, remarks || null]
        );
        const dispatchId = dispatchResult.insertId;

        // 3. Dispatch item link karo
        await connection.query(
            "INSERT INTO dispatch_items (dispatch_id, inventory_id) VALUES (?, ?)",
            [dispatchId, inventory_id]
        );

        // 4. Inventory status update karo
        await connection.query(
            "UPDATE inventory SET status = 'dispatched' WHERE inventory_id = ?",
            [inventory_id]
        );

        await connection.commit();
        return dispatchId;

    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};

exports.remove = async (dispatchId) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Delete se pehle jaan lo kaunsa serial tha, taaki use wapas "in_stock" kar sakein
        const [items] = await connection.query(
            "SELECT inventory_id FROM dispatch_items WHERE dispatch_id = ?",
            [dispatchId]
        );

        await connection.query("DELETE FROM dispatch WHERE dispatch_id = ?", [dispatchId]);
        // dispatch_items apne aap CASCADE delete ho jayega (schema me ON DELETE CASCADE hai)

        for (const item of items) {
            await connection.query(
                "UPDATE inventory SET status = 'in_stock' WHERE inventory_id = ?",
                [item.inventory_id]
            );
        }

        await connection.commit();
        return true;

    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};
