// All money maths lives here so the quote, the booking and the refund always agree.
export const TIER_MULTIPLIER = { standard: 1, premium: 1.4, vip: 2 };
export const FEE_PER_TICKET = 20; // convenience fee in rupees, non-refundable
export const MAX_SEATS_PER_BOOKING = 8;
export const HOLD_TTL_SECONDS = 300;

export const priceFor = (basePrice, tier) =>
  Math.round(Number(basePrice) * (TIER_MULTIPLIER[tier] ?? 1));

export function buildQuote({ basePrice, seats, discount = 0 }) {
  const items = seats.map((s) => ({
    seat_id: s.id,
    label: `${s.row_label}${s.seat_number}`,
    tier: s.tier,
    price: priceFor(basePrice, s.tier),
  }));
  const subtotal = items.reduce((sum, i) => sum + i.price, 0);
  const safeDiscount = Math.min(discount, subtotal);
  const fee = FEE_PER_TICKET * items.length;
  return { items, subtotal, discount: safeDiscount, fee, total: subtotal - safeDiscount + fee };
}

// Refund policy: 24h+ before the show = full ticket value, 2h to 24h = half, under 2h = no cancellation.
// The convenience fee is never refunded.
export function refundPolicy({ startTime, total, fee }, now = new Date()) {
  const hoursLeft = (new Date(startTime) - now) / 36e5;
  if (hoursLeft < 2) return { can_cancel: false, refund: 0, percent: 0 };
  const refundable = Math.max(0, Number(total) - Number(fee));
  const percent = hoursLeft >= 24 ? 100 : 50;
  return { can_cancel: true, refund: Math.round((refundable * percent) / 100), percent };
}
