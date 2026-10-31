import { pool } from "../config/db.js";
import { redis } from "../config/redis.js";
import { HttpError, toSeatIdList } from "../utils/httpError.js";
import {
  FEE_PER_TICKET,
  HOLD_TTL_SECONDS,
  MAX_SEATS_PER_BOOKING,
  buildQuote,
  priceFor,
} from "../utils/pricing.js";
import { resolveCoupon } from "./couponService.js";
import { publishSeatChange } from "./realtime.js";

export const holdKey = (showId, seatId) => `hold:seat:${showId}:${seatId}`;
export const sessionKey = (showId, userId) => `hold:session:${showId}:${userId}`;

/*
  Atomic multi-seat hold. One Lua script = one atomic step in Redis, so a user either gets
  every seat they asked for or none of them, with no window for another request to slip in.
  KEYS[1] = the user's hold session (a set of seat keys), KEYS[2..] = the seat keys.
  ARGV[1] = user id, ARGV[2] = ttl, ARGV[3..] = seat ids (same order as KEYS[2..]).
  Starting a new hold releases the user's previous hold for this show.
*/
const HOLD_LUA = `
local user = ARGV[1]
local ttl = tonumber(ARGV[2])
for i = 2, #KEYS do
  local owner = redis.call('GET', KEYS[i])
  if owner and owner ~= user then return {0, ARGV[i + 1]} end
end
local previous = redis.call('SMEMBERS', KEYS[1])
for _, key in ipairs(previous) do
  if redis.call('GET', key) == user then redis.call('DEL', key) end
end
redis.call('DEL', KEYS[1])
for i = 2, #KEYS do
  redis.call('SET', KEYS[i], user, 'EX', ttl)
  redis.call('SADD', KEYS[1], KEYS[i])
end
redis.call('EXPIRE', KEYS[1], ttl)
return {1}
`;

// Releases only the seats this user owns (compare-and-delete).
export const RELEASE_LUA = `
local released = 0
local keys = redis.call('SMEMBERS', KEYS[1])
for _, key in ipairs(keys) do
  if redis.call('GET', key) == ARGV[1] then redis.call('DEL', key); released = released + 1 end
end
redis.call('DEL', KEYS[1])
return released
`;

export async function releaseSession(showId, userId) {
  return redis.eval(RELEASE_LUA, 1, sessionKey(showId, userId), String(userId));
}

async function acquireHold(showId, userId, seatIds) {
  const keys = [sessionKey(showId, userId), ...seatIds.map((id) => holdKey(showId, id))];
  const result = await redis.eval(
    HOLD_LUA,
    keys.length,
    ...keys,
    String(userId),
    String(HOLD_TTL_SECONDS),
    ...seatIds.map(String),
  );
  if (result[0] !== 1) {
    const { rows } = await pool.query("SELECT row_label || seat_number AS label FROM seats WHERE id = $1", [result[1]]);
    throw new HttpError(409, `Seat ${rows[0]?.label ?? result[1]} was just taken by someone else. Pick another seat.`, {
      conflict_seat_id: Number(result[1]),
    });
  }
}

