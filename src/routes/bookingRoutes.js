import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { bookingLimiter } from "../middleware/rateLimiters.js";
import { BookingService } from "../services/bookingService.js";
import { HttpError, toPositiveInt } from "../utils/httpError.js";

const router = Router();
router.use(requireAuth);

const bookingId = (req) => {
  const id = toPositiveInt(req.params.id);
  if (!id) throw new HttpError(404, "Booking not found.");
  return id;
};

router.get("/", async (req, res) => res.json({ bookings: await BookingService.listForUser(req.user.id) }));

router.get("/:id", async (req, res) => {
  const booking = await BookingService.getForUser(bookingId(req), req.user.id);
  if (!booking) throw new HttpError(404, "Booking not found.");
  res.json({ booking });
});

router.post("/", bookingLimiter, async (req, res) => {
  const result = await BookingService.confirm(req.user, req.body || {});
  res.status(result.idempotent ? 200 : 201).json(result);
});

router.post("/:id/cancel", bookingLimiter, async (req, res) =>
  res.json({ booking: await BookingService.cancel(bookingId(req), req.user) }),
);

export default router;
