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
           dp.dispatch_date AS report_date, dl.dealer_name, dl.state, dl.district,
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
           w.activation_date, dl.dealer_name, dl.state, dl.district,
           c.category_name, p.product_name, p.model_name, inv.serial_number,
           w.status
    FROM warranty w
    JOIN inventory inv ON w.inventory_id = inv.inventory_id
    JOIN products p ON inv.product_id = p.product_id
    JOIN product_categories c ON p.category_id = c.category_id
    JOIN dealers dl ON w.dealer_id = dl.dealer_id

    UNION ALL

    SELECT 'replacement', CONCAT('RPL', r.replacement_id),
           DATE(r.created_at), dl.dealer_name, dl.state, dl.district,
           c.category_name, p.product_name, p.model_name, oldInv.serial_number,
           r.status
    FROM replacements r
    JOIN inventory oldInv ON r.old_inventory_id = oldInv.inventory_id
    JOIN products p ON oldInv.product_id = p.product_id
    JOIN product_categories c ON p.category_id = c.category_id
    JOIN dealers dl ON r.dealer_id = dl.dealer_id

    UNION ALL

    SELECT 'inventory', CONCAT('INV', inv.inventory_id),
           DATE(inv.created_at), '-', '-', '-',
           c.category_name, p.product_name, p.model_name, inv.serial_number,
           inv.status
    FROM inventory inv
    JOIN products p ON inv.product_id = p.product_id
    JOIN product_categories c ON p.category_id = c.category_id

    UNION ALL

    SELECT 'dealer', CONCAT('DLR', dl.dealer_id),
           DATE(dl.created_at), dl.dealer_name, dl.state, dl.district,
           '-', '-', '-', '-',
           dl.dealer_status
    FROM dealers dl

    UNION ALL

    SELECT 'reward', CONCAT('RWD', rt.transaction_id),
           rt.transaction_date, dl.dealer_name, dl.state, dl.district,
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

    // Success Rate -- pehle yeh sirf replacements (approved/completed) pe based
    // tha, jo bahut narrow tha aur "Total Reports" (dispatch+warranty+replacement)
    // se match nahi karta tha. Ab teeno flows ke "successful" outcomes ko unke
    // apne totals ke against measure karte hain, taaki number sahi aur
    // Total Reports ke sath consistent rahe:
    //   dispatch  -> delivered
    //   warranty  -> active
    //   replacement -> approved / completed
    const [[successCount]] = await db.query(`
        SELECT
            (SELECT COUNT(*) FROM dispatch WHERE status = 'delivered') +
            (SELECT COUNT(*) FROM warranty WHERE status = 'active') +
            (SELECT COUNT(*) FROM replacements WHERE status IN ('approved','completed')) AS c
    `);

    const successRate = totalReports > 0
        ? ((successCount.c / totalReports) * 100).toFixed(1)
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


/* =====================================================================
   CHARTS DATA -- Reports page ke 4 analytics charts ke liye real DB data.
   ===================================================================== */

exports.getChartsData = async () => {

    /* ---------- 1. Monthly Dispatch (last 6 months, zero-filled) ---------- */
    const [dispatchRows] = await db.query(`
        SELECT DATE_FORMAT(dispatch_date, '%Y-%m') AS ym, COUNT(*) AS c
        FROM dispatch
        WHERE dispatch_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
        GROUP BY ym
    `);
    const dispatchMap = {};
    dispatchRows.forEach(r => { dispatchMap[r.ym] = r.c; });

    const monthlyDispatch = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
        monthlyDispatch.push({ month: label, count: dispatchMap[ym] || 0 });
    }

    /* ---------- 2. Warranty & Replacement status breakdown ---------- */
    const [warrantyRows] = await db.query("SELECT status, COUNT(*) AS c FROM warranty GROUP BY status");
    const [replacementRows] = await db.query("SELECT status, COUNT(*) AS c FROM replacements GROUP BY status");

    const warranty = { pending: 0, active: 0, expired: 0, claimed: 0 };
    warrantyRows.forEach(r => { warranty[r.status] = r.c; });

    const replacement = { pending: 0, approved: 0, completed: 0, rejected: 0 };
    replacementRows.forEach(r => { replacement[r.status] = r.c; });

    /* ---------- 3. Top 5 Dealers by dispatch count ---------- */
    const [topDealers] = await db.query(`
        SELECT dl.dealer_name, COUNT(dp.dispatch_id) AS dispatch_count
        FROM dealers dl
        LEFT JOIN dispatch dp ON dp.dealer_id = dl.dealer_id
        GROUP BY dl.dealer_id
        ORDER BY dispatch_count DESC
        LIMIT 5
    `);

    /* ---------- 4. Reward Wallet distribution (top 6 dealers by balance) ---------- */
    const [rewardDistribution] = await db.query(`
        SELECT dl.dealer_name, COALESCE(rb.current_balance, 0) AS balance
        FROM dealers dl
        JOIN dealer_reward_balance rb ON rb.dealer_id = dl.dealer_id
        WHERE rb.current_balance > 0
        ORDER BY rb.current_balance DESC
        LIMIT 6
    `);

    return {
        monthly_dispatch: monthlyDispatch,
        warranty_breakdown: warranty,
        replacement_breakdown: replacement,
        top_dealers: topDealers,
        reward_distribution: rewardDistribution
    };
};

