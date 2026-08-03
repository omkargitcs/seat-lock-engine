INSERT INTO venues (name, address) VALUES
('PVR Phoenix', 'Lower Parel, Mumbai');

INSERT INTO screens (venue_id, name, total_rows, total_columns) VALUES
(1, 'Screen 1', 2, 5);

INSERT INTO shows (screen_id, movie_name, start_time, end_time, base_price) VALUES
(1, 'Avengers: Endgame', NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 3 hours', 350.00);

-- Generate seats for Screen 1 (Row A and B, 5 seats each)
INSERT INTO seats (screen_id, row_label, seat_number, seat_type) VALUES
(1, 'A', 1, 'regular'),
(1, 'A', 2, 'regular'),
(1, 'A', 3, 'regular'),
(1, 'A', 4, 'regular'),
(1, 'A', 5, 'regular'),
(1, 'B', 1, 'premium'),
(1, 'B', 2, 'premium'),
(1, 'B', 3, 'premium'),
(1, 'B', 4, 'premium'),
(1, 'B', 5, 'premium');