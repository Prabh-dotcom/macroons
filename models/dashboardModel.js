// models/dashboardModel.js
const db = require("../config/db");

exports.getKPIs = async () => {
    const [[totalInventory]] = await db.query("SELECT COUNT(*) AS c FROM inventory");
    const [[newInventoryThisMonth]] = await db.query(
        "SELECT COUNT(*) AS c FROM inventory WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())"
    );
    const [[monthlyDispatch]] = await db.query(
        "SELECT COUNT(*) AS c FROM dispatch WHERE MONTH(dispatch_date) = MONTH(CURDATE()) AND YEAR(dispatch_date) = YEAR(CURDATE())"
    );
    // Pichhle mahine ka dispatch count -- "+X% Growth" caption ke liye
    const [[lastMonthDispatch]] = await db.query(
        `SELECT COUNT(*) AS c FROM dispatch
         WHERE MONTH(dispatch_date) = MONTH(CURDATE() - INTERVAL 1 MONTH)
         AND YEAR(dispatch_date) = YEAR(CURDATE() - INTERVAL 1 MONTH)`
    );
    const [[activeWarranty]] = await db.query("SELECT COUNT(*) AS c FROM warranty WHERE status = 'active'");
    const [[totalWarranty]] = await db.query("SELECT COUNT(*) AS c FROM warranty");
    const [[registeredDealers]] = await db.query("SELECT COUNT(*) AS c FROM dealers");
    const [[newDealersThisMonth]] = await db.query(
        "SELECT COUNT(*) AS c FROM dealers WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())"
    );

    const activePercent = totalWarranty.c > 0 ? Math.round((activeWarranty.c / totalWarranty.c) * 100) : 0;
    // Agar pichhle mahine 0 dispatch the aur is mahine kuch bhi hua to
    // growth 100% dikhate hain (0 se divide avoid karne ke liye); agar
    // dono hi 0 hain to 0% (no change).
    const dispatchGrowthPercent = lastMonthDispatch.c > 0
        ? Math.round(((monthlyDispatch.c - lastMonthDispatch.c) / lastMonthDispatch.c) * 100)
        : (monthlyDispatch.c > 0 ? 100 : 0);

    return {
        total_inventory: totalInventory.c,
        new_inventory_this_month: newInventoryThisMonth.c,
        monthly_dispatch: monthlyDispatch.c,
        dispatch_growth_percent: dispatchGrowthPercent,
        active_warranty: activeWarranty.c,
        active_warranty_percent: activePercent,
        registered_dealers: registeredDealers.c,
        new_dealers_this_month: newDealersThisMonth.c
    };
};

exports.getAlerts = async () => {
    const [[expiring30]] = await db.query(
        "SELECT COUNT(*) AS c FROM warranty WHERE status = 'active' AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)"
    );
    const [[expired]] = await db.query(
        "SELECT COUNT(*) AS c FROM warranty WHERE status = 'active' AND expiry_date < CURDATE()"
    );
    const [[replacementPending]] = await db.query("SELECT COUNT(*) AS c FROM replacements WHERE status = 'pending'");

    // Low stock: products jinke "in_stock" items 5 se kam hain
    const [[lowStock]] = await db.query(`
        SELECT COUNT(*) AS c FROM (
            SELECT p.product_id
            FROM products p
            LEFT JOIN inventory inv ON inv.product_id = p.product_id AND inv.status = 'in_stock'
            GROUP BY p.product_id
            HAVING COUNT(inv.inventory_id) < 5
        ) AS low
    `);

    return {
        warranty_expiring: expiring30.c,
        warranty_expired: expired.c,
        replacement_pending: replacementPending.c,
        low_stock_items: lowStock.c
    };
};

exports.getRecentDispatch = async () => {
    const [rows] = await db.query(`
        SELECT inv.serial_number, dl.dealer_name, dp.status
        FROM dispatch dp
        JOIN dispatch_items di ON di.dispatch_id = dp.dispatch_id
        JOIN inventory inv ON di.inventory_id = inv.inventory_id
        JOIN dealers dl ON dp.dealer_id = dl.dealer_id
        ORDER BY dp.created_at DESC
        LIMIT 4
    `);
    return rows;
};

