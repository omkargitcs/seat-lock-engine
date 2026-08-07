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
        b.id IS NOT NULL AS is_booked
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
   * Phase 3 & 4: Hold seats with dual concurrency strategy
   */
  static async holdSeats(showId, seatIds, userId, strategy = "redis") {
    if (strategy === "postgres") {
      return await this.holdSeatsPostgres(showId, seatIds, userId);
    }
    return await this.holdSeatsRedis(showId, seatIds, userId);
  }

  // --- Strategy A: Redis Distributed Lock ---
  static async holdSeatsRedis(showId, seatIds, userId) {
    const holdDuration = 300; // 5 minutes TTL
    const acquiredLocks = [];

    try {
      for (const seatId of seatIds) {
        const lockKey = `hold:seat:${showId}:${seatId}`;

        // SET key user_id NX EX 300
        const result = await redis.set(
          lockKey,
          userId,
          "EX",
          holdDuration,
          "NX",
        );

        if (!result) {
          // Conflict detected: Rollback previous holds acquired in this request
          for (const rollbackKey of acquiredLocks) {
            await redis.del(rollbackKey);
          }
          return {
            success: false,
            error: `Seat ${seatId} is already held by another user.`,
            status: 409,
          };
        }
        acquiredLocks.push(lockKey);
      }

      await redis.del(`seatmap:${showId}`);

      return {
        success: true,
        message: "Seats held successfully via Redis lock",
        held_seats: seatIds,
        expires_in_seconds: holdDuration,
      };
    } catch (err) {
      for (const rollbackKey of acquiredLocks) {
        await redis.del(rollbackKey);
      }
      throw err;
    }
  }

  // --- Strategy B: PostgreSQL Row-Level Lock ---
  static async holdSeatsPostgres(showId, seatIds, userId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if seats are already booked in DB
      const bookedCheck = await client.query(
        `SELECT seat_id FROM booking_seats bs
         JOIN bookings b ON bs.booking_id = b.id
         WHERE b.show_id = $1 AND bs.seat_id = ANY($2::int[]) AND b.status = 'confirmed'`,
        [showId, seatIds],
      );

      if (bookedCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return {
          success: false,
          error: `Seat ${bookedCheck.rows[0].seat_id} is already confirmed booked.`,
          status: 409,
        };
      }

      // Lock DB rows with NOWAIT
      const lockQuery = `
        SELECT id FROM seats 
        WHERE id = ANY($1::int[]) AND screen_id = (SELECT screen_id FROM shows WHERE id = $2)
        FOR UPDATE NOWAIT
      `;
      await client.query(lockQuery, [seatIds, showId]);

      const holdDuration = 300;
      for (const seatId of seatIds) {
        const lockKey = `hold:seat:${showId}:${seatId}`;
        const setRes = await redis.set(
          lockKey,
          userId,
          "EX",
          holdDuration,
          "NX",
        );
        if (!setRes) {
          await client.query("ROLLBACK");
          return {
            success: false,
            error: `Seat ${seatId} is already held by another user.`,
            status: 409,
          };
        }
      }

      await client.query("COMMIT");
      await redis.del(`seatmap:${showId}`);

      return {
        success: true,
        message: "Seats held successfully via PostgreSQL Row Lock",
        held_seats: seatIds,
        expires_in_seconds: holdDuration,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.code === "55P03") {
        return {
          success: false,
          error: "Seats are currently locked by another transaction.",
          status: 409,
        };
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Phase 2 / Confirm Endpoint: Idempotent Postgres Confirmation
   */
  static async confirmBooking(showId, seatIds, userId, paymentRef) {
    const client = await pool.connect();

    try {
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

      // Idempotency check
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

      const showRes = await client.query(
        `SELECT base_price FROM shows WHERE id = $1`,
        [showId],
      );
      const totalAmount = Number(showRes.rows[0].base_price) * seatIds.length;

      const bookingRes = await client.query(
        `INSERT INTO bookings (user_id, show_id, total_amount, payment_ref, status)
         VALUES ($1, $2, $3, $4, 'confirmed') RETURNING id, created_at`,
        [userId, showId, totalAmount, paymentRef],
      );
      const bookingId = bookingRes.rows[0].id;

      for (const seatId of seatIds) {
        await client.query(
          `INSERT INTO booking_seats (booking_id, seat_id) VALUES ($1, $2)`,
          [bookingId, seatId],
        );
      }

      await client.query("COMMIT");

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

      await client.query(
        `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
        [bookingId],
      );

      await client.query("COMMIT");

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
