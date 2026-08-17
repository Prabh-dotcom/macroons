// controllers/warrantyController.js

const WarrantyModel = require("../models/warrantyModel");
const NotificationModel = require("../models/notificationModel");
const RewardModel = require("../models/rewardModel");
const SettingsModel = require("../models/settingsModel");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

// Business rule: har warranty activation pe dealer ko reward points
// milte hain -- chahe dealer khud activate kare ya admin uski taraf se
// kare, dono cases mein dealer ko hi credit milta hai (yeh dealer ke
// business action ka reward hai, jisne button dabaya usko nahi).
//
// Yeh ab Settings > Reward Settings ("Warranty Reward Points") se LIVE
// read hota hai -- admin waha value badle to yahan turant reflect hota
// hai, server restart ki zaroorat nahi. DB mein setting na mile (fresh
// install, migration abhi run nahi hui) to 50 fallback hai.
async function getWarrantyActivationRewardPoints(){
    const value = await SettingsModel.getByKey("warranty_reward_points", "50");
    return Number(value) || 50;
}

// Business rule: a dealer can self-activate warranty for a battery only
// within N days of it being dispatched to them (Settings > Warranty
// Settings > "Grace Period (Days)"). After that, only admin/staff can
// activate it. Staff/admin are never restricted by this window.
async function getDealerSelfActivationWindowDays(){
    const value = await SettingsModel.getByKey("grace_period_days", "90");
    return Number(value) || 90;
}

function daysSince(dateValue){
    if (!dateValue) return null;
    const dispatchDate = new Date(dateValue);
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.floor((Date.now() - dispatchDate.getTime()) / msPerDay);
}

// GET /api/warranty/lookup-serial?serial=XXX
exports.lookupSerial = asyncHandler(async (req, res) => {
    const { serial } = req.query;
    if (!serial) {
        return apiResponse.error(res, 400, "Serial number is required.");
    }

    const result = await WarrantyModel.lookupSerialForWarranty(serial);

    if (!result) {
        return apiResponse.error(res, 404, "Serial number not found in inventory.");
    }
    if (!result.dealer_id) {
        return apiResponse.error(res, 409, "This serial hasn't been dispatched to any dealer yet.");
    }

    const daysSinceDispatch = daysSince(result.dispatch_date);
    const selfActivationExpired = daysSinceDispatch !== null && daysSinceDispatch > DEALER_SELF_ACTIVATION_WINDOW_DAYS;

    // Dealers lose self-activation rights after the window closes -- admin
    // still sees full details (just informational, never blocked for them).
    if (req.user.type === "dealer" && selfActivationExpired) {
        return apiResponse.error(
            res, 403,
            `This battery was dispatched ${daysSinceDispatch} days ago. The ${DEALER_SELF_ACTIVATION_WINDOW_DAYS}-day self-activation window has expired -- please contact your admin to activate this warranty.`
        );
    }

    return apiResponse.success(res, 200, "Serial found.", {
        ...result,
        days_since_dispatch: daysSinceDispatch,
        self_activation_expired: selfActivationExpired
    });
});

exports.getAllWarranty = asyncHandler(async (req, res) => {
    const { search, status, page, limit } = req.query;

    const result = await WarrantyModel.getAll({
        search,
        status,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 10
    });

    return apiResponse.success(res, 200, "Warranty records fetched successfully.", result);
});

exports.getWarrantyById = asyncHandler(async (req, res) => {
    const item = await WarrantyModel.getById(req.params.id);
    if (!item) {
        return apiResponse.error(res, 404, "Warranty record not found.");
    }
    return apiResponse.success(res, 200, "Warranty record fetched successfully.", item);
});

