import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import SeatMap from "../components/SeatMap";
import OrderPanel from "../components/OrderPanel";
import { useAuth } from "../utils/AuthContext";
import { api } from "../utils/api";
import { fmtDateTime, money, timer } from "../utils/format";
import { useCountdown } from "../hooks/useCountdown";
import { useShowStream } from "../hooks/useShowStream";

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const LEGEND = [["available", "Available"], ["selected", "Selected"], ["mine", "Held for you"], ["held", "Held by others"], ["booked", "Booked"]];

export default function ShowPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [quote, setQuote] = useState(null);
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [couponError, setCouponError] = useState("");
  const [method, setMethod] = useState("upi");
  const [strategy, setStrategy] = useState("redis");
  const [busy, setBusy] = useState(false);
  const idem = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get(`/shows/${id}/seats`);
      setData({ ...d, expiresAt: d.my_hold ? Date.now() + d.my_hold.expires_in * 1000 : null });
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load, user?.id]);
  useShowStream(id, load);

  // The server is the source of truth for the hold, so a refresh or a second tab still shows it.
  const hold = data?.my_hold ? { seatIds: data.my_hold.seat_ids, expiresAt: data.expiresAt } : null;
  const holdKey = hold ? hold.seatIds.join(",") : "";

  const secondsLeft = useCountdown(hold?.expiresAt, () => {
    toast.info("Your hold expired and the seats were released.");
    load();
  });

  // Drop any selected seat that someone else just took.
  useEffect(() => {
    if (!data) return;
    const free = new Set(data.seats.filter((s) => s.status === "available").map((s) => s.seat_id));
    const lost = [...selected].filter((sid) => !free.has(sid));
    if (lost.length) {
      setSelected(new Set([...selected].filter((sid) => free.has(sid))));
      toast.error(lost.length > 1 ? "Some of your seats were just taken." : "One of your seats was just taken.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Price the held seats (with the coupon, if any) on the server.
  useEffect(() => {
    idem.current = null;
    if (!holdKey) return;
    let live = true;
    api.post(`/shows/${id}/quote`, { seat_ids: holdKey.split(",").map(Number), coupon_code: appliedCoupon || undefined })
      .then((q) => { if (live) { setQuote(q); setCouponError(""); } })
      .catch((e) => {
        if (!live) return;
        if (appliedCoupon) { setCouponError(e.message); setAppliedCoupon(""); } else toast.error(e.message);
      });
    return () => { live = false; };
  }, [holdKey, appliedCoupon, id]);

  const quoteForHold = holdKey ? quote : null;
  const max = data?.pricing.max_seats ?? 8;

  const selectedSeats = useMemo(() => (data ? data.seats.filter((s) => selected.has(s.seat_id)) : []), [data, selected]);
  const selectedTotal = selectedSeats.reduce((sum, s) => sum + s.price, 0);

  const toggle = (seat) => {
    if (hold) return toast.info("Release your current hold to pick different seats.");
    if (!selected.has(seat.seat_id) && selected.size >= max) return toast.error(`You can book up to ${max} seats at a time.`);
    const next = new Set(selected);
    if (next.has(seat.seat_id)) next.delete(seat.seat_id); else next.add(seat.seat_id);
    setSelected(next);
  };

  const doHold = async () => {
    if (!user) return navigate("/login", { state: { from: `/shows/${id}` } });
    setBusy(true);
    try {
      await api.post(`/shows/${id}/hold?strategy=${strategy}`, { seat_ids: [...selected] });
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error(e.message);
      const lost = e.details?.conflict_seat_id;
      if (lost) setSelected((prev) => new Set([...prev].filter((sid) => sid !== lost)));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const doRelease = async () => {
    setBusy(true);
    try {
      await api.del(`/shows/${id}/hold`);
      setAppliedCoupon(""); setCoupon(""); setQuote(null);
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const doPay = async () => {
    setBusy(true);
    try {
      idem.current ||= `PAY_${uuid()}`;
      const res = await api.post("/bookings", {
        show_id: Number(id),
        seat_ids: hold.seatIds,
        payment_ref: idem.current,
        payment_method: method,
        coupon_code: quoteForHold?.coupon?.code,
      });
      navigate(`/bookings/${res.booking.id}`, { state: { justBooked: true } });
    } catch (e) {
      toast.error(e.message);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const applyCoupon = () => { setCouponError(""); setAppliedCoupon(coupon.trim()); };

  if (error && !data) return <main className="page"><p className="notice-error" role="alert">{error}</p><Link to="/" className="btn btn-quiet">Back to events</Link></main>;
  if (!data) return <main className="page" aria-busy="true"><div className="skeleton detail-skel" /></main>;

  const { show } = data;
  const started = new Date(show.start_time) <= new Date();
  const ctaCount = hold ? hold.seatIds.length : selectedSeats.length;

  return (
    <main className="page show-page">
      <Link to={`/events/${show.event_id}`} className="back"><ArrowLeft size={16} /> {show.title}</Link>
      <header className="show-head">
        <h1>{show.title}</h1>
        <p className="muted">{show.venue_name}, {show.city} · {show.screen_name} · {fmtDateTime(show.start_time)}</p>
      </header>

      {started && <p className="notice-error" role="alert">This show has already started, so booking is closed.</p>}

      <div className="show-layout">
        <section className="show-map" aria-label="Choose seats">
          <ul className="legend">
            {LEGEND.map(([key, label]) => <li key={key}><span className={`seat seat-${key} legend-seat`} aria-hidden="true" />{label}</li>)}
          </ul>
          <SeatMap seats={data.seats} selected={selected} onToggle={toggle} />
        </section>

        <OrderPanel
          selectedSeats={selectedSeats} hold={hold} secondsLeft={secondsLeft} holdSeconds={data.pricing.hold_seconds}
          quote={quoteForHold} feePerTicket={data.pricing.fee_per_ticket}
          coupon={coupon} onCouponChange={setCoupon} onApplyCoupon={applyCoupon}
          onRemoveCoupon={() => { setAppliedCoupon(""); setCoupon(""); }} couponError={couponError}
          method={method} onMethod={setMethod} strategy={strategy} onStrategy={setStrategy}
          busy={busy || started} signedIn={!!user} onHold={doHold} onRelease={doRelease} onPay={doPay}
        />
      </div>

      {ctaCount > 0 && (
        <div className="sticky-cta">
          <div>
            <strong>{ctaCount} {ctaCount === 1 ? "seat" : "seats"}</strong>
            <span className="muted mono">{hold ? `held ${timer(secondsLeft)}` : money(selectedTotal)}</span>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => document.getElementById("order-panel")?.scrollIntoView({ behavior: "smooth" })}>
            {hold ? "Review and pay" : "Continue"}
          </button>
        </div>
      )}
    </main>
  );
}
