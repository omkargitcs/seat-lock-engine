import { pool } from "../config/db.js";
import { redis } from "../config/redis.js";
import { HttpError, toPositiveInt, toSeatIdList } from "../utils/httpError.js";
import { MAX_SEATS_PER_BOOKING, buildQuote, priceFor, refundPolicy } from "../utils/pricing.js";
import { generateReference } from "../utils/reference.js";
import { resolveCoupon } from "./couponService.js";
import { PAYMENT_METHODS, charge, refund } from "./paymentService.js";
import { publishSeatChange } from "./realtime.js";
import { ShowService, holdKey, releaseSession } from "./showService.js";

const SELECT_BOOKING = `
  SELECT b.id, b.reference, b.status, b.subtotal, b.discount, b.fee, b.total_amount, b.coupon_code,
         b.payment_method, b.refund_amount, b.cancelled_at, b.created_at,
         s.id AS show_id, s.start_time, s.end_time,
         e.id AS event_id, e.title, e.kind, e.language, e.age_rating, e.accent,
         sc.name AS screen_name, v.name AS venue_name, v.address AS venue_address, v.city,
         json_agg(json_build_object('seat_id', st.id, 'label', st.row_label || st.seat_number,
                                    'tier', st.tier, 'price', bs.price)
                  ORDER BY st.row_label, st.seat_number) AS seats
    FROM bookings b
    JOIN shows s ON s.id = b.show_id
    JOIN events e ON e.id = s.event_id
    JOIN screens sc ON sc.id = s.screen_id
    JOIN venues v ON v.id = sc.venue_id
    JOIN booking_seats bs ON bs.booking_id = b.id
    JOIN seats st ON st.id = bs.seat_id
   WHERE b.user_id = $1 AND ($2::int IS NULL OR b.id = $2)
   GROUP BY b.id, s.id, e.id, sc.id, v.id
   ORDER BY s.start_time DESC`;

const shape = (row) => {
  const policy =
    row.status === "confirmed"
      ? refundPolicy({ startTime: row.start_time, total: row.total_amount, fee: row.fee })
      : { can_cancel: false, refund: 0, percent: 0 };
  return {
    ...row,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    fee: Number(row.fee),
    total_amount: Number(row.total_amount),
    refund_amount: Number(row.refund_amount),
    seats: row.seats.map((s) => ({ ...s, price: Number(s.price) })),
    can_cancel: policy.can_cancel,
    refund_if_cancelled: policy.refund,
    refund_percent: policy.percent,
  };
};

export class BookingService {
  static async listForUser(userId) {
    const { rows } = await pool.query(SELECT_BOOKING, [userId, null]);
    return rows.map(shape);
  }

  static async getForUser(bookingId, userId) {
    const { rows } = await pool.query(SELECT_BOOKING, [userId, bookingId]);
    return rows[0] ? shape(rows[0]) : null;
  }

  /*
    Confirm = turn a Redis hold into a permanent booking.
      1. replay check, so a retried request (same payment_ref) never double-charges
      2. verify the caller still owns every hold
      3. charge, then write booking + seats in ONE transaction
      4. the unique index uniq_active_seat is the final guard against double booking
  */
  static async confirm(user, body) {
    const showId = toPositiveInt(body.show_id);
    const seatIds = toSeatIdList(body.seat_ids, MAX_SEATS_PER_BOOKING);
    const paymentRef = String(body.payment_ref || "");
    const method = String(body.payment_method || "");
    if (!showId || !seatIds) throw new HttpError(400, "Missing show or seats.");
    if (paymentRef.length < 8 || paymentRef.length > 100) throw new HttpError(400, "Missing payment reference.");
    if (!PAYMENT_METHODS.includes(method)) throw new HttpError(400, "Choose a payment method.");

    const replay = await pool.query("SELECT id, user_id FROM bookings WHERE payment_ref = $1", [paymentRef]);
    if (replay.rows[0]) {
      if (replay.rows[0].user_id !== user.id) throw new HttpError(409, "That payment reference is already used.");
      return { booking: await this.getForUser(replay.rows[0].id, user.id), idempotent: true };
    }

    const show = await ShowService.requireShow(showId);
    ShowService.assertBookable(show);

    const owners = await redis.mget(seatIds.map((id) => holdKey(showId, id)));
    if (owners.some((o) => o !== String(user.id))) {
      throw new HttpError(409, "Your hold on these seats has expired. Please select your seats again.");
    }

    const preview = await ShowService.quote(showId, seatIds, body.coupon_code);
    const reference = generateReference();
    const payment = await charge({ amount: preview.total, method, reference });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: seats } = await client.query(
        "SELECT id, row_label, seat_number, tier FROM seats WHERE screen_id = $1 AND id = ANY($2::int[])",
        [show.screen_id, seatIds],
      );
      const subtotal = seats.reduce((sum, s) => sum + priceFor(show.base_price, s.tier), 0);
      const { coupon, discount } = await resolveCoupon(client, body.coupon_code, subtotal, { lock: true });
      const quote = buildQuote({ basePrice: show.base_price, seats, discount });

