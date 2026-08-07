// models/rewardModel.js
//
// Reward Wallet ke saare SQL queries yahan hain. Balance kabhi bhi
// column me store nahi hota (schema.sql me dealer_reward_balance VIEW
// already bana hua hai) -- hamesha SUM(credit) - SUM(debit) se derive
// karte hain jahan status = 'approved'. Isse balance kabhi out-of-sync
// nahi hota, chahe transactions kitni bhi ho jayein.

const db = require("../config/db");

/* =========================================================
   GLOBAL STATS -- admin dashboard ke 4 cards ke liye
   (Total Reward Points, Available Points, Redeemed Points, Pending Requests)
========================================================= */
exports.getGlobalStats = async () => {
    const [[totals]] = await db.query(`
        SELECT
            COALESCE(SUM(CASE WHEN transaction_type = 'credit' AND status = 'approved' THEN points ELSE 0 END), 0) AS total_credited,
            COALESCE(SUM(CASE WHEN transaction_type = 'debit' AND status = 'approved' THEN points ELSE 0 END), 0) AS total_debited,
            COALESCE(SUM(CASE WHEN transaction_type = 'debit' AND reference_type = 'redemption' AND status = 'approved' THEN points ELSE 0 END), 0) AS total_redeemed,
            COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_requests
        FROM reward_transactions
    `);

    return {
        total_reward_points: Number(totals.total_credited),
        available_points: Number(totals.total_credited) - Number(totals.total_debited),
        redeemed_points: Number(totals.total_redeemed),
        pending_requests: Number(totals.pending_requests)
    };
};

/* =========================================================
   SINGLE DEALER WALLET SUMMARY -- "Dealer Reward Search" +
   "Wallet Summary" section ke liye
========================================================= */
exports.getDealerWallet = async (dealerId) => {
    const [[dealer]] = await db.query(
        `SELECT dealer_id, dealer_code, dealer_name, phone, email, city, state,
                dealer_status, reward_eligible
         FROM dealers WHERE dealer_id = ?`,
        [dealerId]
    );

    if (!dealer) return null;

    const [[summary]] = await db.query(
        `SELECT
            COALESCE(SUM(CASE WHEN transaction_type = 'credit' AND status = 'approved' THEN points ELSE 0 END), 0) AS lifetime_points,
            COALESCE(SUM(CASE WHEN transaction_type = 'debit' AND status = 'approved' THEN points ELSE 0 END), 0) AS lifetime_debited,
            COALESCE(SUM(CASE WHEN transaction_type = 'debit' AND reference_type = 'redemption' AND status = 'approved' THEN points ELSE 0 END), 0) AS redeemed_points
         FROM reward_transactions WHERE dealer_id = ?`,
        [dealerId]
    );

    const lifetime_points = Number(summary.lifetime_points);
    const current_points = lifetime_points - Number(summary.lifetime_debited);

    return {
        ...dealer,
        current_points,
        lifetime_points,
        redeemed_points: Number(summary.redeemed_points),
        available_balance: current_points
    };
};

// Dealer search for the reward-wallet search box (by code or name, partial + case-insensitive)
exports.searchDealers = async (search) => {
    const likeSearch = `%${search}%`;
    const [rows] = await db.query(
        `SELECT dealer_id, dealer_code, dealer_name, phone, city, dealer_status
         FROM dealers
         WHERE dealer_code LIKE ? OR dealer_name LIKE ?
         ORDER BY dealer_name ASC
         LIMIT 20`,
        [likeSearch, likeSearch]
    );
    return rows;
};

