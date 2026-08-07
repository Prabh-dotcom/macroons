// models/reportModel.js
//
// Reports page ek "unified report" dikhata hai jo dispatch, warranty,
// replacement, inventory, dealers aur reward transactions -- in sabko
// ek UNION query se combine karta hai. Har row ka "type" pata hota hai
// (DSP/WAR/RPL/INV/DLR/RWD) taaki "Report Type" filter se sirf ek type
// bhi dikha sakein.

const db = require("../config/db");

const UNIFIED_REPORT_SQL = `
    SELECT 'dispatch' AS type, CONCAT('DSP', dp.dispatch_id) AS report_id,
           dp.dispatch_date AS report_date, dl.dealer_name, dl.state,
           c.category_name, p.product_name, p.model_name, inv.serial_number,
           dp.status
    FROM dispatch dp
    JOIN dealers dl ON dp.dealer_id = dl.dealer_id
    JOIN dispatch_items di ON di.dispatch_id = dp.dispatch_id
    JOIN inventory inv ON di.inventory_id = inv.inventory_id
    JOIN products p ON inv.product_id = p.product_id
    JOIN product_categories c ON p.category_id = c.category_id

    UNION ALL

    SELECT 'warranty', CONCAT('WAR', w.warranty_id),
           w.activation_date, dl.dealer_name, dl.state,
           c.category_name, p.product_name, p.model_name, inv.serial_number,
           w.status
    FROM warranty w
    JOIN inventory inv ON w.inventory_id = inv.inventory_id
    JOIN products p ON inv.product_id = p.product_id
    JOIN product_categories c ON p.category_id = c.category_id
    JOIN dealers dl ON w.dealer_id = dl.dealer_id

    UNION ALL

    SELECT 'replacement', CONCAT('RPL', r.replacement_id),
           DATE(r.created_at), dl.dealer_name, dl.state,
           c.category_name, p.product_name, p.model_name, oldInv.serial_number,
           r.status
    FROM replacements r
    JOIN inventory oldInv ON r.old_inventory_id = oldInv.inventory_id
    JOIN products p ON oldInv.product_id = p.product_id
    JOIN product_categories c ON p.category_id = c.category_id
    JOIN dealers dl ON r.dealer_id = dl.dealer_id

    UNION ALL

    SELECT 'inventory', CONCAT('INV', inv.inventory_id),
           DATE(inv.created_at), '-', '-',
           c.category_name, p.product_name, p.model_name, inv.serial_number,
           inv.status
    FROM inventory inv
    JOIN products p ON inv.product_id = p.product_id
    JOIN product_categories c ON p.category_id = c.category_id

    UNION ALL

    SELECT 'dealer', CONCAT('DLR', dl.dealer_id),
           DATE(dl.created_at), dl.dealer_name, dl.state,
           '-', '-', '-', '-',
           dl.dealer_status
    FROM dealers dl

    UNION ALL

    SELECT 'reward', CONCAT('RWD', rt.transaction_id),
           rt.transaction_date, dl.dealer_name, dl.state,
           '-', '-', '-', '-',
           rt.status
    FROM reward_transactions rt
    JOIN dealers dl ON rt.dealer_id = dl.dealer_id
`;

const REPORT_TYPE_MAP = {
    "All Reports": null,
    "Inventory Report": "inventory",
    "Dispatch Report": "dispatch",
    "Warranty Report": "warranty",
    "Replacement Report": "replacement",
    "Dealer Report": "dealer",
    "Reward Wallet Report": "reward"
};

exports.getDashboardStats = async () => {
    const [[inventory]] = await db.query("SELECT COUNT(*) AS total FROM inventory");
    const [[dispatch]] = await db.query("SELECT COUNT(*) AS total FROM dispatch");
    const [[warranty]] = await db.query("SELECT COUNT(*) AS total FROM warranty WHERE status = 'active'");
    const [[replacements]] = await db.query("SELECT COUNT(*) AS total FROM replacements");

    return {
        total_inventory: inventory.total,
        total_dispatch: dispatch.total,
        warranty_activated: warranty.total,
        total_replacements: replacements.total
    };
};

