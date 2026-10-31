import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../utils/api";
import { fmtDateTime, money } from "../utils/format";

const TABS = [["upcoming", "Upcoming"], ["past", "Past"], ["cancelled", "Cancelled"]];

export default function Bookings() {
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("upcoming");
  const [now] = useState(() => Date.now());

  useEffect(() => {
    api.get("/bookings").then((d) => setBookings(d.bookings)).catch((e) => setError(e.message));
  }, []);

  const groups = {
    upcoming: (bookings || []).filter((b) => b.status === "confirmed" && new Date(b.start_time) > now),
    past: (bookings || []).filter((b) => b.status === "confirmed" && new Date(b.start_time) <= now),
    cancelled: (bookings || []).filter((b) => b.status === "cancelled"),
  };
  const list = groups[tab];

  return (
    <main className="page narrow">
      <h1 className="page-title">My tickets</h1>

      <div className="tabs" role="tablist" aria-label="Bookings">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className="tab" onClick={() => setTab(key)}>
            {label} <span className="muted">{groups[key].length}</span>
          </button>
        ))}
      </div>

      {error && <p className="notice-error" role="alert">{error}</p>}

      {!bookings && !error ? (
        <div aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton booking-skel" />)}</div>
      ) : list.length === 0 ? (
        <div className="empty">
          <h2>{tab === "upcoming" ? "No upcoming bookings" : `Nothing in ${tab}`}</h2>
          {tab === "upcoming" && <><p className="muted">When you book, your tickets show up here.</p><Link to="/" className="btn btn-primary">Browse events</Link></>}
        </div>
      ) : (
        <ul className="booking-list">
          {list.map((b) => (
            <li key={b.id}>
              <Link to={`/bookings/${b.id}`} className="booking-row" style={{ "--poster": b.accent }}>
                <span className="booking-bar" aria-hidden="true" />
                <div className="booking-main">
                  <h2>{b.title}</h2>
                  <p className="muted">{b.venue_name}, {b.city} · {fmtDateTime(b.start_time)}</p>
                  <ul className="seat-chips">{b.seats.map((s) => <li key={s.seat_id} className={`seat-chip tier-${s.tier}`}>{s.label}</li>)}</ul>
                </div>
                <div className="booking-side">
                  <span className="mono">{money(b.status === "cancelled" ? b.refund_amount : b.total_amount)}</span>
                  <span className="muted">{b.status === "cancelled" ? "refunded" : b.reference}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
