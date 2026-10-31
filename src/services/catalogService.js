import { pool } from "../config/db.js";
import { HttpError } from "../utils/httpError.js";
import { priceFor } from "../utils/pricing.js";

const KINDS = ["movie", "concert", "comedy", "sports", "theatre"];

export async function listCities() {
  const { rows } = await pool.query("SELECT DISTINCT city FROM venues ORDER BY city");
  return rows.map((r) => r.city);
}

// Events that still have upcoming shows, optionally narrowed by city, kind, language or search text.
export async function listEvents({ kind, city, q, language }) {
  const params = [];
  const where = ["e.status = 'active'", "s.start_time > NOW()"];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };

  if (kind && KINDS.includes(kind)) add("e.kind = ?", kind);
  if (city) add("LOWER(v.city) = LOWER(?)", city);
  if (language) add("LOWER(e.language) = LOWER(?)", language);
  if (q) {
    params.push(`%${String(q).slice(0, 60)}%`);
    const n = params.length;
    where.push(`(e.title ILIKE $${n} OR array_to_string(e.genres, ' ') ILIKE $${n})`);
  }
  const sql = `
    SELECT e.id, e.kind, e.title, e.description, e.language, e.duration_min, e.age_rating,
           e.genres, e.accent, e.featured,
           MIN(s.start_time) AS next_show, MIN(s.base_price) AS price_from,
           COUNT(DISTINCT v.id)::int AS venue_count, COUNT(s.id)::int AS show_count
      FROM events e
      JOIN shows s ON s.event_id = e.id
      JOIN screens sc ON sc.id = s.screen_id
      JOIN venues v ON v.id = sc.venue_id
     WHERE ${where.join(" AND ")}
     GROUP BY e.id
     ORDER BY e.featured DESC, MIN(s.start_time) ASC`;

  const { rows } = await pool.query(sql, params);
  return rows.map((r) => ({ ...r, price_from: Number(r.price_from) }));
}

export async function getEvent(id, city) {
  const { rows } = await pool.query("SELECT * FROM events WHERE id = $1 AND status = 'active'", [id]);
  if (!rows[0]) throw new HttpError(404, "Event not found.");

  const params = [id];
  let cityClause = "";
  if (city) {
    params.push(city);
    cityClause = "AND LOWER(v.city) = LOWER($2)";
  }
  const { rows: shows } = await pool.query(
    `SELECT s.id, s.start_time, s.end_time, s.base_price,
            sc.name AS screen_name, v.id AS venue_id, v.name AS venue_name, v.address AS venue_address, v.city,
            (SELECT COUNT(*) FROM seats st WHERE st.screen_id = sc.id)::int AS capacity,
            (SELECT COUNT(*) FROM booking_seats bs WHERE bs.show_id = s.id AND bs.active)::int AS booked
       FROM shows s
       JOIN screens sc ON sc.id = s.screen_id
       JOIN venues v ON v.id = sc.venue_id
      WHERE s.event_id = $1 AND s.start_time > NOW() ${cityClause}
      ORDER BY s.start_time`,
    params,
  );

  return {
    event: rows[0],
    shows: shows.map((s) => ({
      ...s,
      base_price: Number(s.base_price),
      price_to: priceFor(s.base_price, "vip"),
      seats_left: s.capacity - s.booked,
    })),
  };
}
