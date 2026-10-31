/*
  Concurrency benchmark: N signed-in users try to hold the SAME seat at the same instant.
  Exactly one must win; everyone else must get a 409.

  Run the API with DISABLE_RATE_LIMIT=1 (and optionally BCRYPT_ROUNDS=8) first:
    DISABLE_RATE_LIMIT=1 BCRYPT_ROUNDS=8 npm run dev
    npm run test:concurrency
*/
import axios from "axios";

const BASE_URL = process.env.API_URL || "http://localhost:3000/api";
const SHOW_ID = Number(process.env.SHOW_ID) || 1;
const CONCURRENT_USERS = Number(process.env.USERS) || 50;

const api = axios.create({ baseURL: BASE_URL, timeout: 15000, validateStatus: () => true });

async function createBots(prefix, count) {
  const run = Date.now().toString(36);
  const bots = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const email = `bot_${prefix}_${run}_${i}@load.test`;
      const res = await api.post("/auth/register", { name: `Bot ${i + 1}`, email, password: "load-test-pass" });
      if (res.status !== 201) throw new Error(`Bot registration failed: ${res.status} ${JSON.stringify(res.data)}`);
      return { name: `Bot ${i + 1}`, token: res.data.token };
    }),
  );
  return bots;
}

async function pickFreeSeats(howMany) {
  const res = await api.get(`/shows/${SHOW_ID}/seats`);
  if (res.status !== 200) throw new Error(`Cannot read show ${SHOW_ID}: ${res.status}`);
  const free = res.data.seats.filter((s) => s.status === "available").slice(0, howMany);
  if (free.length < howMany) throw new Error(`Show ${SHOW_ID} needs at least ${howMany} free seats. Try another SHOW_ID.`);
  return free.map((s) => s.seat_id);
}

async function runTest(strategy, seatId) {
  console.log("--------------------------------------------------");
  console.log(` Strategy: ${strategy.toUpperCase()}  |  ${CONCURRENT_USERS} users  |  seat ${seatId}`);
  console.log("--------------------------------------------------");

  const bots = await createBots(strategy, CONCURRENT_USERS);

  const start = Date.now();
  const results = await Promise.all(
    bots.map((bot) =>
      api.post(`/shows/${SHOW_ID}/hold?strategy=${strategy}`, { seat_ids: [seatId] }, {
        headers: { Authorization: `Bearer ${bot.token}` },
      }),
    ),
  );
  const ms = Date.now() - start;

  const won = results.filter((r) => r.status === 200).length;
  const blocked = results.filter((r) => r.status === 409).length;
  const errors = results.filter((r) => r.status >= 500).length;

  console.log(` Execution time:      ${ms} ms`);
  console.log(` Holds granted (200): ${won}`);
  console.log(` Conflicts (409):     ${blocked}`);
  if (errors) console.log(` Server errors (5xx): ${errors}`);

  if (won === 1 && blocked === CONCURRENT_USERS - 1) console.log(" PASS: exactly one winner, zero double-holds.\n");
  else if (won > 1) console.log(" CRITICAL FAIL: more than one user holds the same seat.\n");
  else console.log(" FAIL: unexpected result. Is the seat already held? Re-run db:init or wait 5 minutes.\n");
  return won === 1 && blocked === CONCURRENT_USERS - 1;
}

async function main() {
  console.log("SeatDrop concurrency benchmark");
  console.log(`API: ${BASE_URL}   Show: ${SHOW_ID}\n`);
  const [redisSeat, postgresSeat] = await pickFreeSeats(2);
  const a = await runTest("redis", redisSeat);
  await new Promise((r) => setTimeout(r, 1500));
  const b = await runTest("postgres", postgresSeat);
  process.exit(a && b ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
