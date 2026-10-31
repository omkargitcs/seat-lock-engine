const TZ = "Asia/Kolkata";

export const money = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export const fmtTime = (d) =>
  new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ })
    .format(new Date(d))
    .toUpperCase();

export const fmtDay = (d) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(new Date(d));

export const fmtDayLong = (d) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date(d));

export const fmtDateTime = (d) => `${fmtDay(d)}, ${fmtTime(d)}`;

// yyyy-mm-dd in India time, used to group shows by day
export const dayKey = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(d));

export const dayLabel = (key) => {
  const today = dayKey(new Date());
  const tomorrow = dayKey(new Date(Date.now() + 86_400_000));
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: TZ }).format(new Date(`${key}T12:00:00+05:30`));
};

export const dayNumber = (key) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: TZ }).format(new Date(`${key}T12:00:00+05:30`));

export const fmtDuration = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim() : `${m}m`);

export const KINDS = [
  { key: "", label: "All" },
  { key: "movie", label: "Movies" },
  { key: "concert", label: "Concerts" },
  { key: "comedy", label: "Comedy" },
  { key: "sports", label: "Sports" },
  { key: "theatre", label: "Theatre" },
];
export const KIND_LABEL = { movie: "Movie", concert: "Concert", comedy: "Comedy", sports: "Sports", theatre: "Theatre" };
export const TIER_LABEL = { standard: "Standard", premium: "Premium", vip: "VIP" };

export const timer = (seconds) => {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
