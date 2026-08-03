import { Router } from "express";
import { ShowService } from "../services/showService.js";

const router = Router();

// GET /shows/:id - Read-through cached static show details
router.get("/shows/:id", async (req, res) => {
  try {
    const result = await ShowService.getShowInfo(req.params.id);
    if (!result) return res.status(404).json({ error: "Show not found" });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /shows/:id/seats - Get seat map with current status (available | held | booked)
router.get("/shows/:id/seats", async (req, res) => {
  try {
    const seats = await ShowService.getShowSeats(req.params.id);
    res.json({ show_id: req.params.id, seats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /shows/:id/hold - Atomic Redis Hold (Phase 3)
router.post("/shows/:id/hold", async (req, res) => {
  try {
    const showId = req.params.id;
    const { seat_ids, user_id } = req.body;

    if (!seat_ids || !user_id) {
      return res
        .status(400)
        .json({ error: "seat_ids and user_id are required." });
    }

    const result = await ShowService.holdSeatsAtomic(showId, seat_ids, user_id);

    if (!result.success) {
      return res.status(409).json({ error: result.reason });
    }

    res.status(200).json({ message: "Seats held successfully", ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /bookings/confirm - Confirm booking & insert to Postgres
router.post("/bookings/confirm", async (req, res) => {
  try {
    const { show_id, seat_ids, user_id, payment_ref } = req.body;

    if (!show_id || !seat_ids || !user_id || !payment_ref) {
      return res
        .status(400)
        .json({ error: "Missing required booking fields." });
    }

    const result = await ShowService.confirmBooking(
      show_id,
      seat_ids,
      user_id,
      payment_ref,
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /bookings/:id/cancel - Cancel booking
router.post("/bookings/:id/cancel", async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required." });
    }

    const result = await ShowService.cancelBooking(bookingId, user_id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
