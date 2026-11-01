import bcrypt from "bcryptjs";
import { generateReference } from "../utils/reference.js";
import { FEE_PER_TICKET, priceFor } from "../utils/pricing.js";

// Small deterministic PRNG so every fresh seed looks the same.
const mulberry32 = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const VENUES = [
  {
    city: "Mumbai",
    name: "Lumen Cinemas, Lower Parel",
    address: "Senapati Bapat Marg, Lower Parel",
    kind: "cinema",
    screens: 2,
  },
  {
    city: "Mumbai",
    name: "Harbor Arena, Bandra",
    address: "Bandra Reclamation, Bandra West",
    kind: "arena",
    screens: 1,
  },
  {
    city: "Delhi",
    name: "Lumen Cinemas, Saket",
    address: "District Centre, Saket",
    kind: "cinema",
    screens: 2,
  },
  {
    city: "Delhi",
    name: "Capital Arena, Dwarka",
    address: "Sector 10, Dwarka",
    kind: "arena",
    screens: 1,
  },
  {
    city: "Bengaluru",
    name: "Lumen Cinemas, Indiranagar",
    address: "100 Feet Road, Indiranagar",
    kind: "cinema",
    screens: 2,
  },
  {
    city: "Bengaluru",
    name: "Garden Hall, Koramangala",
    address: "5th Block, Koramangala",
    kind: "arena",
    screens: 1,
  },
];

const EVENTS = [
  {
    kind: "movie",
    title: "The Last Lighthouse",
    language: "English",
    duration_min: 128,
    age_rating: "UA",
    genres: ["Thriller", "Mystery"],
    accent: "#1F5F7A",
    featured: true,
    base: 320,
    description:
      "A relief keeper arrives at a remote lighthouse to find the logbook already written for the nights ahead. A slow-burn thriller about isolation, memory and the sea.",
  },
  {
    kind: "movie",
    title: "Monsoon Express",
    language: "Hindi",
    duration_min: 142,
    age_rating: "U",
    genres: ["Comedy", "Family"],
    accent: "#C2571A",
    base: 280,
    description:
      "Four strangers, one delayed train and a week of rain. A warm ensemble comedy about the people you meet when the schedule falls apart.",
  },
  {
    kind: "movie",
    title: "Neon District",
    language: "English",
    duration_min: 118,
    age_rating: "UA",
    genres: ["Sci-Fi", "Action"],
    accent: "#7A2FD1",
    base: 340,
    description:
      "In a city that never switches off, a courier discovers the package she is carrying is a person's missing memory.",
  },
  {
    kind: "movie",
    title: "Paper Moons",
    language: "Hindi",
    duration_min: 134,
    age_rating: "UA",
    genres: ["Drama", "Romance"],
    accent: "#B03A5B",
    base: 300,
    description:
      "Two film-set painters fall for each other across thirty years of Mumbai studio life. A tender, grown-up love story.",
  },
  {
    kind: "movie",
    title: "Kaveri Calling",
    language: "Kannada",
    duration_min: 126,
    age_rating: "U",
    genres: ["Family", "Adventure"],
    accent: "#2E7D4F",
    base: 260,
    description:
      "A schoolgirl follows a river from its source to the sea to bring her grandfather's voice home.",
  },
  {
    kind: "concert",
    title: "Aarav & The Static, Live",
    language: "English",
    duration_min: 150,
    age_rating: "U",
    genres: ["Indie", "Live Music"],
    accent: "#D4382C",
    base: 900,
    description:
      "The indie favourites play their full new album plus the songs you came for. Doors open an hour before the first note.",
  },
  {
    kind: "comedy",
    title: "Standup Saturday: Meera Iyer",
    language: "English",
    duration_min: 90,
    age_rating: "UA",
    genres: ["Standup", "Comedy"],
    accent: "#D99A12",
    base: 600,
    description:
      "Ninety minutes of observational comedy about commutes, cousins and cloud storage. Contains strong language.",
  },
  {
    kind: "sports",
    title: "City Futsal League Final",
    language: "English",
    duration_min: 120,
    age_rating: "U",
    genres: ["Futsal", "Live Sports"],
    accent: "#127E8C",
    base: 450,
    description:
      "The two best teams of the season meet in the final. Fast, loud and ten metres from the pitch.",
  },
  {
    kind: "theatre",
    title: "The Merchant of Bandra",
    language: "Hindi",
    duration_min: 120,
    age_rating: "U",
    genres: ["Theatre", "Drama"],
    accent: "#8A3F2B",
    base: 500,
    description:
      "A new stage adaptation that moves a classic to a Bandra chawl. Sharp, funny and unexpectedly moving.",
  },
];