export class ShowService {
  // Static show details change rarely, so they are read through a one-hour Redis cache.
  static async getShowInfo(showId) {
    const cacheKey = `showinfo:v2:${showId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const { rows } = await pool.query(
      `SELECT s.id AS show_id, s.start_time, s.end_time, s.base_price,
              e.id AS event_id, e.title, e.kind, e.language, e.age_rating, e.accent,
              sc.id AS screen_id, sc.name AS screen_name,
              v.name AS venue_name, v.address AS venue_address, v.city
         FROM shows s
         JOIN events e ON e.id = s.event_id
         JOIN screens sc ON sc.id = s.screen_id
         JOIN venues v ON v.id = sc.venue_id
        WHERE s.id = $1`,
      [showId],
    );
    if (!rows[0]) return null;
    const info = { ...rows[0], base_price: Number(rows[0].base_price) };
    await redis.set(cacheKey, JSON.stringify(info), "EX", 3600);
    return info;
  }

  static async requireShow(showId) {
    const show = await this.getShowInfo(showId);
    if (!show) throw new HttpError(404, "Show not found.");
    return show;
  }

  static assertBookable(show) {
    if (new Date(show.start_time) <= new Date()) throw new HttpError(400, "This show has already started.");
  }

  // Seat map = Postgres (booked) merged with Redis (held). Other people's ids are never exposed.
  static async getSeatMap(showId, userId = null) {
    const show = await this.requireShow(showId);

    const { rows } = await pool.query(
      `SELECT st.id AS seat_id, st.row_label, st.seat_number, st.tier,
              EXISTS (SELECT 1 FROM booking_seats bs
                       WHERE bs.show_id = $1 AND bs.seat_id = st.id AND bs.active) AS is_booked
         FROM seats st
        WHERE st.screen_id = $2
        ORDER BY st.row_label, st.seat_number`,
      [showId, show.screen_id],
    );

    const owners = rows.length ? await redis.mget(rows.map((s) => holdKey(showId, s.seat_id))) : [];

    const seats = rows.map((s, i) => {
      const owner = owners[i];
      const status = s.is_booked ? "booked" : owner ? "held" : "available";
      return {
        seat_id: s.seat_id,
        row: s.row_label,
        number: s.seat_number,
        tier: s.tier,
        price: priceFor(show.base_price, s.tier),
        status,
        mine: status === "held" && userId !== null && owner === String(userId),
      };
    });

    let myHold = null;
    const mine = seats.filter((s) => s.mine).map((s) => s.seat_id);
    if (mine.length) {
      const ttl = await redis.ttl(sessionKey(showId, userId));
      if (ttl > 0) myHold = { seat_ids: mine, expires_in: ttl };
    }

    return {
      show,
      seats,
      my_hold: myHold,
      pricing: { fee_per_ticket: FEE_PER_TICKET, max_seats: MAX_SEATS_PER_BOOKING, hold_seconds: HOLD_TTL_SECONDS },
    };
  }

  /*
    Hold seats. Two interchangeable strategies, so you can benchmark them:
      redis    - one atomic Lua script (fastest)
      postgres - a row lock on the seats first (FOR UPDATE NOWAIT), then the same Redis hold
  */
  static async holdSeats(showId, rawSeatIds, user, strategy = "redis") {
    const seatIds = toSeatIdList(rawSeatIds, MAX_SEATS_PER_BOOKING);
    if (!seatIds) {
      throw new HttpError(400, `Choose between 1 and ${MAX_SEATS_PER_BOOKING} seats.`);
    }
    const show = await this.requireShow(showId);
    this.assertBookable(show);

    const owned = await pool.query("SELECT id FROM seats WHERE screen_id = $1 AND id = ANY($2::int[])", [
      show.screen_id,
      seatIds,
    ]);
    if (owned.rowCount !== seatIds.length) throw new HttpError(400, "One or more seats don't belong to this show.");

    const booked = await pool.query(
      "SELECT seat_id FROM booking_seats WHERE show_id = $1 AND seat_id = ANY($2::int[]) AND active",
      [showId, seatIds],
    );
    if (booked.rowCount) {
      throw new HttpError(409, "Some of those seats were just booked. Pick different seats.", {
        conflict_seat_id: booked.rows[0].seat_id,
      });
    }

    if (strategy === "postgres") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT id FROM seats WHERE id = ANY($1::int[]) FOR UPDATE NOWAIT", [seatIds]);
        await acquireHold(showId, user.id, seatIds);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        if (err.code === "55P03") throw new HttpError(409, "Those seats are being reserved by someone else right now.");
        throw err;
      } finally {
        client.release();
      }
    } else {
      await acquireHold(showId, user.id, seatIds);
    }

    publishSeatChange(showId);
    return { seat_ids: seatIds, expires_in: HOLD_TTL_SECONDS, strategy: strategy === "postgres" ? "postgres" : "redis" };
  }

  static async releaseHold(showId, userId) {
    const released = await releaseSession(showId, userId);
    if (released) publishSeatChange(showId);
    return { released };
  }

  // Price preview for seats the user is holding (supports a coupon code).
  static async quote(showId, rawSeatIds, couponCode, db = pool) {
    const seatIds = toSeatIdList(rawSeatIds, MAX_SEATS_PER_BOOKING);
    if (!seatIds) throw new HttpError(400, `Choose between 1 and ${MAX_SEATS_PER_BOOKING} seats.`);
    const show = await this.requireShow(showId);

    const { rows: seats } = await db.query(
      `SELECT id, row_label, seat_number, tier FROM seats
        WHERE screen_id = $1 AND id = ANY($2::int[]) ORDER BY row_label, seat_number`,
      [show.screen_id, seatIds],
    );
    if (seats.length !== seatIds.length) throw new HttpError(400, "One or more seats don't belong to this show.");

    const subtotal = seats.reduce((sum, s) => sum + priceFor(show.base_price, s.tier), 0);
    const { coupon, discount } = await resolveCoupon(db, couponCode, subtotal);
    const quote = buildQuote({ basePrice: show.base_price, seats, discount });
    return { ...quote, coupon: coupon ? { code: coupon.code, description: coupon.description } : null };
  }
}
