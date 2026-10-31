# CashFlow.ai

Casherly.io is a team and organization expense management app. It combines a React dashboard with an Express API and a PostgreSQL-backed double-entry ledger. Users can organize spending by organization and team, manage budgets and reimbursement claims, review audit activity, and explore ledger-backed spending summaries.

## Features

- Email and password registration and sign-in, with access and refresh tokens.
- Organizations, teams, member roles, and invitation links.
- Team budgets, accounts, transactions, funding, and ledger views.
- Reimbursement claim submission, approval, rejection, and payment.
- Audit logs for organization activity.
- Spending insights by period, team, category, and currency, plus natural-language questions. AI-assisted question understanding is optional; ledger calculations are performed by the server.

## Project layout

```text
client/   React 18, TypeScript, Vite, Tailwind CSS
server/   Express 5 API, Prisma ORM, PostgreSQL schema and migrations
```

## Requirements

- Node.js and npm
- PostgreSQL

## Local setup

### 1. Configure the server

Create `server/.env` (it is ignored by Git) with at least:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/cashflow?schema=public"
PORT=3000
ACCESS_TOKEN_SECRET=replace-with-a-long-random-secret
REFRESH_TOKEN_SECRET=replace-with-a-different-long-random-secret
```

The PostgreSQL database in `DATABASE_URL` must already exist. Optional settings:

```dotenv
APP_TIME_ZONE=Asia/Kolkata
OPENAI_API_KEY=
AI_MODEL=gpt-4o-mini
RESEND_API_KEY=
FRONTEND_URL=http://localhost:5173
INVITATION_EMAIL_FROM="CashFlow <noreply@example.com>"
COOKIE_SAME_SITE=lax
AUTH_COOKIE_PATH=/users
```

`OPENAI_API_KEY` enables model-assisted question parsing and explanations for spending insights. Without it, supported questions use the deterministic parser. `RESEND_API_KEY` is needed to send email invitations. Set the sender to a domain configured with your Resend account. The server currently allows browser requests from `http://localhost:5173` in its CORS configuration.

Install dependencies, apply the Prisma migrations, and generate the Prisma client:

```powershell
cd server
npm install
npx prisma migrate deploy
npx prisma generate
```

Start the API in development mode:

```powershell
npm run dev
```

The API listens on port `3000` by default. `GET http://localhost:3000/` is a basic server response.

### 2. Configure and start the frontend

In `client/.env` (also ignored by Git), set the API base URL:

```dotenv
VITE_BACKEND_URL=http://localhost:3000
```

Then, in a separate terminal:

```powershell
cd client
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). Create an account, then create or join an organization to start using the app.

## Useful commands

Run these from the corresponding `client/` or `server/` directory:

| Command | Project | Purpose |
| --- | --- | --- |
| `npm run dev` | client | Start the Vite development server |
| `npm run build` | client | Build the frontend for production |
| `npm run preview` | client | Preview the built frontend locally |
| `npm run lint` | client | Run ESLint |
| `npm run typecheck` | client | Check TypeScript types |
| `npm run dev` | server | Start the API with Nodemon |
| `npm test` | server | Run financial analytics unit tests |
| `npx prisma migrate deploy` | server | Apply checked-in database migrations |
| `npx prisma generate` | server | Generate the Prisma client |

## API overview

The API uses JSON request and response bodies. Protected endpoints expect an `Authorization: Bearer <access-token>` header; refresh tokens are stored in an HTTP-only cookie.

| Area | Base paths |
| --- | --- |
| Authentication and profile | `/users` |
| Organizations and invitations | `/org` |
| Teams and memberships | `/org/:orgId/teams`, `/teams/:teamId` |
| Budgets and accounts | `/teams/:teamId/budget`, `/teams/:teamId/accounts` |
| Transactions and reimbursements | `/org/:orgId/transactions`, `/org/:orgId/teams/:teamId/reimbursement-claims` |
| Audit logs | `/audit-logs` |
| Spending insights | `/org/:orgId/ai/insights`, `/org/:orgId/ai/ask` |

For spending insights request parameters, supported periods, and accounting rules, see [AI_SPENDING_INSIGHTS.md](AI_SPENDING_INSIGHTS.md).

## Financial reporting notes

- Analytics are calculated from ledger postings. Amounts in different currencies are kept separate and never added together.
- Unpaid reimbursement claims are reported separately from posted spending.
- Organization owners can see authorized organization activity; other members are restricted to their team memberships.
- The application uses `Asia/Kolkata` as the default reporting timezone; set `APP_TIME_ZONE` to change it.

## Current development configuration

The frontend's API URL is configured through `VITE_BACKEND_URL`. The backend CORS origin is currently hard-coded to `http://localhost:5173`; update `server/server.js` when deploying the frontend at another origin. Use secure secrets and production cookie settings when deploying.

The project includes `server/routes/ledger.routes.js`, but that router is not currently mounted by `server/server.js`, so its ledger endpoints are not available through the running API yet.
