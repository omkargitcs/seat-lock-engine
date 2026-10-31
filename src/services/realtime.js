import { redis } from "../config/redis.js";

// Seat changes are published to Redis, so every API instance can push them to its own browsers.
const channel = (showId) => `show:${showId}`;
const clients = new Map(); // showId -> Set<Response>
let subscriber = null;

export async function initRealtime() {
  subscriber = redis.duplicate();
  await subscriber.psubscribe("show:*");
  subscriber.on("pmessage", (_pattern, chan, message) => {
    const set = clients.get(chan.split(":")[1]);
    if (!set) return;
    for (const res of set) res.write(`data: ${message}\n\n`);
  });
}

export const publishSeatChange = (showId, type = "seats") =>
  redis.publish(channel(showId), JSON.stringify({ type, at: Date.now() })).catch(() => {});

export function openStream(req, res, showId) {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write("retry: 3000\n\n");

  const key = String(showId);
  if (!clients.has(key)) clients.set(key, new Set());
  clients.get(key).add(res);

  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    clients.get(key)?.delete(res);
    if (clients.get(key)?.size === 0) clients.delete(key);
  });
}

export async function closeRealtime() {
  for (const set of clients.values()) for (const res of set) res.end();
  clients.clear();
  await subscriber?.quit().catch(() => {});
}
