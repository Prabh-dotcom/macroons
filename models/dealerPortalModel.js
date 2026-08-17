// models/dealerPortalModel.js
//
// Dealer login karne ke baad usko sirf APNA data dikhna chahiye --
// koi bhi query yahan hamesha "WHERE dealer_id = ?" ke saath filtered
// hai (dealer_id JWT token se aata hai, dealer khud nahi bhej sakta,
// isliye woh doosre dealer ka data kabhi nahi dekh sakta).

const db = require("../config/db");

exports.getDealerInfo = async (dealerId) => {
    const [rows] = await db.query(
        "SELECT dealer_name, dealer_code, city, state FROM dealers WHERE dealer_id = ?",
        [dealerId]
    );
    return rows[0] || null;
};

/* =========================================================
   PROFILE PAGE (dealer-profile.html)
========================================================= */

exports.getFullProfile = async (dealerId) => {
    const [rows] = await db.query(
        `SELECT dealer_id, dealer_code, login_id, dealer_name, contact_person,
                phone, email, address_line, city, district, state, pincode,
                gst_number, photo_path, dealer_status, reward_eligible, created_at
         FROM dealers WHERE dealer_id = ?`,
        [dealerId]
    );
    return rows[0] || null;
};

exports.getPhotoPath = async (dealerId) => {
    const [rows] = await db.query("SELECT photo_path FROM dealers WHERE dealer_id = ?", [dealerId]);
    return rows[0] ? rows[0].photo_path : null;
};

exports.updatePhoto = async (dealerId, photoPath) => {
    await db.query("UPDATE dealers SET photo_path = ? WHERE dealer_id = ?", [photoPath, dealerId]);
};

exports.emailExists = async (email, excludeDealerId) => {
    const [rows] = await db.query(
        "SELECT dealer_id FROM dealers WHERE email = ? AND dealer_id != ?",
        [email, excludeDealerId]
    );
    return rows.length > 0;
};

// Dealer khud sirf apni contact/business details edit kar sakta hai --
// dealer_code, login_id, dealer_status, reward_eligible admin-only hain.
exports.updateProfile = async (dealerId, data) => {
    const [result] = await db.query(
        `UPDATE dealers SET
            dealer_name = ?, contact_person = ?, phone = ?, email = ?,
            address_line = ?, city = ?, district = ?, state = ?,
            pincode = ?, gst_number = ?
         WHERE dealer_id = ?`,
        [
            data.dealer_name, data.contact_person || null, data.phone,
            data.email || null, data.address_line || null, data.city || null,
            data.district || null, data.state || null, data.pincode || null,
            data.gst_number || null, dealerId
        ]
    );
    return result.affectedRows > 0;
};

exports.getPasswordHash = async (dealerId) => {
    const [rows] = await db.query(
        "SELECT password_hash FROM dealers WHERE dealer_id = ?",
        [dealerId]
    );
    return rows[0] || null;
};

exports.updatePassword = async (dealerId, password_hash) => {
    const [result] = await db.query(
        "UPDATE dealers SET password_hash = ? WHERE dealer_id = ?",
        [password_hash, dealerId]
    );
    return result.affectedRows > 0;
};

