// models/settingsModel.js
//
// System settings ek simple key-value table mein store hote hain
// (system_settings). Har setting ek row -- isse naya setting add
// karna kabhi bhi easy rehta hai, koi ALTER TABLE nahi chahiye.

const db = require("../config/db");

// Poori settings table ek object ke roop mein -- { key: value, key: value, ... }
exports.getAll = async () => {
    const [rows] = await db.query("SELECT setting_key, setting_value FROM system_settings");
    const settings = {};
    rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
    return settings;
};

// Ek single setting -- fallback diya to woh milega agar DB mein row nahi hai
exports.getByKey = async (key, fallback = null) => {
    const [rows] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key = ?", [key]);
    return rows.length ? rows[0].setting_value : fallback;
};

// Multiple settings ek saath update -- INSERT ... ON DUPLICATE KEY UPDATE
// isliye agar row pehle se nahi hai to bhi apne aap ban jaati hai.
exports.updateMany = async (pairs) => {
    const entries = Object.entries(pairs).filter(([, v]) => v !== undefined && v !== null);
    if (entries.length === 0) return;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        for (const [key, value] of entries) {
            await connection.query(
                `INSERT INTO system_settings (setting_key, setting_value)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
                [key, String(value)]
            );
        }
        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};