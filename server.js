const express = require("express");
const cors = require("cors");
require("dotenv").config();

const db = require("./config/db"); // just importing runs the pool connection test

const authRoutes = require("./routes/authRoutes");
const dealerRoutes = require("./routes/dealerRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const dispatchRoutes = require("./routes/dispatchRoutes");
const warrantyRoutes = require("./routes/warrantyRoutes");
const replacementRoutes = require("./routes/replacementRoutes");
const rewardRoutes = require("./routes/rewardRoutes");
const reportRoutes = require("./routes/reportRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");


const errorHandler = require("./middlewares/errorHandler");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static("uploads"));
app.use("/public", express.static("public"));


// Serve the existing static frontend (admin + dealer HTML/CSS/JS pages).
// Ab http://localhost:5000/admin/dealers.html seedha khulega, isi tarah
// dealer/ folder ke saare pages bhi.
app.use("/admin", express.static("admin"));
app.use("/dealer", express.static("dealer"));


app.use("/api/auth", authRoutes);
app.use("/api/dealers", dealerRoutes);

app.use("/api/inventory", inventoryRoutes);
app.use("/api/dispatch", dispatchRoutes);
app.use("/api/warranty", warrantyRoutes);
app.use("/api/replacement", replacementRoutes);
app.use("/api/reward", rewardRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.get("/", (req, res) => {
    // "/" pe seedha admin login page dikhao, plain text nahi
    res.redirect("/admin/login.html");
});

// IMPORTANT: error handler must be the LAST app.use() — Express sends
// errors here from any route that uses asyncHandler.
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`✅ Server Running On Port ${PORT}`);
});
