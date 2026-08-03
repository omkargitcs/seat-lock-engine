DROP TABLE IF EXISTS booking_seats CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS seats CASCADE;
DROP TABLE IF EXISTS shows CASCADE;
DROP TABLE IF EXISTS screens CASCADE;
DROP TABLE IF EXISTS venues CASCADE;

CREATE TABLE venues (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL
);

CREATE TABLE screens (
  id SERIAL PRIMARY KEY,
  venue_id INT REFERENCES venues(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  total_rows INT NOT NULL,
  total_columns INT NOT NULL
);

CREATE TABLE shows (
  id SERIAL PRIMARY KEY,
  screen_id INT REFERENCES screens(id) ON DELETE CASCADE,
  movie_name VARCHAR(255) NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  base_price NUMERIC(10, 2) NOT NULL
);

CREATE TABLE seats (
  id SERIAL PRIMARY KEY,
  screen_id INT REFERENCES screens(id) ON DELETE CASCADE,
  row_label VARCHAR(5) NOT NULL,
  seat_number INT NOT NULL,
  seat_type VARCHAR(20) DEFAULT 'regular' CHECK (seat_type IN ('regular', 'premium'))
);

CREATE TABLE bookings (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  show_id INT REFERENCES shows(id) ON DELETE CASCADE,
  total_amount NUMERIC(10, 2) NOT NULL,
  payment_ref VARCHAR(255) UNIQUE,
  status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE booking_seats (
  booking_id INT REFERENCES bookings(id) ON DELETE CASCADE,
  seat_id INT REFERENCES seats(id) ON DELETE CASCADE,
  PRIMARY KEY (booking_id, seat_id)
);