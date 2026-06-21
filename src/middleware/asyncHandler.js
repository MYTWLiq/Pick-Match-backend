/**
 * @fileoverview Wraps an async Express route handler so any thrown error
 * or rejected promise is forwarded to next(err) instead of crashing the
 * process or hanging the request. Express 4 (used here, see package.json)
 * does not do this automatically for async handlers.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
