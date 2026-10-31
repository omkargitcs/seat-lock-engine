import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../config/db.js";
import { seedDatabase } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function initDatabase() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    console.error("Refusing to wipe a production database. Re-run with --force if you really mean it.");
    process.exit(1);
  }
  try {
    console.log("Applying schema (this drops existing tables)...");
    await pool.query(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8"));
    console.log("Seeding demo data...");
    await seedDatabase(pool);
    console.log("Database ready.");
  } catch (error) {
    console.error("Error initializing database:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

initDatabase();