exports.getRecentWarranty = async () => {
    const [rows] = await db.query(`
        SELECT w.customer_name, inv.serial_number, w.status
        FROM warranty w
        JOIN inventory inv ON w.inventory_id = inv.inventory_id
        ORDER BY w.created_at DESC
        LIMIT 4
    `);
    return rows;
};

exports.getTopDealers = async () => {
    const [rows] = await db.query(`
        SELECT dl.dealer_name,
               COUNT(DISTINCT dp.dispatch_id) AS dispatch_count,
               COALESCE(rb.current_balance, 0) AS reward_balance
        FROM dealers dl
        LEFT JOIN dispatch dp ON dp.dealer_id = dl.dealer_id
        LEFT JOIN dealer_reward_balance rb ON rb.dealer_id = dl.dealer_id
        GROUP BY dl.dealer_id
        ORDER BY dispatch_count DESC
        LIMIT 5
    `);
    return rows.map(r => ({
        ...r,
        performance: r.dispatch_count >= 100 ? "Excellent" : r.dispatch_count >= 30 ? "Good" : "Average"
    }));
};

exports.getRewardSummary = async () => {
    const [[totalRewards]] = await db.query(
        "SELECT COALESCE(SUM(points),0) AS c FROM reward_transactions WHERE transaction_type = 'credit' AND status = 'approved'"
    );
    const [[thisMonth]] = await db.query(
        `SELECT COALESCE(SUM(points),0) AS c FROM reward_transactions
         WHERE transaction_type = 'credit' AND status = 'approved'
         AND MONTH(transaction_date) = MONTH(CURDATE()) AND YEAR(transaction_date) = YEAR(CURDATE())`
    );
    const [[redeemed]] = await db.query(
        "SELECT COALESCE(SUM(points),0) AS c FROM reward_transactions WHERE transaction_type = 'debit' AND status = 'approved'"
    );
    const [[pending]] = await db.query(
        "SELECT COALESCE(SUM(points),0) AS c FROM reward_transactions WHERE status = 'pending'"
    );

    return {
        total_rewards: totalRewards.c,
        this_month: thisMonth.c,
        redeemed: redeemed.c,
        pending: pending.c
    };
};

exports.getRecentActivity = async () => {
    const [rows] = await db.query(`
        (SELECT 'Inventory Added' AS label, created_at FROM inventory ORDER BY created_at DESC LIMIT 3)
        UNION ALL
        (SELECT 'Battery Dispatched', created_at FROM dispatch ORDER BY created_at DESC LIMIT 3)
        UNION ALL
        (SELECT 'Warranty Activated', created_at FROM warranty ORDER BY created_at DESC LIMIT 3)
        UNION ALL
        (SELECT 'Replacement Requested', created_at FROM replacements ORDER BY created_at DESC LIMIT 3)
        UNION ALL
        (SELECT 'New Dealer Registered', created_at FROM dealers ORDER BY created_at DESC LIMIT 3)
        ORDER BY created_at DESC
        LIMIT 6
    `);
    return rows;
};

exports.quickSearch = async (term) => {
    const like = `%${term}%`;

    const [inventoryMatches] = await db.query(
        `SELECT 'inventory' AS type, serial_number AS label, inventory_id AS id
         FROM inventory WHERE serial_number LIKE ? LIMIT 5`,
        [like]
    );
    const [dealerMatches] = await db.query(
        `SELECT 'dealer' AS type, dealer_name AS label, dealer_id AS id
         FROM dealers WHERE dealer_name LIKE ? OR dealer_code LIKE ? LIMIT 5`,
        [like, like]
    );
    const [customerMatches] = await db.query(
        `SELECT 'warranty' AS type, CONCAT(customer_name, ' (', customer_phone, ')') AS label, warranty_id AS id
         FROM warranty WHERE customer_name LIKE ? LIMIT 5`,
        [like]
    );

    return [...inventoryMatches, ...dealerMatches, ...customerMatches];
};