import { Fragment, useMemo } from "react";
import { money, TIER_LABEL } from "../utils/format";

const STATE_LABEL = { available: "available", selected: "selected", held: "held by someone else", booked: "booked", mine: "held for you" };

function seatState(seat, selected) {
  if (seat.mine) return "mine";
  if (seat.status === "booked") return "booked";
  if (seat.status === "held") return "held";
  return selected.has(seat.seat_id) ? "selected" : "available";
}

export default function SeatMap({ seats, selected, onToggle }) {
  const rows = useMemo(() => {
    const map = new Map();
    for (const s of seats) {
      if (!map.has(s.row)) map.set(s.row, []);
      map.get(s.row).push(s);
    }
    return [...map.entries()].map(([label, list]) => ({ label, seats: list, tier: list[0].tier, price: list[0].price }));
  }, [seats]);

  const columns = rows.reduce((m, r) => Math.max(m, r.seats.length), 0);
  const aisleAfter = Math.floor(columns / 2);

  return (
    <div className="seatmap-scroll">
      <div className="seatmap" role="group" aria-label="Seat map">
        <div className="screen" aria-hidden="true">
          <svg viewBox="0 0 400 34" preserveAspectRatio="none"><path d="M4 30 Q200 -8 396 30" /></svg>
          <span>Screen / stage this way</span>
        </div>

        {rows.map((row, ri) => (
          <Fragment key={row.label}>
            {(ri === 0 || rows[ri - 1].tier !== row.tier) && (
              <div className="tier-head">
                <span>{TIER_LABEL[row.tier]}</span>
                <span className="mono">{money(row.price)}</span>
              </div>
            )}
            <div className="seat-row" role="group" aria-label={`Row ${row.label}`}>
              <span className="row-label" aria-hidden="true">{row.label}</span>
              <div className="seat-row-seats">
                {row.seats.map((seat, i) => {
                  const state = seatState(seat, selected);
                  const disabled = state === "booked" || state === "held" || state === "mine";
                  return (
                    <Fragment key={seat.seat_id}>
                      {i === aisleAfter && <span className="aisle" aria-hidden="true" />}
                      <button
                        type="button"
                        className={`seat seat-${state} tier-${seat.tier}`}
                        disabled={disabled}
                        aria-pressed={state === "selected"}
                        aria-label={`Row ${seat.row}, seat ${seat.number}, ${TIER_LABEL[seat.tier]}, ${money(seat.price)}, ${STATE_LABEL[state]}`}
                        onClick={() => onToggle(seat)}
                      >
                        {seat.number}
                      </button>
                    </Fragment>
                  );
                })}
              </div>
              <span className="row-label" aria-hidden="true">{row.label}</span>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
