import { Prisma } from "../generated/prisma/client.ts";
import prisma from "../prisma/client.js";

export const APP_TIME_ZONE = process.env.APP_TIME_ZONE || "Asia/Kolkata";
const dateKey = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

function zonedDateTime(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let value = target;
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
    const part = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
    const represented = Date.UTC(Number(part.year), Number(part.month) - 1, Number(part.day), Number(part.hour), Number(part.minute), Number(part.second));
    value += target - represented;
  }
  return new Date(value);
}

const addDays = (dateString, days) => { const [y, m, d] = dateString.split("-").map(Number); const date = new Date(Date.UTC(y, m - 1, d + days)); return date.toISOString().slice(0, 10); };
const firstMonth = (year, month) => `${year}-${String(month).padStart(2, "0")}-01`;
const monthAfter = (year, month) => month === 12 ? firstMonth(year + 1, 1) : firstMonth(year, month + 1);

export function resolvePeriod(key = "this_month", now = new Date()) {
  const today = dateKey(now); const [year, month] = today.split("-").map(Number);
  let from; let toExclusive; let label;
  if (key === "this_month") { from = firstMonth(year, month); toExclusive = addDays(today, 1); label = "This month to date"; }
  else if (key === "last_month") { const y = month === 1 ? year - 1 : year; const m = month === 1 ? 12 : month - 1; from = firstMonth(y, m); toExclusive = firstMonth(year, month); label = "Last month"; }
  else if (key === "this_quarter" || key === "last_quarter") {
    let q = Math.floor((month - 1) / 3); let y = year;
    if (key === "last_quarter") { q -= 1; if (q < 0) { q = 3; y -= 1; } }
    const m = q * 3 + 1; from = firstMonth(y, m); toExclusive = key === "this_quarter" ? addDays(today, 1) : m === 10 ? firstMonth(y + 1, 1) : firstMonth(y, m + 3); label = key === "this_quarter" ? "This quarter to date" : "Last quarter";
  } else if (key === "year_to_date") { from = `${year}-01-01`; toExclusive = addDays(today, 1); label = "Year to date"; }
  else throw new Error("Unsupported period. Use this_month, last_month, this_quarter, last_quarter or year_to_date.");
  return { key, label, from, to: addDays(toExclusive, -1), start: zonedDateTime(from), endExclusive: zonedDateTime(toExclusive) };
}

export function customPeriod(from, to) {
  const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!validDate(from) || !validDate(to) || from > to) throw new Error("Provide valid from/to dates with from on or before to.");
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 > 366) throw new Error("Date range cannot exceed 366 days.");
  const next = addDays(to, 1); return { key: "custom", label: "Selected period", from, to, start: zonedDateTime(from), endExclusive: zonedDateTime(next) };
}

export function previousPeriod(period) {
  const [year, month] = period.from.split("-").map(Number);
  const day = Number(period.to.slice(8, 10));
  if (period.key === "this_month") {
    const previousMonthDate = new Date(Date.UTC(year, month - 2, 1));
    const previousYear = previousMonthDate.getUTCFullYear(); const previousMonth = previousMonthDate.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(previousYear, previousMonth, 0)).getUTCDate();
    return customPeriod(firstMonth(previousYear, previousMonth), `${previousYear}-${String(previousMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`);
  }
  if (period.key === "last_month") {
    const previousStart = new Date(Date.UTC(year, month - 2, 1)); const previousYear = previousStart.getUTCFullYear(); const previousMonth = previousStart.getUTCMonth() + 1;
    const previousEnd = addDays(period.from, -1); return customPeriod(firstMonth(previousYear, previousMonth), previousEnd);
  }
  if (period.key === "this_quarter") {
    const elapsedDays = (Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / 86400000 + 1;
    const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1;
    const priorStart = new Date(Date.UTC(year, quarterMonth - 4, 1)).toISOString().slice(0, 10);
    return customPeriod(priorStart, addDays(priorStart, elapsedDays - 1));
  }
  if (period.key === "last_quarter") {
    const startDate = new Date(Date.UTC(year, month - 4, 1));
    const start = firstMonth(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1);
    return customPeriod(start, addDays(period.from, -1));
  }
  if (period.key === "year_to_date") {
    const prevYear = year - 1; const lastDay = new Date(Date.UTC(prevYear, month, 0)).getUTCDate();
    return customPeriod(`${prevYear}-01-01`, `${prevYear}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`);
  }
  const days = (Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / 86400000 + 1;
  const to = addDays(period.from, -1); const from = addDays(period.from, -days); return customPeriod(from, to);
}

export const moneyCents = (value) => {
  const text = String(value ?? "0"); const match = text.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return 0n;
  const cents = BigInt(match[2]) * 100n + BigInt((match[3] || "").padEnd(2, "0")); return match[1] ? -cents : cents;
};
export const formatCents = (cents) => `${cents < 0n ? "-" : ""}${(cents < 0n ? -cents : cents) / 100n}.${String((cents < 0n ? -cents : cents) % 100n).padStart(2, "0")}`;
export function percentChange(current, previous) {
  if (previous === 0n) return { value: null, reason: current === 0n ? "no_spending_in_either_period" : "no_previous_period_spending" };
  if (previous < 0n) return { value: null, reason: "negative_previous_period_net" };
  return { value: Number(((current - previous) * 10000n) / previous) / 100, reason: null };
}

export async function authorizedScope(orgId, userId, requestedTeamId) {
  const member = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId } }, select: { role: true } });
  if (!member) { const error = new Error("You do not have access to this organization."); error.statusCode = 403; throw error; }
  const teams = await prisma.team.findMany({ where: buildAuthorizedTeamWhere(orgId, userId, member.role, requestedTeamId), select: { id: true, name: true, budget: { select: { currency: true } } }, orderBy: { name: "asc" } });
  if (requestedTeamId && teams.length === 0) { const error = new Error("Team not found or you do not have access to it."); error.statusCode = 404; throw error; }
  return { member, teams };
}

