import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is not set. Refusing to start.");
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.warn("WARNING: JWT_SECRET is shorter than 32 characters. Use a long random string.");
}

const { pool } = await import("./config/db.js");
const { redis } = await import("./config/redis.js");
const { globalLimiter } = await import("./middleware/rateLimiters.js");
const { initRealtime, closeRealtime } = await import("./services/realtime.js");
const { HttpError } = await import("./utils/httpError.js");
const authRoutes = (await import("./routes/authRoutes.js")).default;
const catalogRoutes = (await import("./routes/catalogRoutes.js")).default;
const showRoutes = (await import("./routes/showRoutes.js")).default;
const bookingRoutes = (await import("./routes/bookingRoutes.js")).default;
const adminRoutes = (await import("./routes/adminRoutes.js")).default;

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : 0);
app.use(helmet());

// In dev the Vite proxy makes everything same-origin. Set CLIENT_ORIGIN if the UI is hosted elsewhere.
const origins = (process.env.CLIENT_ORIGIN || "").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
if (origins.length) app.use(cors({ origin: origins }));

app.use(express.json({ limit: "50kb" }));
app.use("/api", globalLimiter);

app.use("/api/auth", authRoutes);
app.use("/api", catalogRoutes);
app.use("/api/shows", showRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/admin", adminRoutes);

app.get("/api/health", async (req, res) => {
  try {
    await Promise.all([pool.query("SELECT 1"), redis.ping()]);
    res.json({ status: "ok", postgres: "up", redis: "up", timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: "degraded", error: err.message });
  }
});

// Serve the built frontend (frontend/dist) when it exists, so one process can host everything.
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../frontend/dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) =>
    req.method === "GET" && !req.path.startsWith("/api") ? res.sendFile(path.join(dist, "index.html")) : next(),
  );
}

app.use("/api", (req, res) => res.status(404).json({ error: "Route not found." }));

// Last-resort handler: HttpErrors become clean JSON, anything else is logged and hidden.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.details });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body." });
  console.error("UNHANDLED_ERROR:", err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

const server = app.listen(PORT, async () => {
  console.log(`SeatDrop API running on http://localhost:${PORT}`);
  try {
    await initRealtime();
  } catch (err) {
    console.error("Realtime (SSE) failed to start:", err.message);
  }
});

const shutdown = async () => {
  await closeRealtime();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("unhandledRejection", (reason) => console.error("UNHANDLED_REJECTION:", reason));
