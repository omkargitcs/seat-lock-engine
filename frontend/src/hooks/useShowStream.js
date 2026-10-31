import { useEffect, useRef } from "react";

// Listens to /api/shows/:id/stream (Server-Sent Events). The server only sends a nudge, so we
// debounce it and refetch the seat map. A slow poll is the safety net if the stream drops.
export function useShowStream(showId, onChange) {
  const handler = useRef(onChange);
  useEffect(() => {
    handler.current = onChange;
  });

  useEffect(() => {
    let timer;
    const nudge = () => {
      clearTimeout(timer);
      timer = setTimeout(() => handler.current(), 250);
    };

    const source = new EventSource(`/api/shows/${showId}/stream`);
    source.onmessage = nudge;
    source.onopen = nudge; // catch anything missed while reconnecting
    const poll = setInterval(() => handler.current(), 20_000);

    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      source.close();
    };
  }, [showId]);
}