export function buildAuthorizedTeamWhere(orgId, userId, role, requestedTeamId = null) {
  return { organizationId: orgId, ...(requestedTeamId ? { id: requestedTeamId } : {}), ...(role === "owner" ? {} : { members: { some: { userId } } }) };
}

async function ledgerRows(orgId, teamIds, period, includeUnassigned = false, extra = Prisma.empty) {
  if (!teamIds.length && !includeUnassigned) return [];
  const teamFilter = teamIds.length ? Prisma.sql`t.team_id IN (${Prisma.join(teamIds.map((teamId) => Prisma.sql`${teamId}::uuid`))})` : Prisma.sql`FALSE`;
  return prisma.$queryRaw(Prisma.sql`
    SELECT t.id, t.team_id AS "teamId", tm.name AS "teamName", t.description,
      t.transaction_type AS "transactionType", t.category, t.currency, t.created_at AS "createdAt",
      SUM(le.debit - le.credit)::numeric(18,2)::text AS amount
    FROM transactions t
    JOIN ledger_entries le ON le.transaction_id = t.id
    JOIN accounts a ON a.id = le.account_id AND a.organization_id = t.organization_id
    LEFT JOIN teams tm ON tm.id = t.team_id
    WHERE t.organization_id = ${orgId}::uuid
      AND (${teamFilter} OR (${includeUnassigned} = TRUE AND t.team_id IS NULL))
      AND t.created_at >= ${period.start} AND t.created_at < ${period.endExclusive}
      AND a.account_type = 'expense'
      AND t.transaction_type IN ('EXPENSE', 'REIMBURSEMENT_CLAIM')
      AND (
        t.transaction_type = 'EXPENSE'
        OR (t.transaction_type = 'REIMBURSEMENT_CLAIM' AND EXISTS (
          SELECT 1 FROM reimbursement_claims rc
          WHERE rc.id = t.reference_id AND rc.organization_id = t.organization_id AND rc.status = 'PAID'
        ))
      )
      ${extra}
    GROUP BY t.id, tm.name
    HAVING SUM(le.debit - le.credit) <> 0
    ORDER BY t.created_at DESC
  `);
}

export function aggregate(rows) {
  const totals = new Map(); const teamTotals = new Map(); const categories = new Map();
  for (const row of rows) {
    const currency = String(row.currency || "INR").trim(); const amount = moneyCents(row.amount);
    totals.set(currency, (totals.get(currency) || 0n) + amount);
    const teamKey = `${row.teamId || "unassigned"}|${currency}`; const team = teamTotals.get(teamKey) || { teamId: row.teamId, teamName: row.teamName || "Unassigned", currency, cents: 0n, count: 0 };
    team.cents += amount; if (row.transactionType !== "REIMBURSEMENT_REJECTION_REVERSAL") team.count += 1; teamTotals.set(teamKey, team);
    const category = row.category || "Uncategorized"; const categoryKey = `${category}|${currency}`; const item = categories.get(categoryKey) || { category, currency, cents: 0n, count: 0 }; item.cents += amount; item.count += 1; categories.set(categoryKey, item);
  }
  const serialize = (item) => ({ ...item, amount: formatCents(item.cents), cents: undefined });
  return { totals: [...totals].map(([currency, cents]) => ({ currency, amount: formatCents(cents), cents })), teams: [...teamTotals.values()].sort((a,b) => a.currency.localeCompare(b.currency) || (a.cents > b.cents ? -1 : 1)).map(serialize), categories: [...categories.values()].sort((a,b) => a.currency.localeCompare(b.currency) || (a.cents > b.cents ? -1 : 1)).map(serialize) };
}

