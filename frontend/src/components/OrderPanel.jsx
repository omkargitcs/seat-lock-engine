import { CreditCard, Landmark, Loader2, Smartphone, Tag, Wallet, X } from "lucide-react";
import { money, timer, TIER_LABEL } from "../utils/format";

const METHODS = [
  { key: "upi", label: "UPI", icon: Smartphone },
  { key: "card", label: "Card", icon: CreditCard },
  { key: "netbanking", label: "Net banking", icon: Landmark },
  { key: "wallet", label: "Wallet", icon: Wallet },
];

export default function OrderPanel({
  selectedSeats, hold, secondsLeft, holdSeconds, quote, feePerTicket,
  coupon, onCouponChange, onApplyCoupon, onRemoveCoupon, couponError,
  method, onMethod, strategy, onStrategy, busy, signedIn, onHold, onRelease, onPay,
}) {
  const holding = !!hold;
  const lines = holding && quote ? quote.items : selectedSeats.map((s) => ({ seat_id: s.seat_id, label: `${s.row}${s.number}`, tier: s.tier, price: s.price }));
  const subtotal = holding && quote ? quote.subtotal : lines.reduce((sum, l) => sum + l.price, 0);
  const fee = holding && quote ? quote.fee : feePerTicket * lines.length;
  const discount = holding && quote ? quote.discount : 0;
  const total = subtotal - discount + fee;
  const pct = Math.min(100, (secondsLeft / holdSeconds) * 100);

  return (
    <aside className="order" aria-label="Order summary" id="order-panel">
      <h2 className="order-title">{holding ? "Review and pay" : "Your seats"}</h2>

      {holding && (
        <div className={`holdbar ${secondsLeft <= 60 ? "is-low" : ""}`} role="timer" aria-live="off">
          <div className="holdbar-top">
            <span>Seats held for you</span>
            <strong className="mono">{timer(secondsLeft)}</strong>
          </div>
          <div className="holdbar-track"><span style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      {lines.length === 0 ? (
        <p className="order-empty">Pick up to 8 seats on the map. Prices depend on the section.</p>
      ) : (
        <ul className="order-lines">
          {lines.map((l) => (
            <li key={l.seat_id}>
              <span className={`seat-chip tier-${l.tier}`}>{l.label}</span>
              <span className="muted">{TIER_LABEL[l.tier]}</span>
              <span className="mono">{money(l.price)}</span>
            </li>
          ))}
        </ul>
      )}

      {lines.length > 0 && (
        <dl className="order-sums">
          <div><dt>Tickets ({lines.length})</dt><dd className="mono">{money(subtotal)}</dd></div>
          <div><dt>Convenience fee</dt><dd className="mono">{money(fee)}</dd></div>
          {discount > 0 && <div className="discount"><dt>Coupon {quote.coupon.code}</dt><dd className="mono">-{money(discount)}</dd></div>}
          <div className="grand"><dt>Total</dt><dd className="mono">{money(total)}</dd></div>
        </dl>
      )}

      {!holding && (
        <button type="button" className="btn btn-primary btn-block" disabled={lines.length === 0 || busy} onClick={onHold}>
          {busy ? <Loader2 size={18} className="spin" /> : signedIn ? `Hold seats and continue` : "Sign in to continue"}
        </button>
      )}

      {holding && (
        <>
          <form className="coupon" onSubmit={(e) => { e.preventDefault(); onApplyCoupon(); }}>
            <label htmlFor="coupon" className="label"><Tag size={14} /> Coupon code</label>
            {quote?.coupon ? (
              <div className="coupon-applied">
                <span><strong className="mono">{quote.coupon.code}</strong> applied</span>
                <button type="button" className="icon-btn" onClick={onRemoveCoupon} aria-label="Remove coupon"><X size={16} /></button>
              </div>
            ) : (
              <div className="coupon-row">
                <input id="coupon" className="field" value={coupon} onChange={(e) => onCouponChange(e.target.value.toUpperCase())} placeholder="WELCOME10" autoComplete="off" />
                <button type="submit" className="btn btn-quiet" disabled={!coupon.trim() || busy}>Apply</button>
              </div>
            )}
            {couponError && <p className="field-error" role="alert">{couponError}</p>}
          </form>

          <fieldset className="methods">
            <legend className="label">Pay with</legend>
            <div>
              {METHODS.map(({ key, label, icon: Icon }) => (
                <label key={key} className={`method ${method === key ? "is-on" : ""}`}>
                  <input type="radio" name="method" value={key} checked={method === key} onChange={() => onMethod(key)} />
                  <Icon size={16} /> {label}
                </label>
              ))}
            </div>
            <p className="hint">Demo checkout: no real payment is taken.</p>
          </fieldset>

          <button type="button" className="btn btn-primary btn-block" disabled={busy || !quote} onClick={onPay}>
            {busy ? <><Loader2 size={18} className="spin" /> Processing…</> : `Pay ${money(total)}`}
          </button>
          <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={onRelease}>Release seats and start over</button>
        </>
      )}

      <details className="dev">
        <summary>Developer options</summary>
        <label className="label" htmlFor="engine">Seat locking engine</label>
        <select id="engine" className="field" value={strategy} onChange={(e) => onStrategy(e.target.value)} disabled={holding}>
          <option value="redis">Redis atomic Lua script</option>
          <option value="postgres">PostgreSQL row lock + Redis</option>
        </select>
      </details>
    </aside>
  );
}
