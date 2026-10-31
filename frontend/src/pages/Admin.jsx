import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../utils/api";
import { fmtDateTime, fmtDay, KIND_LABEL, money } from "../utils/format";

const TABS = [["overview", "Overview"], ["events", "Events"], ["schedule", "Schedule a show"]];

function Overview() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get("/admin/stats").then(setStats).catch((e) => toast.error(e.message)); }, []);
  if (!stats) return <div className="skeleton detail-skel" aria-busy="true" />;

  const { totals: t } = stats;
  const maxDay = Math.max(1, ...stats.revenue_by_day.map((d) => d.revenue));
  const figures = [
    ["Net revenue", money(t.net_revenue)],
    ["Confirmed bookings", t.confirmed_bookings],
    ["Tickets for upcoming shows", t.tickets_upcoming],
    ["Upcoming shows", t.upcoming_shows],
  ];

  return (
    <>
      <dl className="figures">
        {figures.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="mono">{value}</dd></div>)}
      </dl>

      <div className="admin-cols">
        <section>
          <h2>Revenue, last 7 days</h2>
          {stats.revenue_by_day.length === 0 ? <p className="muted">No bookings in the last week.</p> : (
            <ul className="bars">
              {stats.revenue_by_day.map((d) => (
                <li key={d.day}>
                  <span className="bar" style={{ height: `${Math.max(6, (d.revenue / maxDay) * 100)}%` }} title={money(d.revenue)} />
                  <span className="bar-label">{fmtDay(`${d.day}T12:00:00+05:30`).split(",")[0]}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">Refunds are already subtracted. {money(t.refunded)} refunded in total, {t.cancelled_bookings} cancellations.</p>
        </section>

        <section>
          <h2>Fullest upcoming shows</h2>
          <ul className="occupancy">
            {stats.top_shows.map((s) => {
              const pct = Math.round((s.sold / s.capacity) * 100);
              return (
                <li key={s.id}>
                  <div><strong>{s.title}</strong><span className="muted"> · {s.venue_name}, {fmtDateTime(s.start_time)}</span></div>
                  <div className="occ-track"><span style={{ width: `${pct}%` }} /></div>
                  <span className="mono small">{s.sold}/{s.capacity} ({pct}%)</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section>
        <h2>Recent bookings</h2>
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Reference</th><th>Event</th><th>Customer</th><th>Status</th><th className="num">Total</th></tr></thead>
            <tbody>
              {stats.recent_bookings.map((b) => (
                <tr key={b.id}>
                  <td className="mono">{b.reference}</td><td>{b.title}</td><td>{b.email}</td>
                  <td><span className={`status status-${b.status}`}>{b.status}</span></td>
                  <td className="num mono">{money(b.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const EMPTY_EVENT = { title: "", kind: "movie", duration_min: 120, language: "English", age_rating: "UA", genres: "", accent: "#7A3FF2", description: "", featured: false };

function Events() {
  const [events, setEvents] = useState(null);
  const [form, setForm] = useState(EMPTY_EVENT);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/admin/events").then((d) => setEvents(d.events)).catch((e) => toast.error(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/events", { ...form, duration_min: Number(form.duration_min) });
      toast.success("Event created. Now schedule a show for it.");
      setForm(EMPTY_EVENT);
      load();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const patch = async (ev, body) => {
    try { await api.patch(`/admin/events/${ev.id}`, body); load(); } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="admin-cols">
      <section>
        <h2>All events</h2>
        {!events ? <div className="skeleton detail-skel" /> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Title</th><th>Type</th><th className="num">Shows</th><th>Featured</th><th>Status</th></tr></thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td><span className="swatch" style={{ background: ev.accent }} /> {ev.title}</td>
                    <td>{KIND_LABEL[ev.kind]}</td>
                    <td className="num mono">{ev.upcoming_shows}</td>
                    <td><button type="button" className="btn btn-quiet btn-sm" onClick={() => patch(ev, { featured: !ev.featured })}>{ev.featured ? "Unfeature" : "Feature"}</button></td>
                    <td><button type="button" className="btn btn-quiet btn-sm" onClick={() => patch(ev, { status: ev.status === "active" ? "archived" : "active" })}>{ev.status === "active" ? "Archive" : "Restore"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2>New event</h2>
        <form className="form-stack" onSubmit={create}>
          <div><label className="label" htmlFor="ev-title">Title</label><input id="ev-title" className="field" required value={form.title} onChange={set("title")} /></div>
          <div className="form-two">
            <div><label className="label" htmlFor="ev-kind">Type</label>
              <select id="ev-kind" className="field" value={form.kind} onChange={set("kind")}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><label className="label" htmlFor="ev-dur">Minutes</label><input id="ev-dur" type="number" min="1" max="600" className="field" required value={form.duration_min} onChange={set("duration_min")} /></div>
          </div>
          <div className="form-two">
            <div><label className="label" htmlFor="ev-lang">Language</label><input id="ev-lang" className="field" value={form.language} onChange={set("language")} /></div>
            <div><label className="label" htmlFor="ev-age">Rating</label><input id="ev-age" className="field" maxLength={6} value={form.age_rating} onChange={set("age_rating")} /></div>
          </div>
          <div><label className="label" htmlFor="ev-gen">Genres (comma separated)</label><input id="ev-gen" className="field" value={form.genres} onChange={set("genres")} placeholder="Thriller, Drama" /></div>
          <div><label className="label" htmlFor="ev-desc">Description</label><textarea id="ev-desc" className="field" rows={3} maxLength={2000} value={form.description} onChange={set("description")} /></div>
          <div className="form-two">
            <div><label className="label" htmlFor="ev-accent">Poster colour</label><input id="ev-accent" type="color" className="field color" value={form.accent} onChange={set("accent")} /></div>
            <label className="check"><input type="checkbox" checked={form.featured} onChange={set("featured")} /> Feature on home page</label>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : "Create event"}</button>
        </form>
      </section>
    </div>
  );
}

function Schedule() {
  const [events, setEvents] = useState([]);
  const [screens, setScreens] = useState([]);
  const [form, setForm] = useState({ event_id: "", screen_id: "", start_time: "", base_price: "300" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/admin/events").then((d) => setEvents(d.events.filter((e) => e.status === "active"))).catch(() => {});
    api.get("/admin/screens").then((d) => setScreens(d.screens)).catch(() => {});
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/shows", {
        event_id: Number(form.event_id), screen_id: Number(form.screen_id),
        base_price: Number(form.base_price), start_time: new Date(form.start_time).toISOString(),
      });
      toast.success("Show scheduled. It's live for booking now.");
      setForm((f) => ({ ...f, start_time: "" }));
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <section className="narrow-form">
      <h2>Schedule a show</h2>
      <p className="muted">The end time comes from the event's duration. Seats and tiers come from the screen. Times use your browser's time zone.</p>
      <form className="form-stack" onSubmit={create}>
        <div><label className="label" htmlFor="sh-ev">Event</label>
          <select id="sh-ev" className="field" required value={form.event_id} onChange={set("event_id")}>
            <option value="">Choose an event</option>{events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select></div>
        <div><label className="label" htmlFor="sh-sc">Screen</label>
          <select id="sh-sc" className="field" required value={form.screen_id} onChange={set("screen_id")}>
            <option value="">Choose a screen</option>{screens.map((s) => <option key={s.id} value={s.id}>{s.city}, {s.venue_name}, {s.name} ({s.total_rows * s.total_columns} seats)</option>)}
          </select></div>
        <div className="form-two">
          <div><label className="label" htmlFor="sh-time">Starts</label><input id="sh-time" type="datetime-local" className="field" required value={form.start_time} onChange={set("start_time")} /></div>
          <div><label className="label" htmlFor="sh-price">Base price (₹)</label><input id="sh-price" type="number" min="0" step="10" className="field" required value={form.base_price} onChange={set("base_price")} /></div>
        </div>
        <p className="hint">Premium seats cost 1.4× and VIP seats 2× the base price.</p>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : "Schedule show"}</button>
      </form>
    </section>
  );
}

export default function Admin() {
  const [tab, setTab] = useState("overview");
  return (
    <main className="page">
      <h1 className="page-title">Admin</h1>
      <div className="tabs" role="tablist" aria-label="Admin sections">
        {TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className="tab" onClick={() => setTab(key)}>{label}</button>)}
      </div>
      {tab === "overview" && <Overview />}
      {tab === "events" && <Events />}
      {tab === "schedule" && <Schedule />}
    </main>
  );
}
