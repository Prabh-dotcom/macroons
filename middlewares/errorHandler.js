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

    const statusCode = err.statusCode || 500;
    const message = err.statusCode ? err.message : "Something went wrong on the server.";

    return res.status(statusCode).json({
        success: false,
        message
    });
};

module.exports = errorHandler;