export async function getInsights(orgId, teamIds, period, includeUnassigned = false) {
  const prev = previousPeriod(period);
  const [rows, previousRows] = await Promise.all([ledgerRows(orgId, teamIds, period, includeUnassigned), ledgerRows(orgId, teamIds, prev, includeUnassigned)]);
  const current = aggregate(rows); const previous = aggregate(previousRows);
  const previousByCurrency = new Map(previous.totals.map((v) => [v.currency, v.cents]));
  const currentByCurrency = new Map(current.totals.map((v) => [v.currency, v.cents]));
  const currencies = new Set([...currentByCurrency.keys(), ...previousByCurrency.keys()]);
  const totals = [...currencies].map((currency) => {
    const cents = currentByCurrency.get(currency) || 0n;
    const previousCents = previousByCurrency.get(currency) || 0n;
    return { currency, amount: formatCents(cents), comparison: percentChange(cents, previousCents), previousAmount: formatCents(previousCents) };
  });
  const currentTeamMap = new Map(current.teams.map((row) => [`${row.teamId || "unassigned"}|${row.currency}`, row]));
  const previousTeamMap = new Map(previous.teams.map((row) => [`${row.teamId || "unassigned"}|${row.currency}`, row]));
  const teams = [...new Set([...currentTeamMap.keys(), ...previousTeamMap.keys()])].map((key) => {
    const now = currentTeamMap.get(key); const before = previousTeamMap.get(key);
    const currentCents = now?.cents || 0n; const previousCents = before?.cents || 0n; const base = now || before;
    return { teamId: base.teamId, teamName: base.teamName, currency: base.currency, amount: formatCents(currentCents), previousAmount: formatCents(previousCents), changeAmount: formatCents(currentCents - previousCents), comparison: percentChange(currentCents, previousCents), count: now?.count || 0 };
  }).sort((a, b) => a.currency.localeCompare(b.currency) || (moneyCents(a.amount) > moneyCents(b.amount) ? -1 : 1));
  const teamsPerCurrency = new Map();
  const boundedTeams = teams.filter((row) => { const count = teamsPerCurrency.get(row.currency) || 0; if (count >= 10) return false; teamsPerCurrency.set(row.currency, count + 1); return true; }).slice(0, 100);
  const ordinaryExpenses = rows.filter((row) => moneyCents(row.amount) > 0n && row.transactionType === "EXPENSE");
  const largest = [...new Set(ordinaryExpenses.map((row) => String(row.currency || "INR").trim()))].flatMap((currency) => ordinaryExpenses.filter((row) => String(row.currency || "INR").trim() === currency).sort((a,b) => moneyCents(a.amount) > moneyCents(b.amount) ? -1 : 1).slice(0, 10)).map(({ amount, ...row }) => ({ ...row, amount: formatCents(moneyCents(amount)), currency: String(row.currency || "INR").trim() }));
  return { period: { from: period.from, to: period.to, timezone: APP_TIME_ZONE, label: period.label }, comparisonPeriod: { from: prev.from, to: prev.to }, currency: "per currency", calculation: "Sum of debit minus credit on expense accounts for ordinary EXPENSE transactions and paid REIMBURSEMENT_CLAIM postings. Reimbursement payout and unpaid claims are excluded; rejected claims and their reversal both net to zero and are not treated as spending.", totals, teams: boundedTeams, categories: current.categories.slice(0, 100), largestExpenses: largest, hasData: rows.length > 0, categoryLimitation: "Historical transactions without structured category data appear as Uncategorized; descriptions are not treated as categories." };
}

