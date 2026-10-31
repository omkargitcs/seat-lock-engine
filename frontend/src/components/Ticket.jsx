import Barcode from "./Barcode";
import { fmtDayLong, fmtTime, money, KIND_LABEL, TIER_LABEL } from "../utils/format";

// The booking, drawn as a ticket with a tear-off stub.
export default function Ticket({ booking }) {
  const cancelled = booking.status === "cancelled";
  return (
    <article className={`ticket ${cancelled ? "is-cancelled" : ""}`} style={{ "--poster": booking.accent }}>
      <div className="ticket-main">
        <p className="ticket-kind">{KIND_LABEL[booking.kind]}</p>
        <h2 className="ticket-title">{booking.title}</h2>
        <dl className="ticket-grid">
          <div><dt>Date</dt><dd>{fmtDayLong(booking.start_time)}</dd></div>
          <div><dt>Time</dt><dd>{fmtTime(booking.start_time)}</dd></div>
          <div><dt>Venue</dt><dd>{booking.venue_name}</dd></div>
          <div><dt>Hall</dt><dd>{booking.screen_name}, {booking.city}</dd></div>
        </dl>
        <div className="ticket-seats">
          <span className="ticket-seats-label">{booking.seats.length} {booking.seats.length === 1 ? "seat" : "seats"}</span>
          <ul>
            {booking.seats.map((s) => (
              <li key={s.seat_id} className={`seat-chip tier-${s.tier}`} title={TIER_LABEL[s.tier]}>{s.label}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="ticket-stub">
        <div>
          <span className="ticket-label">Booking ID</span>
          <strong className="ticket-ref mono">{booking.reference}</strong>
        </div>
        <Barcode value={booking.reference} />
        <div>
          <span className="ticket-label">{cancelled ? "Refunded" : "Paid"}</span>
          <strong className="mono">{money(cancelled ? booking.refund_amount : booking.total_amount)}</strong>
        </div>
        {cancelled && <span className="stamp">Cancelled</span>}
      </div>
    </article>
  );
}
