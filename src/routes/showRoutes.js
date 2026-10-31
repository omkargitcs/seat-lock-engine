import { Router } from "express";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { holdLimiter } from "../middleware/rateLimiters.js";
import { ShowService } from "../services/showService.js";
import { openStream } from "../services/realtime.js";
import { HttpError, toPositiveInt } from "../utils/httpError.js";

const router = Router();

const showId = (req) => {
  const id = toPositiveInt(req.params.id);
  if (!id) throw new HttpError(404, "Show not found.");
  return id;
};

router.get("/:id", async (req, res) => res.json({ show: await ShowService.requireShow(showId(req)) }));

// Seat map with live status. Sign-in is optional: signed-in users also see which seats are theirs.
router.get("/:id/seats", optionalAuth, async (req, res) =>
  res.json(await ShowService.getSeatMap(showId(req), req.user?.id ?? null)),
);

// Server-Sent Events: a tiny "something changed, refetch" nudge whenever seats change.
router.get("/:id/stream", async (req, res) => {
  const id = showId(req);
  await ShowService.requireShow(id);
  openStream(req, res, id);
});

// ?strategy=postgres switches the locking engine (default: redis)
router.post("/:id/hold", requireAuth, holdLimiter, async (req, res) => {
  const strategy = req.query.strategy === "postgres" ? "postgres" : "redis";
  res.json(await ShowService.holdSeats(showId(req), req.body?.seat_ids, req.user, strategy));
});

router.delete("/:id/hold", requireAuth, async (req, res) =>
  res.json(await ShowService.releaseHold(showId(req), req.user.id)),
);

router.post("/:id/quote", requireAuth, async (req, res) =>
  res.json(await ShowService.quote(showId(req), req.body?.seat_ids, req.body?.coupon_code)),
);

export default router;