exports.getSummary = async () => {
    const [[availableInv]] = await db.query("SELECT COUNT(*) AS c FROM inventory WHERE status = 'in_stock'");
    const [[dispatchedInv]] = await db.query("SELECT COUNT(*) AS c FROM inventory WHERE status = 'dispatched'");
    const [[activeWarranty]] = await db.query("SELECT COUNT(*) AS c FROM warranty WHERE status = 'active'");
    const [[approvedReplacement]] = await db.query("SELECT COUNT(*) AS c FROM replacements WHERE status IN ('approved','completed')");
    const [[totalReplacement]] = await db.query("SELECT COUNT(*) AS c FROM replacements");
    const [[totalDealers]] = await db.query("SELECT COUNT(*) AS c FROM dealers");
    const [[rewardBalance]] = await db.query("SELECT COALESCE(SUM(current_balance),0) AS c FROM dealer_reward_balance");
    const [[dispatchCount]] = await db.query("SELECT COUNT(*) AS c FROM dispatch");
    const [[warrantyCount]] = await db.query("SELECT COUNT(*) AS c FROM warranty");

    const totalReports = dispatchCount.c + warrantyCount.c + totalReplacement.c;
    const successRate = totalReplacement.c > 0
        ? ((approvedReplacement.c / totalReplacement.c) * 100).toFixed(1)
        : "0.0";

    return {
        inventory_available: availableInv.c,
        inventory_dispatched: dispatchedInv.c,
        warranty_active: activeWarranty.c,
        replacement_approved: approvedReplacement.c,
        total_dealers: totalDealers.c,
        reward_balance: rewardBalance.c,
        total_reports: totalReports,
        success_rate: successRate
    };
};

exports.getReports = async ({
    search, fromDate, toDate, reportType, status,
    dealer, category, productName, modelNumber, state,
    page = 1, limit = 15
}) => {
    const offset = (Math.max(1, page) - 1) * limit;

    let whereClauses = [];
    let params = [];

    if (search) {
        whereClauses.push("(report_id LIKE ? OR dealer_name LIKE ? OR serial_number LIKE ?)");
        const likeSearch = `%${search}%`;
        params.push(likeSearch, likeSearch, likeSearch);
    }

    if (fromDate) {
        whereClauses.push("report_date >= ?");
        params.push(fromDate);
    }
    if (toDate) {
        whereClauses.push("report_date <= ?");
        params.push(toDate);
    }

    const mappedType = REPORT_TYPE_MAP[reportType];
    if (mappedType) {
        whereClauses.push("type = ?");
        params.push(mappedType);
    }

    if (status && status !== "All Status") {
        whereClauses.push("status = ?");
        params.push(status.toLowerCase());
    }

    if (dealer) {
        whereClauses.push("dealer_name LIKE ?");
        params.push(`%${dealer}%`);
    }

    if (category && category !== "All Categories") {
        whereClauses.push("category_name = ?");
        params.push(category);
    }

    if (productName) {
        whereClauses.push("product_name LIKE ?");
        params.push(`%${productName}%`);
    }

    if (modelNumber) {
        whereClauses.push("model_name LIKE ?");
        params.push(`%${modelNumber}%`);
    }

    if (state) {
        whereClauses.push("state LIKE ?");
        params.push(`%${state}%`);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const dataQuery = `
        SELECT * FROM (${UNIFIED_REPORT_SQL}) AS combined
        ${whereSql}
        ORDER BY report_date DESC
        LIMIT ? OFFSET ?
    `;

    const countQuery = `
        SELECT COUNT(*) AS total FROM (${UNIFIED_REPORT_SQL}) AS combined
        ${whereSql}
    `;

    const [rows] = await db.query(dataQuery, [...params, Number(limit), Number(offset)]);
    const [countResult] = await db.query(countQuery, params);

    return {
        reports: rows,
        pagination: {
            total: countResult[0].total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(countResult[0].total / limit)
        }
    };
};
