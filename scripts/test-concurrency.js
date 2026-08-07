import axios from "axios";

const BASE_URL = "http://localhost:3000";
const SHOW_ID = 1;
const TARGET_SEAT_ID = 1;
const CONCURRENT_USERS = 50;
const HOLD_EXPIRY = 300; // Expected TTL in seconds

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 5000,
  headers: { "Content-Type": "application/json" },
});

async function performApiRequest(method, url, data) {
  try {
    const response = await apiClient({ method, url, data });
    return {
      status: response.status,
      data: response.data,
      userId: data.user_id,
    };
  } catch (error) {
    if (error.response) {
      return {
        status: error.response.status,
        error: error.response.data.error,
        userId: data.user_id,
      };
    }
    return {
      status: 500,
      error: error.message,
      userId: data.user_id,
    };
  }
}

async function runConcurrencyTest(strategy = "redis") {
  console.log(`--------------------------------------------------`);
  console.log(
    ` Starting Concurrency Test | Strategy: ${strategy.toUpperCase()}`,
  );
  console.log(
    ` Simulating ${CONCURRENT_USERS} requests attacking Seat ID ${TARGET_SEAT_ID}...`,
  );
  console.log(`--------------------------------------------------\n`);

  const requests = Array.from({ length: CONCURRENT_USERS }, (_, index) => {
    const userId = `user_bot_${strategy}_${index + 1}`;
    const payload = {
      seat_ids: [TARGET_SEAT_ID],
      user_id: userId,
    };
    const url = `/shows/${SHOW_ID}/hold?strategy=${strategy}`;
    return performApiRequest("post", url, payload);
  });

  const startTime = Date.now();
  const results = await Promise.all(requests);
  const duration = Date.now() - startTime;

  let successCount = 0;
  let conflictCount = 0;
  let internalErrorCount = 0;
  let winner = null;

  results.forEach((res) => {
    if (res.status === 200) {
      successCount++;
      winner = res.userId;
    } else if (res.status === 409) {
      conflictCount++;
    } else if (res.status >= 500) {
      internalErrorCount++;
    }
  });

  console.log(`[Metrics]`);
  console.log(` Execution Time: ${duration} ms`);
  console.log(` Successful Holds (200 OK): ${successCount}`);
  console.log(` Conflicts Blocked (409 Conflict): ${conflictCount}`);

  if (internalErrorCount > 0) {
    console.log(` Internal Errors (500): ${internalErrorCount}`);
  }

  if (winner) {
    console.log(` Winning User: ${winner}`);
  }

  console.log(`\n[Result Verification]`);
  if (successCount === 1 && conflictCount === CONCURRENT_USERS - 1) {
    console.log(
      `SUCCESS: Race condition protection verified. Exactly one winner permitted.`,
    );
  } else if (successCount === 0 && conflictCount === CONCURRENT_USERS) {
    console.log(
      `FAILURE: Seat was already locked or booked before the test started.`,
    );
  } else if (successCount > 1) {
    console.log(
      `CRITICAL FAILURE: Multiple users successfully held the same seat. LOCKING STRATEGY IS BROKEN.`,
    );
  } else {
    console.log(
      `FAILURE: Unexpected result combination. Review locking implementation in backend.`,
    );
  }
}

async function resetEnvironment(testSeatId) {
  console.log(
    `\n[Cleanup] Attempting to release hold on Seat ${testSeatId} using cancellation cutoff rule...`,
  );

  try {
  } catch (error) {}
}

async function main() {
  console.log(`SeatDrop Concurrency Benchmark Suite`);
  console.log(`Backend URL: ${BASE_URL}\n`);

  // --- Run Strategy 1: Redis SET NX EX ---
  // Ensure Redis is clear manually (npm run redis:flush) or run db:init before starting.
  const seatForRedis = TARGET_SEAT_ID;
  console.log(`Running Strategy: REDIS using Seat ${seatForRedis}`);
  await runConcurrencyTest("redis");

  const seatForPostgres = TARGET_SEAT_ID + 1; // Will use Seat 2
  console.log(`\n\n[Pausing 2 seconds for Postgres pool connection stability]`);
  await new Promise((r) => setTimeout(r, 2000));

  console.log(`Running Strategy: POSTGRES using Seat ${seatForPostgres}`);

  await (async function runAdjustedPostgresTest() {
    const strategy = "postgres";
    console.log(`--------------------------------------------------`);
    console.log(
      ` Starting Concurrency Test | Strategy: ${strategy.toUpperCase()}`,
    );
    console.log(
      ` Simulating ${CONCURRENT_USERS} requests attacking Seat ID ${seatForPostgres}...`,
    );
    console.log(`--------------------------------------------------\n`);

    const requests = Array.from({ length: CONCURRENT_USERS }, (_, index) => {
      const userId = `user_bot_${strategy}_${index + 1}`;
      const payload = {
        seat_ids: [seatForPostgres], // Dynamic seat assignment
        user_id: userId,
      };
      const url = `/shows/${SHOW_ID}/hold?strategy=${strategy}`;
      return performApiRequest("post", url, payload);
    });

    const startTime = Date.now();
    const results = await Promise.all(requests);
    const duration = Date.now() - startTime;

    let successCount = 0;
    let conflictCount = 0;
    let internalErrorCount = 0;
    let winner = null;

    results.forEach((res) => {
      if (res.status === 200) {
        successCount++;
        winner = res.userId;
      } else if (res.status === 409) {
        conflictCount++;
      } else if (res.status >= 500) {
        internalErrorCount++;
      }
    });

    console.log(`[Metrics]`);
    console.log(` Execution Time: ${duration} ms`);
    console.log(` Successful Holds (200 OK): ${successCount}`);
    console.log(` Conflicts Blocked (409 Conflict): ${conflictCount}`);

    if (internalErrorCount > 0) {
      console.log(` Internal Errors (500): ${internalErrorCount}`);
    }

    if (winner) {
      console.log(` Winning User: ${winner}`);
    }

    console.log(`\n[Result Verification]`);
    if (successCount === 1 && conflictCount === CONCURRENT_USERS - 1) {
      console.log(
        `SUCCESS: Race condition protection verified. Exactly one winner permitted.`,
      );
    } else if (successCount === 0 && conflictCount === CONCURRENT_USERS) {
      console.log(
        `FAILURE: Seat ${seatForPostgres} was already locked or booked before the test started.`,
      );
    } else {
      console.log(
        `FAILURE: Unexpected result combination. Review locking implementation in backend.`,
      );
    }
  })();

  console.log(`\nConcurrency Benchmark Complete.`);
}

main().catch(console.error);