exports.getDashboardStats = async (dealerId) => {
    const [[dispatched]] = await db.query(
        `SELECT COUNT(*) AS c FROM dispatch_items di
         JOIN dispatch dp ON di.dispatch_id = dp.dispatch_id
         WHERE dp.dealer_id = ?`,
        [dealerId]
    );
    const [[warrantied]] = await db.query(
        "SELECT COUNT(*) AS c FROM warranty WHERE dealer_id = ?",
        [dealerId]
    );
    const [[activeWarranty]] = await db.query(
        "SELECT COUNT(*) AS c FROM warranty WHERE dealer_id = ? AND status = 'active'",
        [dealerId]
    );
    const [[rewardBalance]] = await db.query(
        "SELECT COALESCE((SELECT current_balance FROM dealer_reward_balance WHERE dealer_id = ?), 0) AS c",
        [dealerId]
    );
    const [[pendingReplacement]] = await db.query(
        "SELECT COUNT(*) AS c FROM replacements WHERE dealer_id = ? AND status = 'pending'",
        [dealerId]
    );
    const [[expiringSoon]] = await db.query(
        `SELECT COUNT(*) AS c FROM warranty
         WHERE dealer_id = ? AND status = 'active'
         AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`,
        [dealerId]
    );
    const [[expired]] = await db.query(
        `SELECT COUNT(*) AS c FROM warranty
         WHERE dealer_id = ? AND status = 'active' AND expiry_date < CURDATE()`,
        [dealerId]
    );
    // Active Warranty card ke "+X This Month" caption ke liye -- is mahine
    // ban chuki active warranties ka asli count (activation_date is month).
    const [[warrantyThisMonth]] = await db.query(
        `SELECT COUNT(*) AS c FROM warranty
         WHERE dealer_id = ? AND status = 'active'
         AND YEAR(activation_date) = YEAR(CURDATE()) AND MONTH(activation_date) = MONTH(CURDATE())`,
        [dealerId]
    );

    return {
        available_stock: Math.max(0, dispatched.c - warrantied.c),
        active_warranty: activeWarranty.c,
        active_warranty_this_month: warrantyThisMonth.c,
        reward_wallet: rewardBalance.c,
        pending_replacement: pendingReplacement.c,
        warranty_expiring: expiringSoon.c,
        warranty_expired: expired.c
    };
};

exports.getRecentWarranty = async (dealerId) => {
    const [rows] = await db.query(
        `SELECT w.customer_name, inv.serial_number, w.activation_date, w.status
         FROM warranty w
         JOIN inventory inv ON w.inventory_id = inv.inventory_id
         WHERE w.dealer_id = ?
         ORDER BY w.created_at DESC
         LIMIT 4`,
        [dealerId]
    );
    return rows;
};

exports.getRecentReplacement = async (dealerId) => {
    const [rows] = await db.query(
        `SELECT r.replacement_id, oldInv.serial_number, r.created_at, r.status
         FROM replacements r
         JOIN inventory oldInv ON r.old_inventory_id = oldInv.inventory_id
         WHERE r.dealer_id = ?
         ORDER BY r.created_at DESC
         LIMIT 4`,
        [dealerId]
    );
    return rows;
};

/* =========================================================
   WARRANTY PAGE (dealer/dealer-warranty.html) -- 4 cards:
   Total Warranty, Today's Activation, Pending Verification,
   Reward Points. List itself is served by WarrantyModel.getAll
   with dealer_id filter (see dealerPortalController.js).
========================================================= */
exports.getWarrantyPageStats = async (dealerId) => {
    const [[row]] = await db.query(
        `SELECT
            COUNT(*) AS total_warranty,
            COALESCE(SUM(CASE WHEN activation_date = CURDATE() THEN 1 ELSE 0 END), 0) AS today_activation,
            COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_verification
         FROM warranty
         WHERE dealer_id = ?`,
        [dealerId]
    );
    const [[rewardBalance]] = await db.query(
        "SELECT COALESCE((SELECT current_balance FROM dealer_reward_balance WHERE dealer_id = ?), 0) AS c",
        [dealerId]
    );

    return {
        total_warranty: Number(row.total_warranty),
        today_activation: Number(row.today_activation),
        pending_verification: Number(row.pending_verification),
        reward_points: Number(rewardBalance.c)
    };
};

/* =========================================================
   DEALER DASHBOARD -- topbar search + Recent Activity timeline
========================================================= */

