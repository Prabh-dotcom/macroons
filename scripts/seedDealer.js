// scripts/seedDealer.js
//
// Ek test dealer banata hai taaki tum turant "Dealer Login" test kar sako,
// bina Admin panel se manually form bhare. Chalane ke baad neeche diye
// Login ID / Password se Dealer Login kar sakte ho.
//
// RUN:  node scripts/seedDealer.js

const bcrypt = require("bcrypt");
const db = require("../config/db");

const LOGIN_ID = "dealer001";
const PASSWORD = "Dealer@123";

(async () => {
    try {
        const [existing] = await db.query("SELECT dealer_id FROM dealers WHERE login_id = ?", [LOGIN_ID]);

        if (existing.length > 0) {
            console.log("ℹ️  Test dealer already exists:", LOGIN_ID);
            process.exit(0);
        }

        const password_hash = await bcrypt.hash(PASSWORD, 10);

        await db.query(
            `INSERT INTO dealers
                (dealer_code, login_id, password_hash, dealer_name, phone, city, state, dealer_status, reward_eligible)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1)`,
            ["DLR9999", LOGIN_ID, password_hash, "Test Dealer (Sharma Battery House)", "9876543210", "Mumbai", "Maharashtra"]
        );

        console.log("✅ Test dealer created!");
        console.log("   Login ID: ", LOGIN_ID);
        console.log("   Password: ", PASSWORD);
        console.log("   ⚠️  Yeh sirf testing ke liye hai, production me delete kar dena.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Failed to seed dealer:", err.message);
        process.exit(1);
    }
})();