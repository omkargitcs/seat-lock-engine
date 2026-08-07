import React, { useState, useEffect } from "react";

const SHOW_ID = 1;
const USER_ID = "user_omkar";

export default function App() {
  const [showInfo, setShowInfo] = useState(null);
  const [seats, setSeats] = useState([]);
  const [selectedSeatIds, setSelectedSeatIds] = useState([]);
  const [heldSeatIds, setHeldSeatIds] = useState([]);
  const [holdTimer, setHoldTimer] = useState(0);
  const [strategy, setStrategy] = useState("redis");
  const [message, setMessage] = useState("");

  // Fetch show info and initial seat status
  const fetchSeatMap = async () => {
    try {
      const res = await fetch(`/shows/${SHOW_ID}/seats`);
      const data = await res.json();
      setSeats(data.seats || []);
    } catch (err) {
      console.error("Failed to load seats:", err);
    }
  };

  useEffect(() => {
    fetch(`/shows/${SHOW_ID}`)
      .then((res) => res.json())
      .then((data) => setShowInfo(data.data))
      .catch(console.error);

    fetchSeatMap();

    // Poll seat map every 3 seconds to get live status updates
    const interval = setInterval(fetchSeatMap, 3000);
    return () => clearInterval(interval);
  }, []);

  // Handle countdown timer for active holds
  useEffect(() => {
    if (holdTimer <= 0) return;
    const timer = setInterval(() => {
      setHoldTimer((prev) => {
        if (prev <= 1) {
          setHeldSeatIds([]);
          setMessage("Hold expired! Seats have been released.");
          fetchSeatMap();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [holdTimer]);

  // Handle seat selection toggle
  const toggleSeatSelection = (seatId) => {
    if (selectedSeatIds.includes(seatId)) {
      setSelectedSeatIds(selectedSeatIds.filter((id) => id !== seatId));
    } else {
      setSelectedSeatIds([...selectedSeatIds, seatId]);
    }
  };

  // Hold seats via API
  const handleHoldSeats = async () => {
    if (selectedSeatIds.length === 0) return;
    setMessage("");

    try {
      const res = await fetch(`/shows/${SHOW_ID}/hold?strategy=${strategy}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seat_ids: selectedSeatIds, user_id: USER_ID }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(`Hold failed: ${data.error}`);
        fetchSeatMap();
        return;
      }

      setHeldSeatIds(data.held_seats);
      setSelectedSeatIds([]);
      setHoldTimer(data.expires_in_seconds || 300);
      setMessage(
        `Seats held successfully via ${strategy.toUpperCase()} strategy!`,
      );
      fetchSeatMap();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    }
  };

  // Confirm booking via API
  const handleConfirmBooking = async () => {
    if (heldSeatIds.length === 0) return;
    setMessage("");

    try {
      const paymentRef = `PAY_${Date.now()}`;
      const res = await fetch("/bookings/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          show_id: SHOW_ID,
          seat_ids: heldSeatIds,
          user_id: USER_ID,
          payment_ref: paymentRef,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(`Confirmation failed: ${data.error}`);
        return;
      }

      setHeldSeatIds([]);
      setHoldTimer(0);
      setMessage(`Booking confirmed! Reference: ${paymentRef}`);
      fetchSeatMap();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="app-container">
      {/* Show Header */}
      <div className="header">
        <h2>SeatDrop Booking Terminal</h2>
        {showInfo && (
          <div>
            <h3>{showInfo.movie_name}</h3>
            <p>
              {showInfo.venue_name} — {showInfo.screen_name}
            </p>
          </div>
        )}

        <div className="controls">
          <label htmlFor="strategy-select">Concurrency Locking Strategy:</label>
          <select
            id="strategy-select"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            style={{ padding: "0.5rem", borderRadius: "6px" }}
          >
            <option value="redis">Redis Atomic Lock (SET NX)</option>
            <option value="postgres">PostgreSQL Row Lock (FOR UPDATE)</option>
          </select>
        </div>
      </div>

      {/* Timer Banner */}
      {holdTimer > 0 && (
        <div className="timer-banner">
          ⏳ Seats held for user <strong>{USER_ID}</strong>! Time remaining:{" "}
          {formatTimer(holdTimer)}
        </div>
      )}

      {/* Message Banner */}
      {message && (
        <div
          style={{
            padding: "1rem",
            background: "#334155",
            borderRadius: "8px",
            marginBottom: "1rem",
          }}
        >
          {message}
        </div>
      )}

      {/* Screen & Seat Grid */}
      <div className="screen-container">
        <div className="screen"></div>
        <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>SCREEN</p>

        {/* Legend */}
        <div className="legend">
          <div className="legend-item">
            <div className="seat-dot seat-available"></div> Available
          </div>
          <div className="legend-item">
            <div className="seat-dot seat-selected"></div> Selected
          </div>
          <div className="legend-item">
            <div className="seat-dot seat-held"></div> Held
          </div>
          <div className="legend-item">
            <div className="seat-dot seat-booked"></div> Booked
          </div>
        </div>

        {/* Seat Grid */}
        <div className="seat-grid">
          {seats.map((seat) => {
            const isSelected = selectedSeatIds.includes(seat.seat_id);
            const isHeldByMe = heldSeatIds.includes(seat.seat_id);

            let statusClass = "seat-available";
            if (seat.status === "booked") statusClass = "seat-booked";
            else if (isHeldByMe || seat.status === "held")
              statusClass = "seat-held";
            else if (isSelected) statusClass = "seat-selected";

            return (
              <button
                key={seat.seat_id}
                className={`seat-btn ${statusClass}`}
                disabled={
                  seat.status === "booked" ||
                  (seat.status === "held" && !isHeldByMe)
                }
                onClick={() => toggleSeatSelection(seat.seat_id)}
              >
                <span>
                  {seat.row_label}
                  {seat.seat_number}
                </span>
                <span style={{ fontSize: "0.65rem", opacity: 0.8 }}>
                  {seat.seat_type}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Bar */}
      <div className="action-bar">
        <div>
          <h4>
            Selected:{" "}
            {selectedSeatIds.length > 0 ? selectedSeatIds.join(", ") : "None"}
          </h4>
          {heldSeatIds.length > 0 && (
            <p style={{ color: "#eab308" }}>
              Held Seats: {heldSeatIds.join(", ")}
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: "1rem" }}>
          {heldSeatIds.length === 0 ? (
            <button
              className="btn btn-primary"
              disabled={selectedSeatIds.length === 0}
              onClick={handleHoldSeats}
            >
              Hold Seats ({strategy.toUpperCase()})
            </button>
          ) : (
            <button className="btn btn-success" onClick={handleConfirmBooking}>
              Confirm & Pay
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
