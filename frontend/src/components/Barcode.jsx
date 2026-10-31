// Decorative only: bar widths come from the booking reference. It is not a scannable code.
export default function Barcode({ value }) {
  const bars = [...(value + value)].map((ch, i) => ({ w: 1 + ((ch.charCodeAt(0) + i) % 4), key: i }));
  return (
    <div className="barcode" aria-hidden="true">
      {bars.map((b) => (
        <span key={b.key} style={{ width: b.w * 2 }} />
      ))}
    </div>
  );
}