/* =========================================================
   TRANSACTIONS -- list with running balance, search, filter, pagination
========================================================= */
exports.getTransactions = async ({ dealer_id, search, status, dateFrom, dateTo, page = 1, limit = 10 }) => {
    let whereClauses = [];
    let params = [];

    if (dealer_id) {
        whereClauses.push("rt.dealer_id = ?");
        params.push(dealer_id);
    }

    if (status) {
        whereClauses.push("rt.status = ?");
        params.push(status);
    }

    if (dateFrom) {
        whereClauses.push("rt.transaction_date >= ?");
        params.push(dateFrom);
    }

    if (dateTo) {
        whereClauses.push("rt.transaction_date <= ?");
        params.push(dateTo);
    }

    if (search) {
        whereClauses.push("(d.dealer_name LIKE ? OR d.dealer_code LIKE ? OR rt.reference_type LIKE ? OR rt.reference_id LIKE ? OR rt.remarks LIKE ?)");
        const likeSearch = `%${search}%`;
        params.push(likeSearch, likeSearch, likeSearch, likeSearch, likeSearch);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const offset = (Math.max(1, page) - 1) * limit;

    // Running balance per dealer, computed with a window function so the
    // "Balance" column always reflects points up to that row -- never
    // stored, always derived (same principle as the dealer_reward_balance VIEW).
    const dataQuery = `
        SELECT
            rt.transaction_id, rt.dealer_id, rt.transaction_date, rt.transaction_type,
            rt.reference_type, rt.reference_id, rt.points, rt.remarks, rt.status,
            rt.created_at, d.dealer_name, d.dealer_code,
            SUM(CASE WHEN rt.status = 'approved' THEN
                    (CASE WHEN rt.transaction_type = 'credit' THEN rt.points ELSE -rt.points END)
                ELSE 0 END)
                OVER (PARTITION BY rt.dealer_id ORDER BY rt.transaction_date, rt.transaction_id
                      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance
        FROM reward_transactions rt
        JOIN dealers d ON d.dealer_id = rt.dealer_id
        ${whereSql}
        ORDER BY rt.transaction_date DESC, rt.transaction_id DESC
        LIMIT ? OFFSET ?
    `;

    const countQuery = `
        SELECT COUNT(*) AS total
        FROM reward_transactions rt
        JOIN dealers d ON d.dealer_id = rt.dealer_id
        ${whereSql}
    `;

    const [rows] = await db.query(dataQuery, [...params, Number(limit), Number(offset)]);
    const [countResult] = await db.query(countQuery, params);

    return {
        transactions: rows,
        pagination: {
            total: countResult[0].total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(countResult[0].total / limit)
        }
    };
};

exports.getTransactionById = async (transactionId) => {
    const [rows] = await db.query(
        `SELECT rt.*, d.dealer_name, d.dealer_code
         FROM reward_transactions rt
         JOIN dealers d ON d.dealer_id = rt.dealer_id
         WHERE rt.transaction_id = ?`,
        [transactionId]
    );
    return rows[0] || null;
};

exports.dealerExists = async (dealerId) => {
    const [rows] = await db.query("SELECT dealer_id FROM dealers WHERE dealer_id = ?", [dealerId]);
    return rows.length > 0;
};

// Current approved balance for one dealer -- used to block a debit that would go negative
exports.getCurrentBalance = async (dealerId) => {
    const [rows] = await db.query(
        `SELECT COALESCE(SUM(CASE WHEN transaction_type = 'credit' THEN points ELSE -points END), 0) AS balance
         FROM reward_transactions WHERE dealer_id = ? AND status = 'approved'`,
        [dealerId]
    );
    return Number(rows[0].balance);
};

exports.createTransaction = async (txn) => {
    const [result] = await db.query(
        `INSERT INTO reward_transactions
            (dealer_id, transaction_date, transaction_type, reference_type, reference_id,
             points, remarks, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            txn.dealer_id, txn.transaction_date, txn.transaction_type,
            txn.reference_type || null, txn.reference_id || null,
            txn.points, txn.remarks || null, txn.status || "approved",
            txn.created_by || null
        ]
    );
    return result.insertId;
};

exports.updateTransaction = async (transactionId, txn) => {
    const [result] = await db.query(
        `UPDATE reward_transactions SET
            transaction_date = ?, transaction_type = ?, reference_type = ?, reference_id = ?,
            points = ?, remarks = ?, status = ?
         WHERE transaction_id = ?`,
        [
            txn.transaction_date, txn.transaction_type, txn.reference_type || null,
            txn.reference_id || null, txn.points, txn.remarks || null, txn.status,
            transactionId
        ]
    );
    return result.affectedRows > 0;
};

exports.setStatus = async (transactionId, status) => {
    const [result] = await db.query(
        "UPDATE reward_transactions SET status = ? WHERE transaction_id = ?",
        [status, transactionId]
    );
    return result.affectedRows > 0;
};

/* =========================================================
   DEALER SELF-SERVICE (dealer portal login)
========================================================= */
exports.getMyMonthlyStats = async (dealerId) => {
    const [[row]] = await db.query(
        `SELECT
            COALESCE(SUM(CASE WHEN transaction_type = 'credit' AND status = 'approved'
                AND MONTH(transaction_date) = MONTH(CURDATE()) AND YEAR(transaction_date) = YEAR(CURDATE())
                THEN points ELSE 0 END), 0) AS this_month_earned,
            COALESCE(SUM(CASE WHEN transaction_type = 'debit' AND status = 'approved'
                AND MONTH(transaction_date) = MONTH(CURDATE()) AND YEAR(transaction_date) = YEAR(CURDATE())
                THEN points ELSE 0 END), 0) AS this_month_redeemed,
            COALESCE(SUM(CASE WHEN reference_type = 'warranty' AND status = 'approved'
                AND MONTH(transaction_date) = MONTH(CURDATE()) AND YEAR(transaction_date) = YEAR(CURDATE())
                THEN 1 ELSE 0 END), 0) AS this_month_warranty_count
         FROM reward_transactions WHERE dealer_id = ?`,
        [dealerId]
    );
    return {
        this_month_earned: Number(row.this_month_earned),
        this_month_redeemed: Number(row.this_month_redeemed),
        this_month_warranty_count: Number(row.this_month_warranty_count)
    };
};
