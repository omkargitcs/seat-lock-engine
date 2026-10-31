import rateLimit from "express-rate-limit";

const make = (windowMs, limit, message, extra = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: message },
    // Set DISABLE_RATE_LIMIT=1 only when running scripts/test-concurrency.js
    skip: () => process.env.DISABLE_RATE_LIMIT === "1",
    ...extra,
  });

export const globalLimiter = make(60_000, 600, "Too many requests. Please slow down.");
export const authLimiter = make(15 * 60_000, 30, "Too many attempts. Try again in a few minutes.", {
  skipSuccessfulRequests: true,
});
export const holdLimiter = make(60_000, 60, "You're selecting seats too quickly. Wait a moment.");
export const bookingLimiter = make(60_000, 20, "Too many booking attempts. Wait a moment.");
