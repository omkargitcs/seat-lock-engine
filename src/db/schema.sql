-- SeatDrop schema. Running this DROPS and recreates every table (see db:init).
DROP TABLE IF EXISTS booking_seats CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS coupons CASCADE;
DROP TABLE IF EXISTS shows CASCADE;
DROP TABLE IF EXISTS seats CASCADE;
DROP TABLE IF EXISTS screens CASCADE;
DROP TABLE IF EXISTS venues CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(60)  NOT NULL,
  email         VARCHAR(120) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  role          VARCHAR(10)  NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE venues (
  id      SERIAL PRIMARY KEY,
  name    VARCHAR(255) NOT NULL,
  address TEXT         NOT NULL,
  city    VARCHAR(80)  NOT NULL
);

CREATE TABLE screens (
  id            SERIAL PRIMARY KEY,
  venue_id      INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  total_rows    INT NOT NULL,
  total_columns INT NOT NULL
);

-- standard / premium / vip drive the price multiplier (see utils/pricing.js)
CREATE TABLE seats (
  id          SERIAL PRIMARY KEY,
  screen_id   INT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  row_label   VARCHAR(2) NOT NULL,
  seat_number INT NOT NULL,
  tier        VARCHAR(10) NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard', 'premium', 'vip')),
  UNIQUE (screen_id, row_label, seat_number)
);

-- One catalogue entry: a movie, concert, comedy night, sports fixture or play.
CREATE TABLE events (
  id           SERIAL PRIMARY KEY,
  kind         VARCHAR(10) NOT NULL CHECK (kind IN ('movie', 'concert', 'comedy', 'sports', 'theatre')),
  title        VARCHAR(160) NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  language     VARCHAR(30) NOT NULL DEFAULT 'English',
  duration_min INT NOT NULL CHECK (duration_min > 0),
  age_rating   VARCHAR(6) NOT NULL DEFAULT 'U',
  genres       TEXT[] NOT NULL DEFAULT '{}',
  accent       VARCHAR(7) NOT NULL DEFAULT '#7A3FF2',
  featured     BOOLEAN NOT NULL DEFAULT FALSE,
  status       VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shows (
  id         SERIAL PRIMARY KEY,
  event_id   INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  screen_id  INT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time   TIMESTAMPTZ NOT NULL,
  base_price NUMERIC(10, 2) NOT NULL CHECK (base_price >= 0)
);
CREATE INDEX idx_shows_event_start ON shows (event_id, start_time);
CREATE INDEX idx_shows_screen_time ON shows (screen_id, start_time);

CREATE TABLE coupons (
  code         VARCHAR(30) PRIMARY KEY,
  description  TEXT NOT NULL,
  percent_off  INT NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
  max_discount NUMERIC(10, 2),
  min_amount   NUMERIC(10, 2) NOT NULL DEFAULT 0,
  valid_until  TIMESTAMPTZ,
  usage_limit  INT,
  used_count   INT NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE bookings (
  id             SERIAL PRIMARY KEY,
  reference      VARCHAR(16) NOT NULL UNIQUE,
  user_id        INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  show_id        INT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  subtotal       NUMERIC(10, 2) NOT NULL,
  discount       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  fee            NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_amount   NUMERIC(10, 2) NOT NULL,
  coupon_code    VARCHAR(30),
  payment_ref    VARCHAR(100) NOT NULL UNIQUE,
  payment_method VARCHAR(12) NOT NULL,
  status         VARCHAR(10) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  refund_amount  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  cancelled_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bookings_user ON bookings (user_id, created_at DESC);

-- show_id is stored here so the database itself can refuse a double booking.
CREATE TABLE booking_seats (
  booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  show_id    INT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  seat_id    INT NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
  price      NUMERIC(10, 2) NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (booking_id, seat_id)
);
-- The last line of defence: a seat can have at most one ACTIVE booking per show,
-- even if a Redis hold expires at exactly the wrong moment.
CREATE UNIQUE INDEX uniq_active_seat ON booking_seats (show_id, seat_id) WHERE active;
CREATE INDEX idx_booking_seats_show ON booking_seats (show_id) WHERE active;
