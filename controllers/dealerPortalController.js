// controllers/dealerPortalController.js

const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const DealerPortalModel = require("../models/dealerPortalModel");
const WarrantyModel = require("../models/warrantyModel");
const ReplacementModel = require("../models/replacementModel");
const NotificationModel = require("../models/notificationModel");
const ReportModel = require("../models/reportModel");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

exports.getDashboard = asyncHandler(async (req, res) => {
    const dealerId = req.user.dealer_id;

    const [info, stats, recentWarranty, recentReplacement] = await Promise.all([
        DealerPortalModel.getDealerInfo(dealerId),
        DealerPortalModel.getDashboardStats(dealerId),
        DealerPortalModel.getRecentWarranty(dealerId),
        DealerPortalModel.getRecentReplacement(dealerId)
    ]);

    return apiResponse.success(res, 200, "Dashboard fetched successfully.", {
        dealer: info,
        stats,
        recentWarranty,
        recentReplacement
    });
});

// GET /api/dealer-portal/warranty -- same list as admin, but always
// force-filtered to req.user.dealer_id (from JWT, dealer can't override it)
exports.getWarrantyList = asyncHandler(async (req, res) => {
    const { search, status, page, limit } = req.query;

    const result = await WarrantyModel.getAll({
        search,
        status,
        dealer_id: req.user.dealer_id,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 10
    });

    return apiResponse.success(res, 200, "Warranty records fetched successfully.", result);
});

// GET /api/dealer-portal/warranty/stats -- 4 cards on dealer-warranty.html
exports.getWarrantyStats = asyncHandler(async (req, res) => {
    const stats = await DealerPortalModel.getWarrantyPageStats(req.user.dealer_id);
    return apiResponse.success(res, 200, "Warranty stats fetched successfully.", stats);
});

// GET /api/dealer-portal/search -- dashboard topbar search box
exports.quickSearch = asyncHandler(async (req, res) => {
    const { term } = req.query;
    if (!term || term.trim().length < 2) {
        return apiResponse.success(res, 200, "Search results.", []);
    }
    const data = await DealerPortalModel.quickSearch(req.user.dealer_id, term.trim());
    return apiResponse.success(res, 200, "Search results.", data);
});

// GET /api/dealer-portal/activity -- dashboard "Recent Activity" timeline
exports.getRecentActivity = asyncHandler(async (req, res) => {
    const activity = await DealerPortalModel.getRecentActivity(req.user.dealer_id);
    return apiResponse.success(res, 200, "Recent activity fetched successfully.", activity);
});

/* =========================================================
   REPLACEMENT (dealer/dealer-replacement.html) -- dealer
   self-service submission. Same DB write as the admin side
   (ReplacementModel.create), but dealer_id is always forced
   from the JWT (never trusted from the form), and this is
   where the admin gets notified that a new request came in.
========================================================= */
exports.createReplacement = asyncHandler(async (req, res) => {
    const { old_inventory_id, new_inventory_id, customer_name, customer_phone } = req.body;

    if (!old_inventory_id || !customer_name || !customer_phone) {
        return apiResponse.error(res, 400, "Old serial (resolved), customer name and mobile are required.");
    }

    // Old serial must actually have been dispatched (i.e. really exists in
    // the pipeline) before a replacement can be filed against it. Full
    // dealer-ownership matching happens earlier at the lookup-old-serial
    // step (GET /api/replacement/lookup-old-serial); this is a fresh
    // re-check at submit time so a tampered inventory_id can't slip through.
    const dispatchDate = await WarrantyModel.getDispatchDateForInventory(old_inventory_id);
    if (dispatchDate === null) {
        return apiResponse.error(res, 409, "This serial hasn't been dispatched to any dealer yet.");
    }

    const battery_images = (req.files?.battery_images || [])
        .map(f => `/uploads/replacements/${f.filename}`)
        .join(",") || null;
    const invoice_file = req.files?.invoice_file?.[0]
        ? `/uploads/replacements/${req.files.invoice_file[0].filename}`
        : null;

    const replacementId = await ReplacementModel.create({
        old_inventory_id,
        new_inventory_id: new_inventory_id || null,
        dealer_id: req.user.dealer_id,
        customer_name,
        customer_phone,
        customer_city: req.body.customer_city || null,
        customer_address: req.body.customer_address || null,
        reason: req.body.reason || null,
        invoice_number: req.body.invoice_number || null,
        battery_condition: req.body.battery_condition || null,
        problem_description: req.body.problem_description || null,
        battery_images,
        invoice_file,
        replacement_date: req.body.replacement_date || null,
        status: "pending"
    });

    const displayId = `RPL${String(replacementId).padStart(4, "0")}`;

    // Admin ko naye replacement request ka pata chalna chahiye -- bell
    // icon me yeh notification dikhegi (koi bhi admin/staff login kare,
    // sabko dikhegi -- audience 'admin' shared hai).
    await NotificationModel.create({
        audience: "admin",
        title: "New Replacement Request",
        message: `${displayId} -- ${customer_name} ke liye replacement request aayi hai.`,
        link: "/admin/replacement.html"
    });

    return apiResponse.success(res, 201, "Replacement request submitted successfully.", {
        replacement_id: replacementId,
        display_id: displayId
    });
});

/* =========================================================
   REPORTS PAGE (dealer/dealer-reports.html) -- 4 cards +
   4 report tables, all force-filtered to req.user.dealer_id.
========================================================= */

exports.getReportSummary = asyncHandler(async (req, res) => {
    const data = await ReportModel.getDealerReportSummary(req.user.dealer_id);
    return apiResponse.success(res, 200, "Report summary fetched successfully.", data);
});

