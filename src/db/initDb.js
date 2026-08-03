import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDatabase() {
  try {
    const schemaSql = fs.readFileSync(
      path.join(__dirname, "schema.sql"),
      "utf-8",
    );
    const seedSql = fs.readFileSync(path.join(__dirname, "seed.sql"), "utf-8");

    console.log("Applying schema...");
    await pool.query(schemaSql);

    console.log("Seeding initial data...");
    await pool.query(seedSql);

    console.log("Database initialized and seeded successfully.");
  } catch (error) {
    console.error("Error initializing database:", error);
  } finally {
    await pool.end();
  }
}

initDatabase();
