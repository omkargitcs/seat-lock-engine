import { KIND_LABEL } from "../utils/format";

// Generated artwork: a gradient from the event's accent colour with the title set on top.
export default function Poster({ event, size = "md" }) {
  return (
    <div className={`poster poster-${size}`} style={{ "--poster": event.accent }} role="img" aria-label={`${event.title} poster`}>
      <span className="poster-kind">{KIND_LABEL[event.kind]}</span>
      <span className="poster-title">{event.title}</span>
    </div>
  );
}
