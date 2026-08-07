# 🎟️ SeatDrop — High-Concurrency Ticket Booking System

SeatDrop is a distributed event seat reservation platform designed to handle massive traffic spikes (drop sales) without double-booking or race conditions. Built with Node.js, Express, PostgreSQL, Redis, and React.

---

## ⚡ Concurrency Benchmark & Load Test Results

Tested with `scripts/test-concurrency.js` by firing **50 concurrent requests simultaneously at the exact same seat**:

| Locking Strategy | Concurrency Level | Execution Time | Successful Holds (200 OK) | Conflicts Blocked (409) | Double-Bookings |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Redis Distributed Lock (`SET NX EX`)** | 50 Concurrent Users | **~89 ms** | 1 | 49 | **0** |
| **PostgreSQL Row Lock (`FOR UPDATE NOWAIT`)** | 50 Concurrent Users | **~480 ms** | 1 | 49 | **0** |

---

## 🛠️ Tech Stack

* **Frontend:** React, Vite, CSS Modules
* **Backend:** Node.js, Express.js
* **Database:** PostgreSQL (Transactional storage & row-level locking)
* **Cache & Memory Lock:** Redis (Ephemeral seat hold TTLs & atomic distributed locks)

---

## 🚀 Key Features

* **Dual Concurrency Locking Engine:** Choose between lightning-fast Redis atomic locking (`SET NX EX`) or acid-compliant PostgreSQL row-level locks (`FOR UPDATE NOWAIT`).
* **Real-time Seat State Synchronization:** Display seat states in real-time (**Available**, **Selected**, **Held**, **Booked**).
* **Two-Phase Commit Booking Engine:** Converts temporary 5-minute Redis holds into permanent PostgreSQL bookings.
* **Cache Invalidation:** Dynamically clears and repopulates seatmap caches on state changes.

---

## 💻 Getting Started Locally

### Prerequisites
* Node.js (v18+)
* PostgreSQL instance
* Redis instance

### Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/YOUR_GITHUB_USERNAME/seatdrop.git](https://github.com/YOUR_GITHUB_USERNAME/seatdrop.git)
   cd seatdrop

2. **Install dependencies:**
   ```bash
   npm install
   cd frontend && npm install && cd ..

3. **Set up Environment Variables:**
   ```bash
   PORT=3000
   DATABASE_URL=postgres://user:password@localhost:5432/seatdrop
   REDIS_URL=redis://localhost:6379

4. **Initialize Database:**
   ```bash
   npm run db:init

5. **Start Development Servers:**
   ```bash
   npm run dev

   cd frontend && npm run dev

6. **Run Concurrency Load Test Suite:**
   ```bash
   node scripts/test-concurrency.js

