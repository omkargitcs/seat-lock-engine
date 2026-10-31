import { Router } from "express";
import { authLimiter } from "../middleware/rateLimiters.js";
import { requireAuth } from "../middleware/auth.js";
import * as auth from "../services/authService.js";

const router = Router();

router.post("/register", authLimiter, async (req, res) => res.status(201).json(await auth.register(req.body || {})));
router.post("/login", authLimiter, async (req, res) => res.json(await auth.login(req.body || {})));
router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

export default router;
