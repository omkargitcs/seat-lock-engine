import { HttpError } from "../utils/httpError.js";

// Works with the pool or a transaction client. `lock` takes a row lock so usage counts stay exact.
export async function resolveCoupon(db, code, subtotal, { lock = false } = {}) {
  if (!code) return { coupon: null, discount: 0 };

  const { rows } = await db.query(
    `SELECT * FROM coupons WHERE code = $1 ${lock ? "FOR UPDATE" : ""}`,
    [String(code).trim().toUpperCase()],
  );
  const c = rows[0];
  if (!c || !c.active) throw new HttpError(400, "That coupon code isn't valid.");
  if (c.valid_until && new Date(c.valid_until) < new Date()) throw new HttpError(400, "That coupon has expired.");
  if (c.usage_limit !== null && c.used_count >= c.usage_limit) {
    throw new HttpError(400, "That coupon has been fully redeemed.");
  }
  if (subtotal < Number(c.min_amount)) {
    throw new HttpError(400, `Add tickets worth ₹${Number(c.min_amount)} or more to use ${c.code}.`);
  }

  let discount = (subtotal * c.percent_off) / 100;
  if (c.max_discount !== null) discount = Math.min(discount, Number(c.max_discount));
  return { coupon: c, discount: Math.round(discount) };
}
