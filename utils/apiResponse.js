// utils/apiResponse.js
//
// Sabhi API responses ek hi consistent shape me aayein, isliye yeh
// chhota helper. Frontend (jo abhi static hai, aage React/JS se wire
// hoga) ko hamesha yehi predictable format milega:
//
//   success: { success: true, message, data }
//   error:   { success: false, message, errors }

exports.success = (res, statusCode, message, data = null) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data
    });
};

exports.error = (res, statusCode, message, errors = null) => {
    return res.status(statusCode).json({
        success: false,
        message,
        errors
    });
};
