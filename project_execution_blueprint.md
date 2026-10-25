# ReachInbox Scheduler: Execution Task Blueprint

## Objective
Build a production-grade full-stack email job scheduler with a Next.js frontend, an Express/BullMQ backend, and automated Vercel deployment. The solution must strictly adhere to the ReachInbox assignment requirements.

## Step 1: CI/CD & Repository Initialization (Crucial First Step)
1. Initialize a new Git Monorepo with two directories: `/frontend` and `/backend`.
2. Connect the local repository to a remote GitHub repository.
3. **Vercel Connection:** Log into Vercel and link the newly created GitHub repository. Configure the build settings to point to the `/frontend` root directory. 
4. From this point forward, every major feature completion must be committed and pushed to GitHub to trigger a live Vercel deployment.

## Step 2: Backend Setup (Express + Postgres + Redis)
1. Initialize a Node.js TypeScript project in `/backend`.
2. Set up **Prisma ORM** with PostgreSQL. Create models for `User`, `Sender`, and `EmailJob`.
3. Configure `ioredis` and connect it to a local/Docker Redis instance.
4. Set up an Express API with the following routes:
   - `POST /api/emails/schedule`: Accepts CSV lead data, parses schedules, and inserts records into the Database.

## Step 3: Queue & Worker Implementation (BullMQ)
1. Create a `worker.ts` file independent of the main API loop.
2. Configure **BullMQ**. DO NOT use node-cron. Schedule jobs using BullMQ's delay features based on the timestamps saved in PostgreSQL.
3. **Rate Limiting (Human Approach):**
   - Implement a simple Redis sliding-window or atomic increment counter keyed by `senderId:hour`.
   - If the counter exceeds the hourly limit, push the job back into the BullMQ delayed queue for `+1 hour`.
4. **Slack Integration:** If the rate limit is hit, trigger a simple, direct HTTP POST request to the user's saved Slack Webhook URL.
5. **SMTP Dispatch:** Use `nodemailer` with Ethereal Email credentials to actually send the email if the rate limit is not exceeded.
6. Update the PostgreSQL record status to `SENT` or `FAILED`.

## Step 4: Frontend Setup (Next.js + Tailwind)
1. Initialize Next.js (App Router) in `/frontend` with Tailwind CSS.
2. Build the **Google OAuth Login** page. (Can use NextAuth or Firebase Auth for simplicity).
3. Build the **Dashboard Layout**:
   - Top Header with user profile and "Connect Slack" button.
   - Tabs for "Scheduled Emails" and "Sent Emails".
4. Build the **Compose Modal**:
   - Simple form for Subject, Body, and Schedule Time.
   - File input for CSV upload. Parse the CSV locally using `papaparse` before sending JSON to the Express backend.

## Step 5: Data Fetching & Sync
1. Create frontend API utilities to fetch `Scheduled` and `Sent` emails from the Express backend.
2. Implement simple Loading states (spinners) and Empty states ("No emails found") for the UI tables.
3. Ensure standard error handling (e.g., toast notifications if scheduling fails).

## Hard Constraints to Maintain
* **Idempotency:** A single email must never be sent twice. Use database unique constraints on a `jobId` hash.
* **Restart Resilience:** Because BullMQ persists to Redis and states are in Postgres, a server crash should not lose data. Future jobs must resume upon reboot.
* **No Cron:** Must rely purely on Queue delayed jobs.