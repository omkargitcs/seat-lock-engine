import { pool } from "../config/db.js";
import { HttpError, toPositiveInt } from "../utils/httpError.js";

const KINDS = ["movie", "concert", "comedy", "sports", "theatre"];
const HEX = /^#[0-9a-fA-F]{6}$/;

export async function getStats() {
  const [totals, upcoming, byDay, topShows, recent] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_bookings,
              COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_bookings,
              COALESCE(SUM(total_amount - refund_amount), 0)::float AS net_revenue,
              COALESCE(SUM(refund_amount), 0)::float AS refunded
         FROM bookings`,
    ),
    pool.query(
      `SELECT (SELECT COUNT(*) FROM shows WHERE start_time > NOW())::int AS upcoming_shows,
              (SELECT COUNT(*) FROM booking_seats bs JOIN shows s ON s.id = bs.show_id
                WHERE bs.active AND s.start_time > NOW())::int AS tickets_upcoming,
              (SELECT COUNT(*) FROM users)::int AS users`,
    ),
    pool.query(
      `SELECT to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
              SUM(total_amount - refund_amount)::float AS revenue
         FROM bookings WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY 1 ORDER BY 1`,
    ),
    pool.query(
      `SELECT s.id, e.title, e.kind, v.name AS venue_name, v.city, s.start_time,
              cap.n AS capacity, COALESCE(sold.n, 0)::int AS sold
         FROM shows s
         JOIN events e ON e.id = s.event_id
         JOIN screens sc ON sc.id = s.screen_id
         JOIN venues v ON v.id = sc.venue_id
         CROSS JOIN LATERAL (SELECT COUNT(*)::int AS n FROM seats WHERE screen_id = sc.id) cap
         LEFT JOIN LATERAL (SELECT COUNT(*) AS n FROM booking_seats WHERE show_id = s.id AND active) sold ON TRUE
        WHERE s.start_time > NOW()
        ORDER BY COALESCE(sold.n, 0)::float / NULLIF(cap.n, 0) DESC NULLS LAST, s.start_time
        LIMIT 8`,
    ),
    pool.query(
      `SELECT b.id, b.reference, b.status, b.total_amount::float AS total, b.created_at,
              u.email, e.title
         FROM bookings b JOIN users u ON u.id = b.user_id
         JOIN shows s ON s.id = b.show_id JOIN events e ON e.id = s.event_id
        ORDER BY b.created_at DESC LIMIT 8`,
    ),
  ]);

  return {
    totals: { ...totals.rows[0], ...upcoming.rows[0] },
    revenue_by_day: byDay.rows,
    top_shows: topShows.rows,
    recent_bookings: recent.rows,
  };
}

export async function listEventsAdmin() {
  const { rows } = await pool.query(
    `SELECT e.*, (SELECT COUNT(*) FROM shows s WHERE s.event_id = e.id AND s.start_time > NOW())::int AS upcoming_shows
       FROM events e ORDER BY e.created_at DESC`,
  );
  return rows;
}

export async function listScreens() {
  const { rows } = await pool.query(
    `SELECT sc.id, sc.name, sc.total_rows, sc.total_columns, v.name AS venue_name, v.city
       FROM screens sc JOIN venues v ON v.id = sc.venue_id ORDER BY v.city, v.name, sc.name`,
  );
  return rows;
}

export async function createEvent(body) {
  const title = String(body.title || "").trim();
  const kind = String(body.kind || "");
  const duration = toPositiveInt(body.duration_min);
  if (title.length < 2 || title.length > 160) throw new HttpError(400, "Enter a title.");
  if (!KINDS.includes(kind)) throw new HttpError(400, "Choose a valid type.");
  if (!duration || duration > 600) throw new HttpError(400, "Enter a duration in minutes.");

  const genres = String(body.genres || "").split(",").map((g) => g.trim()).filter(Boolean).slice(0, 5);
  const accent = HEX.test(body.accent || "") ? body.accent : "#7A3FF2";
  const { rows } = await pool.query(
    `INSERT INTO events (kind, title, description, language, duration_min, age_rating, genres, accent, featured)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [kind, title, String(body.description || "").slice(0, 2000), String(body.language || "English").slice(0, 30),
     duration, String(body.age_rating || "U").slice(0, 6), genres, accent, Boolean(body.featured)],
  );
  return rows[0];
}

export async function updateEvent(id, body) {
  const fields = [];
  const values = [id];
  if (typeof body.featured === "boolean") { values.push(body.featured); fields.push(`featured = $${values.length}`); }
  if (["active", "archived"].includes(body.status)) { values.push(body.status); fields.push(`status = $${values.length}`); }
  if (!fields.length) throw new HttpError(400, "Nothing to update.");
  const { rows } = await pool.query(`UPDATE events SET ${fields.join(", ")} WHERE id = $1 RETURNING *`, values);
  if (!rows[0]) throw new HttpError(404, "Event not found.");
  return rows[0];
}

export async function createShow(body) {
  const eventId = toPositiveInt(body.event_id);
  const screenId = toPositiveInt(body.screen_id);
  const price = Number(body.base_price);
  const start = new Date(body.start_time);
  if (!eventId || !screenId) throw new HttpError(400, "Choose an event and a screen.");
  if (!Number.isFinite(price) || price < 0 || price > 100000) throw new HttpError(400, "Enter a valid base price.");
  if (Number.isNaN(start.getTime()) || start <= new Date()) throw new HttpError(400, "Pick a start time in the future.");

  const { rows: ev } = await pool.query("SELECT duration_min FROM events WHERE id = $1", [eventId]);
  if (!ev[0]) throw new HttpError(404, "Event not found.");
  const end = new Date(start.getTime() + ev[0].duration_min * 60_000);

  const clash = await pool.query(
    "SELECT 1 FROM shows WHERE screen_id = $1 AND tstzrange(start_time, end_time) && tstzrange($2, $3) LIMIT 1",
    [screenId, start.toISOString(), end.toISOString()],
  );
  if (clash.rowCount) throw new HttpError(409, "That screen already has a show at this time.");

  try {
    const { rows } = await pool.query(
      "INSERT INTO shows (event_id, screen_id, start_time, end_time, base_price) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [eventId, screenId, start.toISOString(), end.toISOString(), price],
    );
    return rows[0];
  } catch (err) {
    if (err.code === "23503") throw new HttpError(404, "Screen not found.");
    throw err;
  }
}