export async function getOpenClaims(orgId, teamIds, employeeId = null) {
  if (!teamIds.length) return [];
  const claims = await prisma.reimbursementClaim.findMany({
    where: { organizationId: orgId, teamId: { in: teamIds }, status: { in: ["PENDING", "APPROVED"] }, ...(employeeId ? { employeeId } : {}) },
    select: { status: true, amount: true, currency: true },
  });
  const totals = new Map();
  for (const claim of claims) {
    const currency = String(claim.currency || "INR").trim();
    const key = `${claim.status}|${currency}`;
    totals.set(key, (totals.get(key) || 0n) + moneyCents(claim.amount));
  }
  return [...totals].map(([key, cents]) => {
    const [status, currency] = key.split("|");
    return { status, currency, amount: formatCents(cents) };
  });
}

export async function getRows(orgId, teamIds, period, options = {}) {
  const rows = await ledgerRows(orgId, teamIds, period, Boolean(options.includeUnassigned));
  if (options.threshold) return filterExpenseRows(rows, options.threshold, options.currency);
  if (options.top) return topExpenseRows(rows, options.top);
  return rows;
}

export function filterExpenseRows(rows, threshold, currency = null) { return rows.filter((row) => row.transactionType === "EXPENSE" && moneyCents(row.amount) > threshold && (!currency || String(row.currency || "INR").trim() === currency)); }
export function topExpenseRows(rows, limit = 10) {
  const expenses = rows.filter((row) => row.transactionType === "EXPENSE" && moneyCents(row.amount) > 0n);
  return [...new Set(expenses.map((row) => String(row.currency || "INR").trim()))].flatMap((currency) => expenses.filter((row) => String(row.currency || "INR").trim() === currency).sort((a,b) => moneyCents(a.amount) > moneyCents(b.amount) ? -1 : 1).slice(0, limit));
}

export function summarizeDescriptionMatches(matches, totals, matchingCount) {
  return {
    totals: totals.map((row) => ({ currency: String(row.currency || "INR").trim(), amount: formatCents(moneyCents(row.amount)), count: Number(row.count) })),
    results: matches.map((row) => ({
      id: row.id,
      description: row.description,
      amount: formatCents(moneyCents(row.amount)),
      currency: String(row.currency || "INR").trim(),
      teamName: row.teamName || "Unassigned",
      date: row.createdAt,
    })),
    matchingCount: Number(matchingCount),
    truncated: Number(matchingCount) > matches.length,
  };
}

export async function getDescriptionSearch(orgId, teamIds, period, searchText, includeUnassigned = false, db = prisma) {
  if (typeof searchText !== "string" || searchText.trim().length < 2 || searchText.trim().length > 120) throw new Error("Search text must be between 2 and 120 characters.");
  if (!teamIds.length && !includeUnassigned) return summarizeDescriptionMatches([], [], 0);
  const teamFilter = teamIds.length ? Prisma.sql`t.team_id IN (${Prisma.join(teamIds.map((teamId) => Prisma.sql`${teamId}::uuid`))})` : Prisma.sql`FALSE`;
  const matchingRows = Prisma.sql`
    SELECT t.id, t.description, t.team_id AS "teamId", COALESCE(tm.name, 'Unassigned') AS "teamName",
      t.currency, t.created_at AS "createdAt",
      SUM(le.debit - le.credit)::numeric(18,2) AS amount
    FROM transactions t
    JOIN ledger_entries le ON le.transaction_id = t.id
    JOIN accounts a ON a.id = le.account_id AND a.organization_id = t.organization_id
    LEFT JOIN teams tm ON tm.id = t.team_id AND tm.organization_id = t.organization_id
    WHERE t.organization_id = ${orgId}::uuid
      AND (${teamFilter} OR (${includeUnassigned} = TRUE AND t.team_id IS NULL))
      AND t.created_at >= ${period.start} AND t.created_at < ${period.endExclusive}
      AND t.transaction_type = 'EXPENSE'
      AND a.account_type = 'expense'
      AND POSITION(LOWER(${searchText.trim()}) IN LOWER(COALESCE(t.description, ''))) > 0
    GROUP BY t.id, tm.name
    HAVING SUM(le.debit - le.credit) <> 0
  `;
  const [matches, totals] = await Promise.all([
    db.$queryRaw(Prisma.sql`WITH matching AS (${matchingRows}) SELECT * FROM matching ORDER BY "createdAt" DESC, id DESC LIMIT 50`),
    db.$queryRaw(Prisma.sql`WITH matching AS (${matchingRows}) SELECT currency, SUM(amount)::numeric(18,2)::text AS amount, COUNT(*)::int AS count FROM matching GROUP BY currency ORDER BY currency`),
  ]);
  const matchingCount = totals.reduce((count, row) => count + Number(row.count), 0);
  return summarizeDescriptionMatches(matches, totals, matchingCount);
}