// POST /api/warranty
exports.createWarranty = asyncHandler(async (req, res) => {
    const {
        inventory_id, dealer_id, customer_name, customer_phone
    } = req.body;
    let { warranty_months, activation_date, status } = req.body;

    if (!inventory_id || !dealer_id || !customer_name || !customer_phone || !activation_date || !warranty_months) {
        return apiResponse.error(res, 400, "Serial (with dealer resolved), customer name, mobile, activation date and warranty period are required.");
    }

    // Dealer self-service checks -- staff/admin are never restricted here.
    if (req.user.type === "dealer") {
        // A dealer can only activate warranty for their OWN dispatched
        // stock, never claim it under a different dealer_id.
        if (Number(dealer_id) !== Number(req.user.dealer_id)) {
            return apiResponse.error(res, 403, "You can only activate warranty for batteries dispatched to your own dealer account.");
        }

        // Re-check the 90-day window independently at submit time too
        // (don't just trust whatever the earlier lookup response said).
        const dispatchDate = await WarrantyModel.getDispatchDateForInventory(inventory_id);
        const daysSinceDispatch = daysSince(dispatchDate);

        if (daysSinceDispatch === null) {
            return apiResponse.error(res, 409, "This serial hasn't been dispatched to any dealer yet.");
        }

        const selfActivationWindowDays = await getDealerSelfActivationWindowDays();
        if (daysSinceDispatch > selfActivationWindowDays) {
            return apiResponse.error(
                res, 403,
                `This battery was dispatched ${daysSinceDispatch} days ago. The ${selfActivationWindowDays}-day self-activation window has expired -- please contact your admin to activate this warranty.`
            );
        }

        // Warranty period is admin-controlled (set on the product master),
        // not dealer-controlled. Whatever the client sent for
        // warranty_months is ignored here and replaced with the real
        // product value -- this is what actually enforces it, since the
        // frontend lock alone could be bypassed by calling the API directly.
        const officialMonths = await WarrantyModel.getWarrantyMonthsForInventory(inventory_id);
        if (officialMonths === null) {
            return apiResponse.error(res, 409, "Could not resolve this serial's product/warranty period. Please search the serial again.");
        }
        warranty_months = officialMonths;

        // Activation date = the actual dispatch date, not whatever the
        // dealer's form sent -- warranty starts the day the battery left
        // the warehouse, that's a fact from our own records, not something
        // a dealer should be typing in.
        activation_date = new Date(dispatchDate).toISOString().split("T")[0];

        // A dealer activating their own battery always lands as "active" --
        // "pending"/"expired"/"claimed" are states admin sets afterwards
        // through the admin panel, not choices a dealer makes at activation.
        status = "active";
    }

    // Catch bad data HERE with a clear message, instead of letting a raw
    // MySQL error (data too long / bad enum / bad date) fall through to a
    // generic "something went wrong" response.
    const errors = [];

    if (isNaN(Number(inventory_id)) || isNaN(Number(dealer_id))) {
        errors.push("Invalid serial/dealer selection -- please search the serial number again.");
    }

    if (customer_name.trim().length > 150) {
        errors.push("Customer name is too long (max 150 characters).");
    }

    const phoneDigitsOnly = customer_phone.replace(/\D/g, "");
    if (phoneDigitsOnly.length < 10 || customer_phone.length > 15) {
        errors.push("Enter a valid mobile number (10 digits, max 15 characters including any + or spaces).");
    }

    if (isNaN(Date.parse(activation_date))) {
        errors.push("Activation date is not valid.");
    }

    if (isNaN(Number(warranty_months)) || Number(warranty_months) <= 0) {
        errors.push("Warranty period must be a valid number of months.");
    }

    if (req.body.customer_pincode && req.body.customer_pincode.length > 10) {
        errors.push("Pincode is too long (max 10 characters).");
    }

    if (req.body.invoice_number && req.body.invoice_number.length > 50) {
        errors.push("Invoice number is too long (max 50 characters).");
    }

    if (errors.length > 0) {
        return apiResponse.error(res, 400, "Please fix the following and try again.", errors);
    }

    const alreadyExists = await WarrantyModel.serialAlreadyUnderWarranty(inventory_id);
    if (alreadyExists) {
        return apiResponse.error(res, 409, "This serial number already has a warranty record.");
    }

    // Expiry date = activation date + warranty period (months)
    const expiry = new Date(activation_date);
    expiry.setMonth(expiry.getMonth() + Number(warranty_months));
    const expiry_date = expiry.toISOString().split("T")[0];

    const warrantyId = await WarrantyModel.create({
        ...req.body,
        activation_date,
        status,
        warranty_months,
        expiry_date,
        activated_by: req.user.user_id || null
    });

    // Dealer ne khud warranty activate ki (self-service) to admin ko
    // pata chalna chahiye -- bell icon me yeh notification dikhegi
    // (replacement request jaisa hi pattern, audience 'admin' shared hai).
    //
    // NOTE: yeh poora block try/catch mein hai -- warranty upar wali
    // line (WarrantyModel.create) mein already DB mein SAVE ho chuki
    // hai. Agar sirf notification/reward credit karte waqt koi error
    // aaye (bahut rare), to poori request ko 500 fail nahi karna --
    // warna dealer ko lagega warranty hi nahi bani, jabki wo ban chuki
    // hai (aur dobara try karne par "serial already under warranty"
    // wala confusing error milega).
    try {
        if (req.user.type === "dealer") {
            await NotificationModel.create({
                audience: "admin",
                title: "Warranty Self-Activated by Dealer",
                message: `${customer_name} ke liye warranty (WAR${String(warrantyId).padStart(4, "0")}) dealer ne khud activate ki hai.`,
                link: "/admin/warranty.html"
            });
        }

        // Har warranty activation pe dealer ke reward wallet mein fixed
        // points credit ho jaate hain -- status seedha 'approved' rakha
        // hai (system-generated automatic reward hai, manual approval
        // ki zaroorat nahi, jaise admin dwara di gayi credit ke liye
        // hoti hai).
        const rewardWarrantyId = `WAR${String(warrantyId).padStart(4, "0")}`;
        const activationRewardPoints = await getWarrantyActivationRewardPoints();

        await RewardModel.createTransaction({
            dealer_id: dealer_id,
            transaction_date: activation_date,
            transaction_type: "credit",
            reference_type: "warranty",
            reference_id: warrantyId,
            points: activationRewardPoints,
            remarks: `Warranty activation reward for ${rewardWarrantyId}`,
            status: "approved",
            created_by: req.user.type === "dealer" ? null : req.user.user_id
        });

        await NotificationModel.create({
            audience: "dealer",
            dealer_id: dealer_id,
            title: "Reward Points Credited",
            message: `\uD83C\uDF81 ${activationRewardPoints} points credited to your wallet for activating warranty ${rewardWarrantyId}.`,
            link: "/dealer/dealer-reward-wallet.html"
        });
    } catch (err) {
        console.error("Warranty created, but reward/notification step failed:", err.message);
    }

    return apiResponse.success(res, 201, "Warranty activated successfully.", { warranty_id: warrantyId, expiry_date });
});

exports.deleteWarranty = asyncHandler(async (req, res) => {
    const existing = await WarrantyModel.getById(req.params.id);
    if (!existing) {
        return apiResponse.error(res, 404, "Warranty record not found.");
    }

    await WarrantyModel.remove(req.params.id);

    return apiResponse.success(res, 200, "Warranty record deleted successfully.");
});

// GET /api/warranty/stats/summary -- 4 dashboard cards
exports.getStats = asyncHandler(async (req, res) => {
    const stats = await WarrantyModel.getStats();
    return apiResponse.success(res, 200, "Warranty stats fetched successfully.", stats);
});