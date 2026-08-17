// middlewares/uploadDealerPhoto.js
//
// Dealer profile photo upload -- uploads/dealers/ folder me save hota hai.
// server.js pehle se "/uploads" ko static serve kar raha hai, isliye
// yeh photo save hote hi seedha browser me is URL se khul jaayegi:
//   http://localhost:5000/uploads/dealers/<filename>
//
// Same pattern as middlewares/uploadReplacementFiles.js.

const multer = require("multer");
const fs = require("fs");
const path = require("path");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "dealers");

// Folder pehli baar exist nahi karta to bana do (warna multer error dega).
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        // dealer_id prefix rakha hai taaki file dekh ke pata chal jaaye
        // kis dealer ki hai (debugging/cleanup me kaam aata hai).
        const dealerId = req.user ? req.user.dealer_id : "unknown";
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `dealer-${dealerId}-${Date.now()}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype);
    if (extOk && mimeOk) return cb(null, true);
    const err = new Error("Sirf JPG, PNG ya WEBP image allowed hai.");
    err.statusCode = 400;
    cb(err);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB -- ek profile photo ke liye kaafi hai
});

module.exports = upload.single("photo");