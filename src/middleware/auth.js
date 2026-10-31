import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import { HttpError } from "../utils/httpError.js";

export const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

async function loadUser(req) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) return null;
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new HttpError(401, "Your session has expired. Please sign in again.");
  }
  // Role is re-read on every request so demotions and deletions apply immediately.
  const { rows } = await pool.query("SELECT id, name, email, role FROM users WHERE id = $1", [payload.sub]);
  if (!rows[0]) throw new HttpError(401, "This account no longer exists.");
  return rows[0];
}

// Public routes that personalise when a valid token is present (never fails the request).
export const optionalAuth = async (req, res, next) => {
  try {
    req.user = await loadUser(req);
  } catch {
    req.user = null;
  }
  next();
};

export const requireAuth = async (req, res, next) => {
  try {
    const user = await loadUser(req);
    if (!user) throw new HttpError(401, "Please sign in to continue.");
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

export const requireAdmin = (req, res, next) =>
  req.user?.role === "admin" ? next() : next(new HttpError(403, "Admins only."));
