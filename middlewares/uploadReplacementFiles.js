// middlewares/uploadReplacementFiles.js
//
// Dealer Replacement form se aane wali files (battery images + purchase
// invoice) ko disk pe save karta hai: uploads/replacements/ folder me.
// server.js pehle se "/uploads" ko static serve kar raha hai, isliye
// yeh files save hote hi seedha browser me is URL se khul jaayengi:
//   http://localhost:5000/uploads/replacements/<filename>

const multer = require("multer");
const fs = require("fs");
const path = require("path");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "replacements");

// Folder pehli baar exist nahi karta to bana do (warna multer error dega).
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype);
    if (extOk && mimeOk) return cb(null, true);
    cb(new Error("Sirf JPG, PNG ya PDF files allowed hain."));
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024, files: 6 } // 5MB per file, max 6 files total
});

module.exports = upload.fields([
    { name: "battery_images", maxCount: 5 },
    { name: "invoice_file", maxCount: 1 }
]);