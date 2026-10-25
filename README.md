# 🚀 ReachInbox Full-Stack Email Job Scheduler

A production-grade, highly reliable full-stack email job scheduler engineered with **Next.js 16**, **Express.js**, **BullMQ**, **Redis**, **Prisma ORM (PostgreSQL)**, and **Nodemailer (Ethereal SMTP)**.

Live Deployment: [https://outbox-lac.vercel.app](https://outbox-lac.vercel.app)  
GitHub Repository: [https://github.com/Svamsi2006/outbox.git](https://github.com/Svamsi2006/outbox.git)  
Access Granted: `Mitrajit` & `Yadav036`

---

## 🏗️ Architecture Overview

```mermaid
graph TD
    Client["Next.js Frontend (App Router)"] -->|POST /api/emails/schedule| API["Express API Gateway"]
    API -->|Persist Job State| DB[("PostgreSQL via Prisma")]
    API -->|Enqueue Delayed Job| Redis[("Redis Engine")]
    Redis -->|BullMQ Queue| Worker["BullMQ Worker Process"]
    Worker -->|Check Rate Limit Window| Redis
    Worker -->|Exceeded Limit| Slack["Slack Incoming Webhook"]
    Worker -->|Reschedule +1h| Redis
    Worker -->|Under Limit (Delay Throttling)| SMTP["Ethereal SMTP Dispatch"]
    Worker -->|Update Status (SENT/FAILED)| DB
```

### 1. How Scheduling Works (Strictly No Cron)
- **Zero OS or node-cron jobs:** Traditional cron polling introduces race conditions and CPU overhead.
- When a user schedules an email batch:
  1. The start time and incremental delays (`start_time + i * delay_seconds`) are calculated.
  2. Each record is persisted in PostgreSQL with a deterministic SHA-256 idempotency key:
     `hash(sender_id + recipient + scheduled_time + subject)`.
  3. The job is placed directly into the BullMQ delayed queue with an exact millisecond delay:
     `delayMs = Math.max(0, scheduledTimestamp - Date.now())`.
  4. BullMQ leverages Redis sorted sets (`zset`) with execution timestamps as scores, awakening jobs exactly when due with millisecond precision.

### 2. Persistence & Server Restart Resilience
- **Persistent Redis Storage:** BullMQ's delay queues, waiting queues, and job states persist entirely in Redis. A server reboot does not lose queued jobs.
- **Boot Recovery Synchronizer (`backend/src/recovery.ts`):**
  - Upon server boot, the recovery service inspects PostgreSQL for any jobs in `PENDING`, `QUEUED`, or `RATE_LIMITED` status.
  - If any job was orphaned during a crash, it is re-registered into BullMQ with its remaining delay recalculated relative to the current clock.
- **Idempotency Guarantee:**
  - Before sending, the worker performs a strict status check in PostgreSQL. If already marked `SENT`, the job immediately terminates without duplicate dispatch.

### 3. Rate Limiting & Concurrency Architecture
- **Sliding-Window Hourly Rate Limiter:**
  - Keyed by `ratelimit:<senderId>:<hourIndex>` in Redis.
  - Atomic Redis `INCR` guarantees cross-worker concurrency safety across multiple cluster nodes.
  - Keys automatically expire with a 2-hour TTL.
- **Behavior Under Over-Limit:**
  - **Zero Dropped Jobs:** Jobs that exceed `sender.hourlyLimit` are never discarded.
  - Automatically postponed to the start of the next hour window (`delay = nextHourStart - Date.now()`).
  - Marked as `RATE_LIMITED` in the database.
- **Live Slack Alerting:**
  - The instant a sender breaches their hourly quota, the worker dispatches a formatted Slack notification card via the user's saved incoming webhook.
  - Gracefully handles disconnected webhooks without crashing or blocking the worker.
- **Provider Throttling (Inter-Email Delay):**
  - Configurable delay (default: 2s) between individual email dispatches to mimic realistic SMTP provider limits.

---

## 🛠️ Quick Start Guide

### Prerequisites
- Node.js 18+ (tested on Node 22 & 24)
- Docker & Docker Compose (or local PostgreSQL & Redis)

### Step 1: Start PostgreSQL & Redis
```bash
# Start Postgres (port 5432) and Redis (port 6379) in background
docker-compose up -d
```

### Step 2: Configure Environment Variables

#### Backend (`/backend/.env`):
```env
PORT=5000
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/reachinbox_scheduler?schema=public"
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
WORKER_CONCURRENCY=5
RUN_WORKER=true
```

#### Frontend (`/frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

### Step 3: Run Backend
```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npm run dev
```
- API Server: `http://localhost:5000`
- Live BullMQ Dashboard: `http://localhost:5000/admin/queues`

### Step 4: Run Frontend
```bash
cd frontend
npm install
npm run dev
```
- Dashboard UI: `http://localhost:3000`

---

## 📋 Features Implemented (Checklist)

| Category | Requirement | Implementation Details | Status |
|---|---|---|---|
| **Backend** | Express + TypeScript | Modular architecture, clean routers, zod validation | ✅ Implemented |
| **Backend** | BullMQ + Redis Queue | Persistent delayed jobs, retry policies, backoff | ✅ Implemented |
| **Backend** | No Cron Jobs | 100% native BullMQ delayed queues | ✅ Implemented |
| **Backend** | PostgreSQL + Prisma ORM | Models: `User`, `Sender`, `EmailJob` | ✅ Implemented |
| **Backend** | Ethereal SMTP Dispatch | Dynamic test account generation + preview links | ✅ Implemented |
| **Backend** | Configurable Concurrency | `WORKER_CONCURRENCY` env option | ✅ Implemented |
| **Backend** | Inter-Email Delay | Minimum 2-second throttling between dispatches | ✅ Implemented |
| **Backend** | Hourly Rate Limiter | Atomic Redis counters + +1hr rescheduling | ✅ Implemented |
| **Backend** | Live Slack Notifications | Real-time webhook dispatch upon limit breach | ✅ Implemented |
| **Backend** | Idempotency & Restart Safety | SHA-256 keys, DB unique checks, recovery boot | ✅ Implemented |
| **Backend** | Live BullMQ Dashboard | `@bull-board/express` mounted at `/admin/queues` | ✅ Implemented |
| **Frontend** | Google OAuth Login | One-click instant login + user profile header | ✅ Implemented |
| **Frontend** | Dashboard Tabs | "Scheduled Emails" & "Sent Emails" tables | ✅ Implemented |
| **Frontend** | Search Filter | Real-time filtering by recipient and subject | ✅ Implemented |
| **Frontend** | CSV Lead Upload | Client-side parsing via PapaParse with counts | ✅ Implemented |
| **Frontend** | Ethereal Inbox Link | "View Email" opens live message preview | ✅ Implemented |
| **Frontend** | Connect Slack Modal | Webhook input, verification, test ping | ✅ Implemented |
| **Frontend** | Vercel Deployment | Live CI/CD connected to GitHub | ✅ Deployed |

---

## 🧪 Ethereal SMTP Testing
All dispatched emails generate a unique Ethereal preview link returned in the API and displayed in the frontend Sent Emails table. Clicking **"View Email"** takes you directly to the rendered email in Ethereal's web viewer.

---

## 🛡️ Restart Scenario Validation
1. Schedule a sequence of 5 emails with 10-second delays.
2. Terminate the backend server (`Ctrl + C`).
3. Notice that future jobs remain safely stored in Redis.
4. Restart the backend (`npm run dev`).
5. The `recovery.ts` service inspects all pending jobs, resynchronizes the queue, and emails dispatch at their scheduled times with zero duplication.
