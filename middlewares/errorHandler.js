// middlewares/errorHandler.js
//
// Express ka LAST middleware — jab bhi koi controller error throw
// karega (asyncHandler ke through), yahan aakar catch hoga.
// Isse hume har controller me try/catch nahi likhna padta, aur
// user ko kabhi raw stack trace / SQL error nahi dikhta (security
// ke liye important — raw MySQL error message me table/column names
// leak ho sakte hain).

const errorHandler = (err, req, res, next) => {
    console.error("❌ ERROR:", err);

    // MySQL duplicate entry (e.g. duplicate serial_number, duplicate email)
    if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
            success: false,
            message: "This record already exists (duplicate value).",
        });
    }

    // MySQL foreign key violation (e.g. deleting a dealer that has dispatches)
    if (err.code === "ER_ROW_IS_REFERENCED_2" || err.code === "ER_ROW_IS_REFERENCED") {
        return res.status(409).json({
            success: false,
            message: "Cannot delete — this record is linked to other data.",
        });
    }

    // MySQL FK violation on INSERT/UPDATE -- points to a linked ID (dealer,
    // product, inventory serial etc.) that doesn't actually exist
    if (err.code === "ER_NO_REFERENCED_ROW_2" || err.code === "ER_NO_REFERENCED_ROW") {
        return res.status(400).json({
            success: false,
            message: "One of the linked records (dealer / product / serial) could not be found. Please search the serial number again and resubmit.",
        });
    }

    // A required (NOT NULL) column was sent as null/empty
    if (err.code === "ER_BAD_NULL_ERROR") {
        return res.status(400).json({
            success: false,
            message: "A required field was left empty. Please check the form and try again.",
        });
    }

    // A value was longer than the column allows (e.g. mobile number with
    // extra characters/spaces/country code pushing it past 15 characters)
    if (err.code === "ER_DATA_TOO_LONG") {
        return res.status(400).json({
            success: false,
            message: "One of the values you entered is too long for that field. Please shorten it and try again.",
        });
    }

    // Invalid/out-of-range value for a date, number, or enum column
    if (err.code === "ER_TRUNCATED_WRONG_VALUE" || err.code === "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD" || err.code === "WARN_DATA_TRUNCATED") {
        return res.status(400).json({
            success: false,
            message: "One of the values you entered is not valid for that field (check dates and dropdown selections).",
        });
    }

    // Multer file upload errors (photo too large / wrong field name etc.)
    if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
            success: false,
            message: "File bahut badi hai. Maximum allowed size 2MB hai.",
        });
    }
    if (err.name === "MulterError") {
        return res.status(400).json({
            success: false,
            message: "File upload me problem hui: " + err.message,
        });
    }

    const statusCode = err.statusCode || 500;
    const message = err.statusCode ? err.message : "Something went wrong on the server.";

    return res.status(statusCode).json({
        success: false,
        message,
        // Safe to expose in dev -- sqlMessage never contains table/column
        // structure a client couldn't already infer from the form itself,
        // and this is what actually tells you WHY a save failed instead of
        // a black-box "something went wrong".
        ...(process.env.NODE_ENV !== "production" && err.sqlMessage ? { debug: err.sqlMessage } : {})
    });
};

module.exports = errorHandler;