exports.getReports = async ({
    search, fromDate, toDate, reportType, status,
    dealer, category, productName, modelNumber, state, district,
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

    if (district) {
        whereClauses.push("district LIKE ?");
        params.push(`%${district}%`);
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


/* =====================================================================
   DEALER REPORTS PAGE (dealer/dealer-reports.html) -- everything below
   is ALWAYS scoped to one dealer_id (server passes it from the JWT,
   never trusts the frontend for it). 4 cards + 4 report tables.
===================================================================== */

exports.getDealerReportSummary = async (dealerId) => {
    const [[sales]] = await db.query(
        `SELECT COUNT(*) AS c
         FROM dispatch_items di
         JOIN dispatch dp ON di.dispatch_id = dp.dispatch_id
         WHERE dp.dealer_id = ? AND YEAR(dp.dispatch_date) = YEAR(CURDATE())`,
        [dealerId]
    );
    const [[warranty]] = await db.query(
        "SELECT COUNT(*) AS c FROM warranty WHERE dealer_id = ?",
        [dealerId]
    );
    const [[replacement]] = await db.query(
        "SELECT COUNT(*) AS c FROM replacements WHERE dealer_id = ?",
        [dealerId]
    );
    const [[rewardEarned]] = await db.query(
        `SELECT COALESCE(SUM(points),0) AS c FROM reward_transactions
         WHERE dealer_id = ? AND transaction_type = 'credit' AND status = 'approved'`,
        [dealerId]
    );

    return {
        total_sales: sales.c,
        warranty_activated: warranty.c,
        replacement_requests: replacement.c,
        reward_points_earned: rewardEarned.c
    };
};

function buildDateRangeClause(column, fromDate, toDate, whereClauses, params){
    if (fromDate) { whereClauses.push(`${column} >= ?`); params.push(fromDate); }
    if (toDate)   { whereClauses.push(`${column} <= ?`); params.push(toDate); }
}

exports.getDealerSalesReport = async (dealerId, { fromDate, toDate, search }) => {
    const whereClauses = ["dp.dealer_id = ?"];
    const params = [dealerId];

    buildDateRangeClause("dp.dispatch_date", fromDate, toDate, whereClauses, params);

    if (search) {
        whereClauses.push("(dp.invoice_number LIKE ? OR inv.serial_number LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await db.query(`
        SELECT dp.invoice_number, dp.dispatch_date, inv.serial_number,
               p.product_name, p.model_name, dp.transport_name, dp.status
        FROM dispatch_items di
        JOIN dispatch dp ON di.dispatch_id = dp.dispatch_id
        JOIN inventory inv ON di.inventory_id = inv.inventory_id
        JOIN products p ON inv.product_id = p.product_id
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY dp.dispatch_date DESC
        LIMIT 200
    `, params);

    return rows;
};

exports.getDealerWarrantyReport = async (dealerId, { fromDate, toDate, search }) => {
    const whereClauses = ["w.dealer_id = ?"];
    const params = [dealerId];

    buildDateRangeClause("w.activation_date", fromDate, toDate, whereClauses, params);

    if (search) {
        whereClauses.push("(inv.serial_number LIKE ? OR w.customer_name LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await db.query(`
        SELECT w.warranty_id, inv.serial_number, w.customer_name,
               w.activation_date, w.expiry_date, w.status
        FROM warranty w
        JOIN inventory inv ON w.inventory_id = inv.inventory_id
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY w.activation_date DESC
        LIMIT 200
    `, params);

    return rows;
};

exports.getDealerReplacementReport = async (dealerId, { fromDate, toDate, search }) => {
    const whereClauses = ["r.dealer_id = ?"];
    const params = [dealerId];

    buildDateRangeClause("DATE(r.created_at)", fromDate, toDate, whereClauses, params);

    if (search) {
        whereClauses.push("(oldInv.serial_number LIKE ? OR newInv.serial_number LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await db.query(`
        SELECT r.replacement_id, oldInv.serial_number AS old_serial_number,
               newInv.serial_number AS new_serial_number,
               r.created_at, r.status
        FROM replacements r
        JOIN inventory oldInv ON r.old_inventory_id = oldInv.inventory_id
        LEFT JOIN inventory newInv ON r.new_inventory_id = newInv.inventory_id
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY r.created_at DESC
        LIMIT 200
    `, params);

    return rows;
};

exports.getDealerRewardReport = async (dealerId, { fromDate, toDate, search }) => {
    const whereClauses = ["rt.dealer_id = ?"];
    const params = [dealerId];

    buildDateRangeClause("rt.transaction_date", fromDate, toDate, whereClauses, params);

    if (search) {
        whereClauses.push("(rt.remarks LIKE ? OR inv.serial_number LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
    }

    // reward_transactions.reference_id is polymorphic (points at a warranty_id,
    // dispatch_id, etc depending on reference_type) -- best-effort join to a
    // battery serial only when we know the reference is a warranty row.
    const [rows] = await db.query(`
        SELECT rt.transaction_id, rt.transaction_date, rt.transaction_type,
               rt.reference_type, rt.remarks, rt.points, rt.status,
               inv.serial_number
        FROM reward_transactions rt
        LEFT JOIN warranty w ON rt.reference_type = 'warranty' AND rt.reference_id = w.warranty_id
        LEFT JOIN inventory inv ON w.inventory_id = inv.inventory_id
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY rt.transaction_date DESC
        LIMIT 200
    `, params);

    return rows;
};