import bcrypt from "bcryptjs";
import { pool } from "../config/db.js";
import { signToken } from "../middleware/auth.js";
import { HttpError } from "../utils/httpError.js";

const ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", ROUNDS);

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

export async function register({ name, email, password }) {
  name = String(name || "").trim();
  email = String(email || "").trim().toLowerCase();
  password = String(password || "");

  if (name.length < 2 || name.length > 60) throw new HttpError(400, "Enter your name (2 to 60 characters).");
  if (!EMAIL_RE.test(email) || email.length > 120) throw new HttpError(400, "Enter a valid email address.");
  if (password.length < 8 || password.length > 72) throw new HttpError(400, "Password must be 8 to 72 characters.");

  const hash = await bcrypt.hash(password, ROUNDS);
  try {
    const { rows } = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, role",
      [name, email, hash],
    );
    return { token: signToken(rows[0]), user: publicUser(rows[0]) };
  } catch (err) {
    if (err.code === "23505") throw new HttpError(409, "An account with this email already exists.");
    throw err;
  }
}

export async function login({ email, password }) {
  email = String(email || "").trim().toLowerCase();
  password = String(password || "");
  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, "Incorrect email or password.");
  return { token: signToken(user), user: publicUser(user) };
}
