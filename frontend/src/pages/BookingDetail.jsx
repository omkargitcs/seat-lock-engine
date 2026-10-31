import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, Check, Printer } from "lucide-react";
import { toast } from "sonner";
import Dialog from "../components/Dialog";
import Ticket from "../components/Ticket";
import { api } from "../utils/api";
import { fmtDateTime, money } from "../utils/format";

export default function BookingDetail() {
  const { id } = useParams();
  const { state } = useLocation();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/bookings/${id}`).then((d) => setBooking(d.booking)).catch((e) => setError(e.message));
  }, [id]);

  const cancel = async () => {
    setBusy(true);
    try {
      const d = await api.post(`/bookings/${id}/cancel`);
      setBooking(d.booking);
      setConfirming(false);
      toast.success(d.booking.refund_amount > 0 ? `Cancelled. ${money(d.booking.refund_amount)} will be refunded.` : "Booking cancelled.");
    } catch (e) {
      toast.error(e.message);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <main className="page narrow"><p className="notice-error" role="alert">{error}</p><Link to="/bookings" className="btn btn-quiet">Back to tickets</Link></main>;
  if (!booking) return <main className="page narrow" aria-busy="true"><div className="skeleton detail-skel" /></main>;

  return (
    <main className="page narrow">
      <Link to="/bookings" className="back no-print"><ArrowLeft size={16} /> My tickets</Link>

      {state?.justBooked && booking.status === "confirmed" && (
        <div className="success" role="status">
          <span className="success-icon"><Check size={18} /></span>
          <div>
            <h1>You're booked</h1>
            <p className="muted">Show this ticket at the entrance. Booking ID <strong className="mono">{booking.reference}</strong>.</p>
          </div>
        </div>
      )}
      {!state?.justBooked && <h1 className="page-title">Your ticket</h1>}

      <Ticket booking={booking} />

      <section className="receipt" aria-label="Payment summary">
        <h2>Payment summary</h2>
        <dl className="order-sums">
          <div><dt>Tickets ({booking.seats.length})</dt><dd className="mono">{money(booking.subtotal)}</dd></div>
          <div><dt>Convenience fee</dt><dd className="mono">{money(booking.fee)}</dd></div>
          {booking.discount > 0 && <div className="discount"><dt>Coupon {booking.coupon_code}</dt><dd className="mono">-{money(booking.discount)}</dd></div>}
          <div className="grand"><dt>Total paid</dt><dd className="mono">{money(booking.total_amount)}</dd></div>
          {booking.status === "cancelled" && <div><dt>Refunded</dt><dd className="mono">{money(booking.refund_amount)}</dd></div>}
        </dl>
        <p className="muted small">Booked on {fmtDateTime(booking.created_at)} · paid by {booking.payment_method}</p>
      </section>

      <div className="actions no-print">
        <button type="button" className="btn btn-quiet" onClick={() => window.print()}><Printer size={16} /> Print ticket</button>
        {booking.can_cancel && <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>Cancel booking</button>}
      </div>
      {booking.status === "confirmed" && !booking.can_cancel && <p className="muted small no-print">Bookings can't be cancelled within 2 hours of the show.</p>}

      {confirming && (
        <Dialog title="Cancel this booking?" confirmLabel="Cancel booking" danger busy={busy} onConfirm={cancel} onCancel={() => setConfirming(false)}>
          <p>
            {booking.refund_if_cancelled > 0
              ? <>You'll get <strong className="mono">{money(booking.refund_if_cancelled)}</strong> back ({booking.refund_percent}% of the ticket price). The convenience fee isn't refundable.</>
              : "This booking won't be refunded."}
          </p>
          <p className="muted small">Cancelling 24 hours or more before the show refunds the full ticket price; within 24 hours refunds half.</p>
        </Dialog>
      )}
    </main>
  );
}
