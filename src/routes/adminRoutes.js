import { Router } from "express";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import * as admin from "../services/adminService.js";
import { HttpError, toPositiveInt } from "../utils/httpError.js";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/stats", async (req, res) => res.json(await admin.getStats()));
router.get("/events", async (req, res) => res.json({ events: await admin.listEventsAdmin() }));
router.get("/screens", async (req, res) => res.json({ screens: await admin.listScreens() }));
router.post("/events", async (req, res) => res.status(201).json({ event: await admin.createEvent(req.body || {}) }));
router.patch("/events/:id", async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (!id) throw new HttpError(404, "Event not found.");
  res.json({ event: await admin.updateEvent(id, req.body || {}) });
});
router.post("/shows", async (req, res) => res.status(201).json({ show: await admin.createShow(req.body || {}) }));

export default router;
