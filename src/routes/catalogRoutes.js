import { Router } from "express";
import { getEvent, listCities, listEvents } from "../services/catalogService.js";
import { HttpError, toPositiveInt } from "../utils/httpError.js";

const router = Router();

router.get("/cities", async (req, res) => res.json({ cities: await listCities() }));

router.get("/events", async (req, res) => {
  const { kind, city, q, language } = req.query;
  res.json({ events: await listEvents({ kind, city, q, language }) });
});

router.get("/events/:id", async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (!id) throw new HttpError(404, "Event not found.");
  res.json(await getEvent(id, req.query.city));
});

export default router;