const COUPONS = [
  {
    code: "WELCOME10",
    description: "10% off your first booking, up to ₹150",
    percent_off: 10,
    max_discount: 150,
    min_amount: 300,
  },
  {
    code: "WEEKEND20",
    description: "20% off tickets worth ₹800 or more, up to ₹300",
    percent_off: 20,
    max_discount: 300,
    min_amount: 800,
  },
  {
    code: "FIRSTSHOW",
    description: "15% off, up to ₹200",
    percent_off: 15,
    max_discount: 200,
    min_amount: 0,
  },
];

const istDate = (date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);

export async function seedDatabase(pool, log = console.log) {
  const rand = mulberry32(2024);
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@12345";
  const demoPassword = process.env.SEED_DEMO_PASSWORD || "Demo@12345";
  const rounds = Number(process.env.BCRYPT_ROUNDS) || 10;

  // users
  const hash = (p) => bcrypt.hash(p, rounds);
  const { rows: users } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES
       ('SeatDrop Admin', 'admin@seatdrop.dev', $1, 'admin'),
       ('Demo User', 'demo@seatdrop.dev', $2, 'user'),
       ('Walk-in Guest', 'walkin@seatdrop.local', $3, 'user')
     RETURNING id, email`,
    [
      await hash(adminPassword),
      await hash(demoPassword),
      await hash(`walkin-${Math.random()}`),
    ],
  );
  const walkIn = users.find((u) => u.email === "walkin@seatdrop.local").id;

  // venues, screens, seats
  const screens = [];
  for (const v of VENUES) {
    const { rows } = await pool.query(
      "INSERT INTO venues (name, address, city) VALUES ($1, $2, $3) RETURNING id",
      [v.name, v.address, v.city],
    );
    for (let n = 1; n <= v.screens; n++) {
      const rowsCount = v.kind === "cinema" ? 8 : 10;
      const cols = v.kind === "cinema" ? 12 : 16;
      const name = v.kind === "cinema" ? `Screen ${n}` : "Main Hall";
      const { rows: sc } = await pool.query(
        "INSERT INTO screens (venue_id, name, total_rows, total_columns) VALUES ($1, $2, $3, $4) RETURNING id",
        [rows[0].id, name, rowsCount, cols],
      );
      await pool.query(
        `INSERT INTO seats (screen_id, row_label, seat_number, tier)
         SELECT $1, chr(64 + r), c,
                CASE WHEN r <= $2::int * 0.4 THEN 'standard' WHEN r <= $2::int * 0.8 THEN 'premium' ELSE 'vip' END
           FROM generate_series(1, $2::int) r, generate_series(1, $3::int) c`,
        [sc[0].id, rowsCount, cols],
      );
      screens.push({ id: sc[0].id, kind: v.kind });
    }
  }

  // events
  const events = [];
  for (const e of EVENTS) {
    const { rows } = await pool.query(
      `INSERT INTO events (kind, title, description, language, duration_min, age_rating, genres, accent, featured)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        e.kind,
        e.title,
        e.description,
        e.language,
        e.duration_min,
        e.age_rating,
        e.genres,
        e.accent,
        !!e.featured,
      ],
    );
    events.push({ ...e, id: rows[0].id });
  }
  const movies = events.filter((e) => e.kind === "movie");
  const live = events.filter((e) => e.kind !== "movie");

  // shows: six days ahead, four slots a day per cinema screen, one evening show per arena
  const SLOTS = ["10:30", "14:00", "17:30", "21:00"];
  let shows = [];
  const cinemas = screens.filter((s) => s.kind === "cinema");
  const arenas = screens.filter((s) => s.kind === "arena");
  const minStart = Date.now() + 90 * 60_000;

  const pending = [];
  const addShow = async (event, screen, day, time, price) => {
    const start = new Date(
      `${istDate(new Date(Date.now() + day * 86_400_000))}T${time}:00+05:30`,
    );
    if (start.getTime() < minStart) return;
    const end = new Date(start.getTime() + event.duration_min * 60_000);
    pending.push({
      event_id: event.id,
      screen_id: screen.id,
      start: start.toISOString(),
      end: end.toISOString(),
      price,
    });
  };

  for (let day = 0; day < 6; day++) {
    for (let si = 0; si < cinemas.length; si++) {
      for (let ti = 0; ti < SLOTS.length; ti++) {
        const movie = movies[(si + ti + day) % movies.length];
        const price = ti === 3 ? movie.base + 40 : movie.base; // late shows cost a little more
        await addShow(movie, cinemas[si], day, SLOTS[ti], price);
      }
    }
    for (let ai = 0; ai < arenas.length; ai++) {
      const event = live[(ai + day) % live.length];
      await addShow(event, arenas[ai], day, "19:00", event.base);
    }
  }

  // every show in one round trip
  const { rows: insertedShows } = await pool.query(
    `INSERT INTO shows (event_id, screen_id, start_time, end_time, base_price)
     SELECT * FROM unnest($1::int[], $2::int[], $3::timestamptz[], $4::timestamptz[], $5::numeric[])
     RETURNING id, screen_id, base_price`,
    [
      pending.map((x) => x.event_id),
      pending.map((x) => x.screen_id),
      pending.map((x) => x.start),
      pending.map((x) => x.end),
      pending.map((x) => x.price),
    ],
  );
  shows = insertedShows.map((r) => ({
    id: r.id,
    screen_id: r.screen_id,
    base_price: Number(r.base_price),
  }));

  // pre-booked seats so the maps look lived in
  const seatsByScreen = new Map();
  for (const sc of screens) {
    const { rows } = await pool.query(
      "SELECT id, tier FROM seats WHERE screen_id = $1 ORDER BY row_label, seat_number",
      [sc.id],
    );
    seatsByScreen.set(sc.id, rows);
  }
  const bk = {
    reference: [],
    show: [],
    subtotal: [],
    fee: [],
    total: [],
    pref: [],
  };
  const bseats = [];
  for (const show of shows) {
    const seats = [...seatsByScreen.get(show.screen_id)].sort(
      () => rand() - 0.5,
    );
    let target = Math.floor(seats.length * (0.1 + rand() * 0.6));
    let cursor = 0;
    let n = 0;
    while (target > 0) {
      const size = Math.min(target, 1 + Math.floor(rand() * 4));
      const group = seats.slice(cursor, cursor + size);
      cursor += size;
      target -= size;
      const prices = group.map((s) => priceFor(show.base_price, s.tier));
      const subtotal = prices.reduce((a, b) => a + b, 0);
      const fee = FEE_PER_TICKET * group.length;
      const pref = `seed_${show.id}_${n++}`;
      bk.reference.push(generateReference());
      bk.show.push(show.id);
      bk.subtotal.push(subtotal);
      bk.fee.push(fee);
      bk.total.push(subtotal + fee);
      bk.pref.push(pref);
      group.forEach((seat, i) =>
        bseats.push({
          pref,
          show_id: show.id,
          seat_id: seat.id,
          price: prices[i],
        }),
      );
    }
  }

  // all bookings, then all their seats: two round trips instead of thousands
  const { rows: insertedBookings } = await pool.query(
    `INSERT INTO bookings (reference, user_id, show_id, subtotal, discount, fee, total_amount, payment_ref, payment_method)
     SELECT x.reference, $1::int, x.show_id, x.subtotal, 0, x.fee, x.total, x.pref, 'upi'
       FROM unnest($2::text[], $3::int[], $4::numeric[], $5::numeric[], $6::numeric[], $7::text[])
            AS x(reference, show_id, subtotal, fee, total, pref)
     RETURNING id, payment_ref`,
    [walkIn, bk.reference, bk.show, bk.subtotal, bk.fee, bk.total, bk.pref],
  );
  const idByRef = new Map(insertedBookings.map((r) => [r.payment_ref, r.id]));
  await pool.query(
    `INSERT INTO booking_seats (booking_id, show_id, seat_id, price)
     SELECT * FROM unnest($1::int[], $2::int[], $3::int[], $4::numeric[])`,
    [
      bseats.map((b) => idByRef.get(b.pref)),
      bseats.map((b) => b.show_id),
      bseats.map((b) => b.seat_id),
      bseats.map((b) => b.price),
    ],
  );

  for (const c of COUPONS) {
    await pool.query(
      "INSERT INTO coupons (code, description, percent_off, max_discount, min_amount) VALUES ($1, $2, $3, $4, $5)",
      [c.code, c.description, c.percent_off, c.max_discount, c.min_amount],
    );
  }

  log(
    `Seeded ${VENUES.length} venues, ${screens.length} screens, ${events.length} events, ${shows.length} shows.`,
  );
  log(`Admin login: admin@seatdrop.dev / ${adminPassword}`);
  log(`Demo login:  demo@seatdrop.dev / ${demoPassword}`);
}