// Topbar search box ("Search Warranty ID / Serial No...") -- sirf isi
// dealer ke apne records (dealer_id se scoped) me match dhoondhta hai,
// admin ke quickSearch jaisa hi pattern (models/dashboardModel.js).
exports.quickSearch = async (dealerId, term) => {
    const like = `%${term}%`;

    const [inventoryMatches] = await db.query(
        `SELECT 'inventory' AS type, inv.serial_number AS label, inv.inventory_id AS id
         FROM inventory inv
         JOIN dispatch_items di ON di.inventory_id = inv.inventory_id
         JOIN dispatch dp ON dp.dispatch_id = di.dispatch_id
         WHERE dp.dealer_id = ? AND inv.serial_number LIKE ?
         LIMIT 5`,
        [dealerId, like]
    );
    const [warrantyMatches] = await db.query(
        `SELECT 'warranty' AS type, CONCAT(w.customer_name, ' (', inv.serial_number, ')') AS label, w.warranty_id AS id
         FROM warranty w
         JOIN inventory inv ON w.inventory_id = inv.inventory_id
         WHERE w.dealer_id = ? AND (w.customer_name LIKE ? OR inv.serial_number LIKE ?)
         LIMIT 5`,
        [dealerId, like, like]
    );
    const [replacementMatches] = await db.query(
        `SELECT 'replacement' AS type, CONCAT('Replacement REP', LPAD(r.replacement_id, 4, '0'), ' - ', oldInv.serial_number) AS label, r.replacement_id AS id
         FROM replacements r
         JOIN inventory oldInv ON r.old_inventory_id = oldInv.inventory_id
         WHERE r.dealer_id = ? AND oldInv.serial_number LIKE ?
         LIMIT 5`,
        [dealerId, like]
    );

    return [...warrantyMatches, ...inventoryMatches, ...replacementMatches];
};

// Recent Activity timeline -- warranty activation, reward credit,
// replacement request aur naya stock dispatch, sab real tables se,
// merge karke date ke hisaab se sort kiya hua.
exports.getRecentActivity = async (dealerId, limit = 6) => {
    const [warrantyRows] = await db.query(
        `SELECT w.activation_date AS event_date, inv.serial_number
         FROM warranty w
         JOIN inventory inv ON w.inventory_id = inv.inventory_id
         WHERE w.dealer_id = ?
         ORDER BY w.created_at DESC LIMIT ?`,
        [dealerId, limit]
    );
    const [replacementRows] = await db.query(
        `SELECT replacement_id, created_at AS event_date
         FROM replacements
         WHERE dealer_id = ?
         ORDER BY created_at DESC LIMIT ?`,
        [dealerId, limit]
    );
    const [rewardRows] = await db.query(
        `SELECT transaction_date AS event_date, points
         FROM reward_transactions
         WHERE dealer_id = ? AND transaction_type = 'credit' AND status = 'approved'
         ORDER BY transaction_date DESC LIMIT ?`,
        [dealerId, limit]
    );
    const [dispatchRows] = await db.query(
        `SELECT dp.dispatch_date AS event_date, COUNT(di.inventory_id) AS item_count
         FROM dispatch dp
         JOIN dispatch_items di ON di.dispatch_id = dp.dispatch_id
         WHERE dp.dealer_id = ?
         GROUP BY dp.dispatch_id, dp.dispatch_date
         ORDER BY dp.dispatch_date DESC LIMIT ?`,
        [dealerId, limit]
    );

    const activity = [
        ...warrantyRows.map(r => ({
            icon: "🛡", title: "Warranty Activated",
            subtitle: `Serial No. ${r.serial_number}`, event_date: r.event_date
        })),
        ...replacementRows.map(r => ({
            icon: "🔄", title: "Replacement Request Submitted",
            subtitle: `Request ID : REP${String(r.replacement_id).padStart(4, "0")}`, event_date: r.event_date
        })),
        ...rewardRows.map(r => ({
            icon: "🎁", title: "Reward Credited",
            subtitle: `${r.points} Points Added`, event_date: r.event_date
        })),
        ...dispatchRows.map(r => ({
            icon: "📦", title: "New Stock Received",
            subtitle: `${r.item_count} Batteries Added`, event_date: r.event_date
        }))
    ];

    activity.sort((a, b) => new Date(b.event_date) - new Date(a.event_date));
    return activity.slice(0, limit);
};