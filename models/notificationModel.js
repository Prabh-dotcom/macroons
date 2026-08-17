// models/notificationModel.js
//
// Simple in-app notification system. Jab dealer koi replacement request
// submit karta hai to yahan ek "admin" audience wali row ban jaati hai --
// admin panel ka bell icon isse poll karke dikhata hai. Aage chal ke
// isi table se email/SMS bhi trigger kiya ja sakta hai (create() ke
// andar ek hook jagah chhodi hai, neeche note dekho).

const db = require("../config/db");

exports.create = async ({ audience, dealer_id = null, title, message = null, link = null }) => {
    const [result] = await db.query(
        `INSERT INTO notifications (audience, dealer_id, title, message, link)
         VALUES (?, ?, ?, ?, ?)`,
        [audience, dealer_id, title, message, link]
    );

    // ---------------------------------------------------------------
    // FUTURE: Agar kabhi real email/SMS bhejna ho (e.g. admin ko turant
    // mail chahiye, na ki sirf in-app), to yahan hook laga sakte ho:
    //
    //   await sendEmail({ to: adminEmail, subject: title, text: message });
    //   await sendSms({ to: adminPhone, text: `${title}: ${message}` });
    //
    // Filhaal koi email/SMS provider (SMTP / Twilio / MSG91 etc.)
    // configured nahi hai isliye in-app notification hi sabse simple
    // aur turant-kaam-karne-wala tareeka hai.
    // ---------------------------------------------------------------

    return result.insertId;
};

exports.getForUser = async ({ role, dealerId, unreadOnly = false, limit = 20 }) => {
    let where, params;

    if (role === "dealer") {
        where = "audience = 'dealer' AND dealer_id = ?";
        params = [dealerId];
    } else {
        where = "audience = 'admin'";
        params = [];
    }

    if (unreadOnly) where += " AND is_read = 0";

    const [rows] = await db.query(
        `SELECT notification_id, title, message, link, is_read, created_at
         FROM notifications
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT ?`,
        [...params, Number(limit)]
    );
    return rows;
};

exports.getUnreadCount = async ({ role, dealerId }) => {
    let where, params;

    if (role === "dealer") {
        where = "audience = 'dealer' AND dealer_id = ? AND is_read = 0";
        params = [dealerId];
    } else {
        where = "audience = 'admin' AND is_read = 0";
        params = [];
    }

    const [[row]] = await db.query(`SELECT COUNT(*) AS c FROM notifications WHERE ${where}`, params);
    return row.c;
};

exports.markRead = async (notificationId) => {
    const [result] = await db.query(
        "UPDATE notifications SET is_read = 1 WHERE notification_id = ?",
        [notificationId]
    );
    return result.affectedRows > 0;
};

exports.markAllRead = async ({ role, dealerId }) => {
    if (role === "dealer") {
        await db.query(
            "UPDATE notifications SET is_read = 1 WHERE audience = 'dealer' AND dealer_id = ?",
            [dealerId]
        );
    } else {
        await db.query("UPDATE notifications SET is_read = 1 WHERE audience = 'admin'");
    }
};