import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const options = { maxRetriesPerRequest: 3 };

// REDIS_URL wins; otherwise REDIS_HOST / REDIS_PORT.
export const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, options)
  : new Redis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: Number(process.env.REDIS_PORT) || 6379,
      ...options,
    });

redis.on("connect", () => console.log("Connected to Redis"));
redis.on("error", (err) => console.error("Redis connection error:", err.message));
