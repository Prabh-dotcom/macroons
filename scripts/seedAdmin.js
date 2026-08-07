// scripts/seedAdmin.js
//
// Database khaali hai to koi bhi login nahi kar payega — ise ek baar
// chalao taaki pehla admin user ban jaye.
//
// RUN:  node scripts/seedAdmin.js
//
// Chalane ke baad neeche diye email/password se /api/auth/login
// pe login kar sakte ho. Baad me settings.html se naye staff users
// add karne ka proper CRUD banayenge — yeh sirf bootstrap ke liye hai.

const bcrypt = require("bcrypt");
const db = require("../config/db");

const ADMIN_EMAIL = "admin@batteryerp.com";
const ADMIN_PASSWORD = "Admin@123";   // change after first login!

(async () => {
    try {
        const [existing] = await db.query("SELECT user_id FROM users WHERE email = ?", [ADMIN_EMAIL]);

        if (existing.length > 0) {
            console.log("ℹ️  Admin user already exists:", ADMIN_EMAIL);
            process.exit(0);
        }

        const password_hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

        await db.query(
            `INSERT INTO users (full_name, email, mobile, password_hash, role, status)
             VALUES (?, ?, ?, ?, 'super_admin', 'active')`,
            ["Super Admin", ADMIN_EMAIL, "9999999999", password_hash]
        );

        console.log("✅ Admin user created!");
        console.log("   Email:   ", ADMIN_EMAIL);
        console.log("   Password:", ADMIN_PASSWORD);
        console.log("   ⚠️  Please log in and change this password.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Failed to seed admin:", err.message);
        process.exit(1);
    }
})();
