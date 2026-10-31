import { Link } from "react-router-dom";
import Poster from "./Poster";
import { fmtDay, fmtDuration, money } from "../utils/format";

export default function EventCard({ event }) {
  return (
    <Link to={`/events/${event.id}`} className="event-card">
      <Poster event={event} />
      <div className="event-card-body">
        <h3 className="event-card-title">{event.title}</h3>
        <p className="event-card-meta">
          {event.language} · {fmtDuration(event.duration_min)} · {event.age_rating}
        </p>
        <p className="event-card-foot">
          <span className="mono">From {money(event.price_from)}</span>
          <span className="muted">Next {fmtDay(event.next_show)}</span>
        </p>
      </div>
    </Link>
  );
}
