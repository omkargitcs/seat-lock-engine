import { pool } from "../config/db.js";
import { redis } from "../config/redis.js";

export class ShowService {
  /**
   * Phase 1: Static Read-Through Cache
   */
  static async getShowInfo(showId) {
    const cacheKey = `showinfo:${showId}`;
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      return { source: "cache", data: JSON.parse(cachedData) };
    }

    const query = `
      SELECT 
        s.id AS show_id, s.movie_name, s.start_time, s.end_time, s.base_price,
        sc.name AS screen_name, v.name AS venue_name, v.address AS venue_address
      FROM shows s
      JOIN screens sc ON s.screen_id = sc.id
      JOIN venues v ON sc.venue_id = v.id
      WHERE s.id = $1
    `;
    const result = await pool.query(query, [showId]);
    if (result.rows.length === 0) return null;

    const showInfo = result.rows[0];
    await redis.set(cacheKey, JSON.stringify(showInfo), "EX", 3600);
    return { source: "database", data: showInfo };
  }

  /**
   * Phase 2 & 4: Get seats merged with live Redis hold status
   */
  static async getShowSeats(showId) {
    const query = `
      SELECT 
        st.id AS seat_id, st.row_label, st.seat_number, st.seat_type,
        bs.booking_id IS NOT NULL AS is_booked
      FROM seats st
      JOIN shows sh ON sh.screen_id = st.screen_id
      LEFT JOIN booking_seats bs ON bs.seat_id = st.id
      LEFT JOIN bookings b ON b.id = bs.booking_id AND b.show_id = $1 AND b.status = 'confirmed'
      WHERE sh.id = $1
      ORDER BY st.row_label, st.seat_number
    `;
    const result = await pool.query(query, [showId]);
    const seats = result.rows;

    // Fetch active holds from Redis for all seats in this show
    for (const seat of seats) {
      const holdKey = `hold:seat:${showId}:${seat.seat_id}`;
      const heldBy = await redis.get(holdKey);

      if (seat.is_booked) {
        seat.status = "booked";
      } else if (heldBy) {
        seat.status = "held";
        seat.held_by = heldBy;
      } else {
        seat.status = "available";
      }
      delete seat.is_booked;
    }

    return seats;
  }

  /**
   * Phase 3 (Primary Strategy): Atomic Redis Holds using SET NX EX
   */
  static async holdSeatsAtomic(showId, seatIds, userId) {
    const acquiredHolds = [];

    for (const seatId of seatIds) {
      const holdKey = `hold:seat:${showId}:${seatId}`;

      // Check if seat is already permanently booked in Postgres
      const bookedCheck = await pool.query(
        `SELECT 1 FROM booking_seats bs 
         JOIN bookings b ON b.id = bs.booking_id 
         WHERE b.show_id = $1 AND bs.seat_id = $2 AND b.status = 'confirmed'`,
        [showId, seatId],
      );

      if (bookedCheck.rows.length > 0) {
        // Rollback acquired holds if any seat is already booked
        for (const acquiredKey of acquiredHolds) {
          await redis.del(acquiredKey);
        }
        return {
          success: false,
          reason: `Seat ${seatId} is already permanently booked.`,
        };
      }

      // SET hold:seat:{show_id}:{seat_id} user_id NX EX 300 (5 mins TTL)
      const result = await redis.set(holdKey, userId, "EX", 300, "NX");

      if (result === "OK") {
        acquiredHolds.push(holdKey);
      } else {
        // Atomic acquisition failed! Rollback any holds acquired so far in this batch
        for (const acquiredKey of acquiredHolds) {
          await redis.del(acquiredKey);
        }
        return {
          success: false,
          reason: `Seat ${seatId} is already held by another user.`,
        };
      }
    }

    // Invalidate seat map cache if present
    await redis.del(`seatmap:${showId}`);

    return {
      success: true,
      held_seats: seatIds,
      expires_in_seconds: 300,
    };
  }

  /**
   * Phase 2 / Confirm Endpoint: Idempotent Postgres Confirmation
   */
  static async confirmBooking(showId, seatIds, userId, paymentRef) {
    const client = await pool.connect();

    try {
      // 1. Verify holds in Redis belong to requesting user
      for (const seatId of seatIds) {
        const holdKey = `hold:seat:${showId}:${seatId}`;
        const heldBy = await redis.get(holdKey);

        if (heldBy !== userId) {
          return {
            success: false,
            error: `Seat ${seatId} hold missing or expired.`,
          };
        }
      }

      await client.query("BEGIN");

      // 2. Idempotency Check on payment_ref
      const existingBooking = await client.query(
        `SELECT id, total_amount, status FROM bookings WHERE payment_ref = $1`,
        [paymentRef],
      );

      if (existingBooking.rows.length > 0) {
        await client.query("ROLLBACK");
        return {
          success: true,
          booking: existingBooking.rows[0],
          idempotent: true,
        };
      }

      // Calculate price
      const showRes = await client.query(
        `SELECT base_price FROM shows WHERE id = $1`,
        [showId],
      );
      const totalAmount = Number(showRes.rows[0].base_price) * seatIds.length;

      // 3. Create booking row
      const bookingRes = await client.query(
        `INSERT INTO bookings (user_id, show_id, total_amount, payment_ref, status)
         VALUES ($1, $2, $3, $4, 'confirmed') RETURNING id, created_at`,
        [userId, showId, totalAmount, paymentRef],
      );
      const bookingId = bookingRes.rows[0].id;

      // 4. Attach seats to booking
      for (const seatId of seatIds) {
        await client.query(
          `INSERT INTO booking_seats (booking_id, seat_id) VALUES ($1, $2)`,
          [bookingId, seatId],
        );
      }

      await client.query("COMMIT");

      // 5. Cleanup Redis holds & invalidate seatmap cache
      for (const seatId of seatIds) {
        await redis.del(`hold:seat:${showId}:${seatId}`);
      }
      await redis.del(`seatmap:${showId}`);

      return {
        success: true,
        booking: {
          id: bookingId,
          user_id: userId,
          show_id: showId,
          total_amount: totalAmount,
          payment_ref: paymentRef,
          created_at: bookingRes.rows[0].created_at,
        },
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  static async cancelBooking(bookingId, userId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Fetch booking & start time
      const bookingRes = await client.query(
        `SELECT b.id, b.show_id, b.status, s.start_time 
       FROM bookings b 
       JOIN shows s ON s.id = b.show_id 
       WHERE b.id = $1 AND b.user_id = $2`,
        [bookingId, userId],
      );

      if (bookingRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return { success: false, error: "Booking not found." };
      }

      const booking = bookingRes.rows[0];

      if (booking.status === "cancelled") {
        await client.query("ROLLBACK");
        return { success: false, error: "Booking is already cancelled." };
      }

      // 2. Cancellation Cutoff Window Rule (e.g., cannot cancel within 2 hours of show start)
      const currentTime = new Date();
      const showStartTime = new Date(booking.start_time);
      const hoursDifference = (showStartTime - currentTime) / (1000 * 60 * 60);

      if (hoursDifference < 2) {
        await client.query("ROLLBACK");
        return {
          success: false,
          error: "Cannot cancel within 2 hours of the show start time.",
        };
      }

      // 3. Mark booking as cancelled
      await client.query(
        `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
        [bookingId],
      );

      await client.query("COMMIT");

      // Invalidate seat map cache so the seat shows as available immediately
      await redis.del(`seatmap:${booking.show_id}`);

      return { success: true, message: "Booking cancelled successfully." };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
