import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MapPin } from "lucide-react";
import Poster from "../components/Poster";
import { api } from "../utils/api";
import { useCity } from "../utils/city";
import { dayKey, dayLabel, dayNumber, fmtDuration, fmtTime, KIND_LABEL, money } from "../utils/format";

const availability = (show) => {
  const ratio = show.seats_left / show.capacity;
  if (show.seats_left === 0) return { cls: "sold", label: "Sold out" };
  if (ratio < 0.2) return { cls: "low", label: "Filling fast" };
  return { cls: "ok", label: "Available" };
};

export default function EventDetail() {
  const { id } = useParams();
  const city = useCity();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [day, setDay] = useState("");

  useEffect(() => {
    if (!city) return;
    let live = true;
    api.get(`/events/${id}?city=${encodeURIComponent(city)}`)
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [id, city]);

  const days = useMemo(() => [...new Set((data?.shows || []).map((s) => dayKey(s.start_time)))], [data]);
  const activeDay = days.includes(day) ? day : days[0];

  const venues = useMemo(() => {
    const map = new Map();
    for (const s of data?.shows || []) {
      if (dayKey(s.start_time) !== activeDay) continue;
      if (!map.has(s.venue_id)) map.set(s.venue_id, { id: s.venue_id, name: s.venue_name, address: s.venue_address, shows: [] });
      map.get(s.venue_id).shows.push(s);
    }
    return [...map.values()];
  }, [data, activeDay]);

  if (error) return <main className="page"><p className="notice-error" role="alert">{error}</p><Link to="/" className="btn btn-quiet">Back to events</Link></main>;
  if (!data) return <main className="page" aria-busy="true"><div className="skeleton detail-skel" /></main>;

  const { event } = data;
  return (
    <main className="page">
      <section className="detail-head" style={{ "--poster": event.accent }}>
        <Poster event={event} size="lg" />
        <div className="detail-copy">
          <p className="eyebrow">{KIND_LABEL[event.kind]}</p>
          <h1>{event.title}</h1>
          <ul className="meta-pills">
            <li>{event.language}</li>
            <li>{fmtDuration(event.duration_min)}</li>
            <li>{event.age_rating}</li>
            {event.genres.map((g) => <li key={g}>{g}</li>)}
          </ul>
          <p className="detail-text">{event.description}</p>
        </div>
      </section>

      <section className="shows" aria-label="Showtimes">
        <h2>Choose a showtime in {city}</h2>

        {days.length === 0 ? (
          <div className="empty">
            <h3>No upcoming shows in {city}</h3>
            <p className="muted">Try another city from the menu at the top.</p>
          </div>
        ) : (
          <>
            <div className="datestrip" role="tablist" aria-label="Date">
              {days.map((d) => (
                <button key={d} type="button" role="tab" aria-selected={d === activeDay} className="date" onClick={() => setDay(d)}>
                  <span>{dayLabel(d)}</span>
                  <strong>{dayNumber(d)}</strong>
                </button>
              ))}
            </div>

            <ul className="venue-list">
              {venues.map((v) => (
                <li key={v.id} className="venue">
                  <div className="venue-info">
                    <h3>{v.name}</h3>
                    <p className="muted"><MapPin size={14} /> {v.address}</p>
                  </div>
                  <ul className="times">
                    {v.shows.map((s) => {
                      const a = availability(s);
                      const sold = a.cls === "sold";
                      const body = (
                        <>
                          <strong>{fmtTime(s.start_time)}</strong>
                          <span className="mono">{money(s.base_price)}+</span>
                          <span className="time-note">{s.screen_name} · {a.label}</span>
                        </>
                      );
                      return (
                        <li key={s.id}>
                          {sold ? <span className="time is-sold" aria-disabled="true">{body}</span>
                                : <Link to={`/shows/${s.id}`} className={`time is-${a.cls}`}>{body}</Link>}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
