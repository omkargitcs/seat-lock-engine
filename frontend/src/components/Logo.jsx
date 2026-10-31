// A ticket with a punched stub.
export default function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M8 20a5 5 0 0 0 0 10v14h48V30a5 5 0 0 0 0-10v-4H8z" fill="#D63A22" transform="translate(0 2)" />
      <path d="M41 18v28" stroke="#0D0A12" strokeWidth="3" strokeDasharray="3 3.5" transform="translate(0 2)" />
      <circle cx="24" cy="34" r="3.4" fill="#F4EFE6" />
    </svg>
  );
}