exports.getSalesReport = asyncHandler(async (req, res) => {
    const { fromDate, toDate, search } = req.query;
    const data = await ReportModel.getDealerSalesReport(req.user.dealer_id, { fromDate, toDate, search });
    return apiResponse.success(res, 200, "Sales report fetched successfully.", data);
});

exports.getWarrantyReport = asyncHandler(async (req, res) => {
    const { fromDate, toDate, search } = req.query;
    const data = await ReportModel.getDealerWarrantyReport(req.user.dealer_id, { fromDate, toDate, search });
    return apiResponse.success(res, 200, "Warranty report fetched successfully.", data);
});

exports.getReplacementReport = asyncHandler(async (req, res) => {
    const { fromDate, toDate, search } = req.query;
    const data = await ReportModel.getDealerReplacementReport(req.user.dealer_id, { fromDate, toDate, search });
    return apiResponse.success(res, 200, "Replacement report fetched successfully.", data);
});

exports.getRewardReport = asyncHandler(async (req, res) => {
    const { fromDate, toDate, search } = req.query;
    const data = await ReportModel.getDealerRewardReport(req.user.dealer_id, { fromDate, toDate, search });
    return apiResponse.success(res, 200, "Reward report fetched successfully.", data);
});

/* =========================================================
   PROFILE PAGE (dealer-profile.html)
========================================================= */

exports.getProfile = asyncHandler(async (req, res) => {
    const profile = await DealerPortalModel.getFullProfile(req.user.dealer_id);
    if (!profile) return apiResponse.error(res, 404, "Profile not found.");
    return apiResponse.success(res, 200, "Profile fetched successfully.", profile);
});

exports.updateProfile = asyncHandler(async (req, res) => {
    const { dealer_name, contact_person, phone, email, address_line, city, district, state, pincode, gst_number } = req.body;

    const errors = [];
    if (!dealer_name || dealer_name.trim().length < 2) errors.push("Dealer/Business name kam se kam 2 characters ka hona chahiye.");
    if (!phone || !/^[0-9]{10}$/.test(phone)) errors.push("Mobile number 10 digit ka hona chahiye.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Email format sahi nahi hai.");
    if (gst_number && !/^[0-9A-Za-z]{15}$/.test(gst_number)) errors.push("GST number 15 characters ka hona chahiye.");

    if (errors.length) return apiResponse.error(res, 400, "Validation failed.", errors);

    if (email) {
        const duplicate = await DealerPortalModel.emailExists(email, req.user.dealer_id);
        if (duplicate) return apiResponse.error(res, 409, "Yeh email pehle se kisi aur dealer ke account mein use ho raha hai.");
    }

    await DealerPortalModel.updateProfile(req.user.dealer_id, {
        dealer_name, contact_person, phone, email, address_line, city, district, state, pincode, gst_number
    });

    // Update ke baad dealer record dobara fetch karke confirm karte hain ki
    // woh sach me exist karta hai -- agar token purana/stale hai (dealer_id
    // JWT mein hai lekin database mein woh dealer ab exist nahi karta), to
    // yahan null milega. Aise mein "successfully updated" jaisa galat
    // success message dikhana bahut misleading hota -- isliye explicitly
    // 401 dete hain taaki dealer dobara login kare.
    const updated = await DealerPortalModel.getFullProfile(req.user.dealer_id);
    if (!updated) {
        return apiResponse.error(res, 401, "Aapka session invalid ho gaya hai. Please logout karke dobara login karo.");
    }

    return apiResponse.success(res, 200, "Profile update ho gaya.", updated);
});

exports.changePassword = asyncHandler(async (req, res) => {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
        return apiResponse.error(res, 400, "Current password aur new password dono zaroori hain.");
    }
    if (new_password.length < 6) {
        return apiResponse.error(res, 400, "New password kam se kam 6 characters ka hona chahiye.");
    }

    const record = await DealerPortalModel.getPasswordHash(req.user.dealer_id);
    if (!record) return apiResponse.error(res, 404, "Dealer not found.");

    const matches = await bcrypt.compare(current_password, record.password_hash);
    if (!matches) return apiResponse.error(res, 401, "Current password galat hai.");

    const password_hash = await bcrypt.hash(new_password, 10);
    await DealerPortalModel.updatePassword(req.user.dealer_id, password_hash);

    return apiResponse.success(res, 200, "Password successfully change ho gaya.");
});

// POST /api/dealer-portal/profile/photo -- multipart/form-data, field name "photo"
exports.uploadPhoto = asyncHandler(async (req, res) => {
    if (!req.file) {
        return apiResponse.error(res, 400, "Koi photo file nahi mili. JPG, PNG ya WEBP chuno.");
    }

    const dealerId = req.user.dealer_id;
    const newPhotoPath = `/uploads/dealers/${req.file.filename}`;

    // Purani photo file ko disk se delete kar do (naya upload permanently
    // replace karta hai, purani file orphan bankar disk pe nahi padi rehni chahiye).
    const oldPhotoPath = await DealerPortalModel.getPhotoPath(dealerId);
    if (oldPhotoPath) {
        const oldFileOnDisk = path.join(__dirname, "..", oldPhotoPath.replace(/^\//, ""));
        fs.unlink(oldFileOnDisk, () => {}); // best-effort, purani file na mile to bhi koi baat nahi
    }

    await DealerPortalModel.updatePhoto(dealerId, newPhotoPath);

    return apiResponse.success(res, 200, "Profile photo update ho gayi.", { photo_path: newPhotoPath });
});