      const { rows } = await client.query(
        `INSERT INTO bookings (reference, user_id, show_id, subtotal, discount, fee, total_amount,
                               coupon_code, payment_ref, payment_method)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [reference, user.id, showId, quote.subtotal, quote.discount, quote.fee, quote.total,
         coupon?.code ?? null, paymentRef, method],
      );
      const bookingId = rows[0].id;

      await client.query(
        `INSERT INTO booking_seats (booking_id, show_id, seat_id, price)
         SELECT $1, $2, x.seat_id, x.price FROM unnest($3::int[], $4::numeric[]) AS x(seat_id, price)`,
        [bookingId, showId, quote.items.map((i) => i.seat_id), quote.items.map((i) => i.price)],
      );
      if (coupon) await client.query("UPDATE coupons SET used_count = used_count + 1 WHERE code = $1", [coupon.code]);

      await client.query("COMMIT");
      await releaseSession(showId, user.id);
      publishSeatChange(showId);
      return { booking: await this.getForUser(bookingId, user.id), idempotent: false };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      await refund({ amount: preview.total, gatewayRef: payment.gatewayRef });
      if (err.code === "23505" && err.constraint === "uniq_active_seat") {
        throw new HttpError(409, "Those seats were just booked by someone else. You have not been charged.");
      }
      if (err.code === "23505" && err.constraint === "bookings_payment_ref_key") {
        const again = await pool.query("SELECT id FROM bookings WHERE payment_ref = $1 AND user_id = $2", [paymentRef, user.id]);
        if (again.rows[0]) return { booking: await this.getForUser(again.rows[0].id, user.id), idempotent: true };
      }
      throw err;
    } finally {
      client.release();
    }
  }

  static async cancel(bookingId, user) {
    const client = await pool.connect();
    let showId;
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT b.id, b.show_id, b.status, b.total_amount, b.fee, s.start_time
           FROM bookings b JOIN shows s ON s.id = b.show_id
          WHERE b.id = $1 AND b.user_id = $2 FOR UPDATE OF b`,
        [bookingId, user.id],
      );
      const booking = rows[0];
      if (!booking) throw new HttpError(404, "Booking not found.");
      if (booking.status === "cancelled") throw new HttpError(400, "This booking is already cancelled.");

      const policy = refundPolicy({ startTime: booking.start_time, total: booking.total_amount, fee: booking.fee });
      if (!policy.can_cancel) throw new HttpError(400, "Bookings can't be cancelled within 2 hours of the show.");

      await client.query(
        "UPDATE bookings SET status = 'cancelled', refund_amount = $2, cancelled_at = NOW() WHERE id = $1",
        [bookingId, policy.refund],
      );
      await client.query("UPDATE booking_seats SET active = FALSE WHERE booking_id = $1", [bookingId]);
      await client.query("COMMIT");
      showId = booking.show_id;
      if (policy.refund > 0) await refund({ amount: policy.refund, gatewayRef: `refund_${bookingId}` });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    publishSeatChange(showId);
    return this.getForUser(bookingId, user.id);
  }
}
