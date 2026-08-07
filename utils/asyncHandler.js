// utils/asyncHandler.js
//
// Har controller function me try/catch likhna repetitive hai.
// Yeh wrapper kisi bhi async function ke error ko automatically
// pakad kar Express ke error handler (middlewares/errorHandler.js) tak
// bhej deta hai.
//
// USAGE:
//   exports.getAllDealers = asyncHandler(async (req, res) => {
//       const dealers = await DealerModel.getAll();
//       res.json(dealers);
//   });

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
