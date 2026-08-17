// config/db.js
//
// PEHLE: db.js ek single mysql.createConnection() use kar raha tha.
// PROBLEM: Jab 2 requests same time pe aati hain, dusri request pehli
// ke finish hone ka wait karti hai — production me yeh site ko slow/hang
// kar deta hai.
//
// FIX: Connection POOL use kar rahe hain. Pool matlab 10 connections
// ka ek group ready rehta hai, jo bhi request aaye usse free connection
// mil jaata hai. Humne ".promise()" bhi laga diya hai taaki controllers
// me async/await use kar sakein, callback hell na ho.

const mysql = require("mysql2");
require("dotenv").config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,   // default 3306, override via .env agar alag port ho (jaise 3307)
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,   // ek time pe max 10 parallel DB connections
    queueLimit: 0,
    // IMPORTANT: DATE/DATETIME columns ko plain string ("2026-08-15") ke
    // roop me rakho, JS Date object mat banao. Warna Node timezone (IST)
    // aur JSON serialization (UTC) ke beech conversion se date 1 din
    // aage-peeche ho jaati hai (jaise dispatch_date 15 Aug frontend pe
    // 14 Aug dikhne lagta hai) -- yeh poore app ki saari dates fix karta hai.
    dateStrings: true
});

const promisePool = pool.promise();

// Startup pe ek baar test karke confirm karte hain ki DB reachable hai.
promisePool.query("SELECT 1")
    .then(() => console.log("✅ MySQL Pool Connected Successfully"))
    .catch((err) => {
        console.log("❌ Database Connection Failed");
        console.log(err.message);
    });

module.exports = promisePool;