import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, X } from "lucide-react";
import EventCard from "../components/EventCard";
import Poster from "../components/Poster";
import { api } from "../utils/api";
import { useCity } from "../utils/city";
import { KINDS, fmtDay, fmtDuration, money } from "../utils/format";

export default function Home() {
  const city = useCity();
  const [params, setParams] = useSearchParams();
  const kind = params.get("kind") || "";
  const q = params.get("q") || "";
  const [language, setLanguage] = useState("");
  const [events, setEvents] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!city) return;
    let live = true;
    const query = new URLSearchParams({ city });
    if (kind) query.set("kind", kind);
    if (q) query.set("q", q);
    api.get(`/events?${query}`)
      .then((d) => { if (live) { setEvents(d.events); setError(""); } })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [city, kind, q]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const languages = useMemo(() => [...new Set((events || []).map((e) => e.language))].sort(), [events]);
  const shown = useMemo(() => (events || []).filter((e) => !language || e.language === language), [events, language]);
  const featured = !kind && !q ? events?.find((e) => e.featured) : null;

  return (
    <main className="page">
      {featured && (
        <section className="hero" style={{ "--poster": featured.accent }} aria-label="Featured">
          <div className="hero-copy">
            <p className="eyebrow">Featured in {city}</p>
            <h1>{featured.title}</h1>
            <p className="hero-meta">
              {featured.genres.join(" · ")} · {featured.language} · {fmtDuration(featured.duration_min)} · {featured.age_rating}
            </p>
            <p className="hero-text">{featured.description}</p>
            <div className="hero-actions">
              <Link to={`/events/${featured.id}`} className="btn btn-primary btn-lg">Book tickets <ArrowRight size={18} /></Link>
              <span className="mono muted">From {money(featured.price_from)} · next show {fmtDay(featured.next_show)}</span>
            </div>
          </div>
          <div className="hero-poster"><Poster event={featured} size="lg" /></div>
        </section>
      )}

      {!featured && <h1 className="page-title">{q ? `Results for “${q}”` : "What's on"}</h1>}

      <div className="filters">
        <div className="chips" role="tablist" aria-label="Type">
          {KINDS.map((k) => (
            <button key={k.key} type="button" role="tab" aria-selected={kind === k.key} className="chip" onClick={() => setParam("kind", k.key)}>
              {k.label}
            </button>
          ))}
        </div>
        <div className="filters-right">
          {q && (
            <button type="button" className="chip chip-clear" onClick={() => setParam("q", "")}>
              “{q}” <X size={14} />
            </button>
          )}
          {languages.length > 1 && (
            <select className="field field-sm" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language">
              <option value="">All languages</option>
              {languages.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
        </div>
      </div>

      {error && <p className="notice-error" role="alert">{error}</p>}

      {events === null && !error ? (
        <div className="grid" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="event-skeleton"><div className="skeleton poster-skel" /><div className="skeleton line" /><div className="skeleton line short" /></div>)}
        </div>
      ) : shown.length === 0 && !error ? (
        <div className="empty">
          <h2>Nothing matches yet</h2>
          <p className="muted">Try another type or city, or clear your search.</p>
          <button type="button" className="btn btn-quiet" onClick={() => { setParams({}, { replace: true }); setLanguage(""); }}>Clear filters</button>
        </div>
      ) : (
        <div className="grid">
          {shown.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      )}
    </main>
  );
}
