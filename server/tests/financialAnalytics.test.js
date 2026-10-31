import test from "node:test";
import assert from "node:assert/strict";
import { aggregate, buildAuthorizedTeamWhere, customPeriod, filterExpenseRows, formatCents, getDescriptionSearch, moneyCents, percentChange, previousPeriod, resolvePeriod, topExpenseRows } from "../services/financialAnalytics.service.js";
import { askFinancialQuestion, deterministicAnswer, fallbackIntent } from "../services/aiAnalytics.service.js";

test("month boundaries use configured calendar timezone", () => {
  assert.deepEqual(((p) => [p.from, p.to])(resolvePeriod("this_month", new Date("2026-10-10T00:00:00Z"))), ["2026-10-01", "2026-10-10"]);
  assert.deepEqual(((p) => [p.from, p.to])(resolvePeriod("last_month", new Date("2026-01-01T03:00:00Z"))), ["2025-12-01", "2025-12-31"]);
});

test("quarters are calendar quarters and date ranges validate", () => {
  assert.deepEqual(((p) => [p.from, p.to])(resolvePeriod("this_quarter", new Date("2026-10-10T00:00:00Z"))), ["2026-10-01", "2026-10-10"]);
  assert.deepEqual(((p) => [p.from, p.to])(resolvePeriod("last_quarter", new Date("2026-01-05T00:00:00Z"))), ["2025-10-01", "2025-12-31"]);
  assert.throws(() => customPeriod("2026-02-01", "2025-02-01"));
  assert.throws(() => customPeriod("2025-01-01", "2026-02-01"));
  assert.throws(() => customPeriod("2026-02-30", "2026-03-01"));
});

test("month and quarter comparisons align with matching calendar elapsed periods", () => {
  const month = resolvePeriod("this_month", new Date("2026-10-10T00:00:00Z"));
  assert.deepEqual(((p) => [p.from, p.to])(previousPeriod(month)), ["2026-09-01", "2026-09-10"]);
  const quarter = resolvePeriod("this_quarter", new Date("2026-10-10T00:00:00Z"));
  assert.deepEqual(((p) => [p.from, p.to])(previousPeriod(quarter)), ["2026-07-01", "2026-07-10"]);
  const lastQuarter = resolvePeriod("last_quarter", new Date("2026-10-10T00:00:00Z"));
  assert.deepEqual(((p) => [p.from, p.to])(previousPeriod(lastQuarter)), ["2026-04-01", "2026-06-30"]);
});

test("money uses cents and handles refunds and reversal postings without float arithmetic", () => {
  assert.equal(formatCents(moneyCents("100000000000.29") - moneyCents("0.30")), "99999999999.99");
  assert.deepEqual(percentChange(12000n, 10000n), { value: 20, reason: null });
  assert.deepEqual(percentChange(0n, 0n), { value: null, reason: "no_spending_in_either_period" });
  assert.deepEqual(percentChange(50n, 0n), { value: null, reason: "no_previous_period_spending" });
  assert.deepEqual(percentChange(100n, -50n), { value: null, reason: "negative_previous_period_net" });
});

test("aggregation nets credits and keeps currencies and uncategorized rows separate", () => {
  const rows = [
    { teamId: "team-a", teamName: "Sales", currency: "INR", amount: "100.00", category: "Travel", transactionType: "EXPENSE" },
    { teamId: "team-a", teamName: "Sales", currency: "INR", amount: "-20.00", category: null, transactionType: "EXPENSE" },
    { teamId: null, teamName: null, currency: "USD", amount: "5.00", category: null, transactionType: "EXPENSE" },
  ];
  const result = aggregate(rows);
  assert.deepEqual(result.totals.map(({ currency, amount }) => ({ currency, amount })), [{ currency: "INR", amount: "80.00" }, { currency: "USD", amount: "5.00" }]);
  assert.equal(result.teams.find((x) => x.teamName === "Sales").amount, "80.00");
  assert.equal(result.categories.find((x) => x.category === "Uncategorized" && x.currency === "INR").amount, "-20.00");
  assert.equal(result.teams.find((x) => x.teamName === "Unassigned").amount, "5.00");
});

test("team authorization filters members to membership and pins a requested team inside the organization", () => {
  assert.deepEqual(buildAuthorizedTeamWhere("org-1", "user-1", "member"), { organizationId: "org-1", members: { some: { userId: "user-1" } } });
  assert.deepEqual(buildAuthorizedTeamWhere("org-1", "user-1", "owner", "team-1"), { organizationId: "org-1", id: "team-1" });
});

test("thresholds match individual EXPENSE rows strictly above threshold; top lists stay per-currency", () => {
  const rows = [
    { transactionType: "EXPENSE", amount: "500.00", currency: "INR" },
    { transactionType: "EXPENSE", amount: "500.01", currency: "INR" },
    { transactionType: "REIMBURSEMENT_CLAIM", amount: "900.00", currency: "INR" },
    { transactionType: "EXPENSE", amount: "700.00", currency: "USD" },
    { transactionType: "EXPENSE", amount: "-1.00", currency: "INR" },
  ];
  assert.deepEqual(filterExpenseRows(rows, 50000n), [rows[1], rows[3]]);
  assert.deepEqual(filterExpenseRows(rows, 50000n, "INR"), [rows[1]]);
  assert.deepEqual(topExpenseRows(rows, 1), [rows[1], rows[3]]);
});

test("question fallback resolves supported patterns and declines unsupported questions", () => {
  assert.deepEqual(fallbackIntent("Show expenses above ₹50,000"), { supported: true, kind: "threshold", period: "this_month", category: null, searchText: null, threshold: "50000", thresholdCurrency: "INR", limit: 10, teamName: null });
  assert.deepEqual(["How much did we spend on NVIDIA GPU?", "How much did we spend this month?", "How much did we spend on travel this month?", "Which team spent the most this month?"].map((question) => {
    const { kind, searchText, category } = fallbackIntent(question);
    return { kind, searchText, category };
  }), [
    { kind: "search", searchText: "NVIDIA GPU", category: null },
    { kind: "summary", searchText: null, category: null },
    { kind: "category", searchText: null, category: "travel" },
    { kind: "teams", searchText: null, category: null },
  ]);
  assert.equal(fallbackIntent("What is the weather today?").supported, false);
});

test("description search executes only scoped ordinary expense SQL and safely binds search text", async () => {
  const queries = [];
  const db = { $queryRaw: async (query) => {
    queries.push(query);
    return queries.length === 1
      ? [{ id: "tx-1", description: "NVIDIA GPU", teamName: "Engineering", currency: "INR", amount: "40000.00", createdAt: new Date("2026-10-10T09:00:00Z") }]
      : [{ currency: "INR", amount: "40000.00", count: 1 }];
  } };
  const period = customPeriod("2026-10-01", "2026-10-10");
  const found = await getDescriptionSearch("org-1", ["team-1"], period, "NVIDIA GPU", false, db);
  assert.equal(found.matchingCount, 1);
  assert.deepEqual(found.totals, [{ currency: "INR", amount: "40000.00", count: 1 }]);
  assert.equal(found.results[0].teamName, "Engineering");
  assert.equal(found.results[0].amount, "40000.00");
  const renderedQueries = queries.map((query) => query.sql).join("\n");
  const boundValues = queries.flatMap((query) => query.values);
  assert.match(renderedQueries, /t\.organization_id = \?::uuid/);
  assert.match(renderedQueries, /t\.team_id IN \(/);
  assert.match(renderedQueries, /t\.created_at >= \?/);
  assert.match(renderedQueries, /t\.created_at < \?/);
  assert.match(renderedQueries, /t\.transaction_type = 'EXPENSE'/);
  assert.doesNotMatch(renderedQueries, /REIMBURSEMENT_CLAIM|PAYMENT_POSTING/);
  assert.match(renderedQueries, /SUM\(le\.debit - le\.credit\)::numeric\(18,2\) AS amount/);
  assert.doesNotMatch(renderedQueries, /SUM\(le\.debit - le\.credit\)::numeric\(18,2\)::text AS amount/);
  assert.match(renderedQueries, /SUM\(amount\)::numeric\(18,2\)::text AS amount/);
  assert.match(renderedQueries, /POSITION\(LOWER\(\?\) IN LOWER/);
  assert.ok(boundValues.includes("org-1"));
  assert.ok(boundValues.includes("team-1"));
  assert.ok(boundValues.includes("NVIDIA GPU"));
  assert.ok(!renderedQueries.includes("NVIDIA GPU"));
});

test("description search sums multiple matches per currency and represents no matches", async () => {
  let queryNumber = 0;
  const db = { $queryRaw: async () => {
    queryNumber += 1;
    return queryNumber % 2
      ? [
        { id: "tx-1", description: "NVIDIA GPU A", teamName: "Engineering", currency: "INR", amount: "40000.00", createdAt: new Date("2026-10-10T09:00:00Z") },
        { id: "tx-2", description: "NVIDIA GPU B", teamName: "Engineering", currency: "INR", amount: "10000.25", createdAt: new Date("2026-10-09T09:00:00Z") },
        { id: "tx-3", description: "NVIDIA GPU C", teamName: "Research", currency: "USD", amount: "100.25", createdAt: new Date("2026-10-08T09:00:00Z") },
      ]
      : [{ currency: "INR", amount: "50000.25", count: 2 }, { currency: "USD", amount: "100.25", count: 1 }];
  } };
  const period = customPeriod("2026-10-01", "2026-10-10");
  const multiple = await getDescriptionSearch("org-1", ["team-1", "team-2"], period, "NVIDIA GPU", false, db);
  assert.equal(multiple.matchingCount, 3);
  assert.deepEqual(multiple.totals.map(({ currency, amount }) => [currency, amount]), [["INR", "50000.25"], ["USD", "100.25"]]);
  assert.equal(multiple.results.length, 3);

  const emptyDb = { $queryRaw: async () => [] };
  const empty = await getDescriptionSearch("org-1", ["team-1"], period, "missing item", false, emptyDb);
  assert.equal(empty.matchingCount, 0);
  assert.deepEqual(empty.results, []);
  assert.deepEqual(empty.totals, []);
});

test("description search fallback returns database results when classifier fails", async () => {
  const logs = [];
  const oldError = console.error;
  console.error = (...args) => logs.push(args);
  try {
    const response = await askFinancialQuestion({ question: "How much did we spend on NVIDIA GPU?", orgId: "org-1", teamIds: ["team-1"], teamNames: [{ id: "team-1", name: "Engineering" }], requestedTeamId: null, includeUnassigned: false }, {
      apiKey: "test-key",
      classify: async () => { const error = new Error("sensitive provider payload"); error.status = 503; error.code = "API_UNAVAILABLE"; throw error; },
      generate: false,
      search: async (_orgId, _teamIds, _period, phrase) => ({ totals: [{ currency: "INR", amount: "40000.00", count: 1 }], matchingCount: 1, truncated: false, results: [{ id: "tx-1", description: phrase, teamName: "Engineering", amount: "40000.00", currency: "INR", date: new Date("2026-10-10T09:00:00Z") }] }),
    });
    assert.match(response.answer, /Your organization spent ₹40,000\.00 on NVIDIA GPU during the selected period, recorded under Engineering on October 10, 2026\./);
    assert.equal(response.metrics.matchingCount, 1);
    assert.equal(logs.length, 1);
    assert.doesNotMatch(JSON.stringify(logs), /sensitive provider payload|test-key/);
  } finally { console.error = oldError; }
});

test("generation failures are sanitized and use the computed search answer", async () => {
  const logs = [];
  const oldError = console.error;
  console.error = (...args) => logs.push(args);
  try {
    const response = await askFinancialQuestion({ question: "How much did we spend on NVIDIA GPU?", orgId: "org-1", teamIds: ["team-1"], teamNames: [], requestedTeamId: null }, {
      apiKey: "test-key",
      classify: async (question) => fallbackIntent(question),
      generate: async () => { const error = new Error("private prompt and financial data"); error.code = "PROVIDER_FAILURE"; throw error; },
      search: async (_orgId, _teamIds, _period, phrase) => ({ totals: [{ currency: "INR", amount: "40000.00", count: 1 }], matchingCount: 1, truncated: false, results: [{ id: "tx-1", description: phrase, teamName: "Engineering", amount: "40000.00", currency: "INR", date: new Date("2026-10-10T09:00:00Z") }] }),
    });
    assert.match(response.answer, /₹40,000\.00 on NVIDIA GPU/);
    assert.equal(logs.length, 1);
    assert.doesNotMatch(JSON.stringify(logs), /private prompt|financial data|test-key/);
  } finally { console.error = oldError; }
});

test("multiple and empty search results receive deterministic grounded answers", () => {
  const period = { from: "2026-10-01", to: "2026-10-10" };
  const multiple = deterministicAnswer("search", "How much did we spend on NVIDIA GPU?", [], period, {
    totals: [{ currency: "INR", amount: "50000.00" }, { currency: "USD", amount: "100.25" }], matchingCount: 2,
    results: [
      { description: "NVIDIA GPU", teamName: "Engineering", amount: "40000.00", currency: "INR", date: new Date("2026-10-10T09:00:00Z") },
      { description: "NVIDIA GPU accessory", teamName: "Research", amount: "100.25", currency: "USD", date: new Date("2026-10-09T09:00:00Z") },
    ], truncated: false,
  }, "NVIDIA GPU");
  assert.match(multiple, /₹50,000\.00 INR and \$100\.25 USD/);
  assert.match(multiple, /across 2 matching expenses/);
  assert.match(multiple, /₹40,000\.00 INR \(NVIDIA GPU, Engineering/);
  assert.match(deterministicAnswer("search", "search", [], period, { totals: [], matchingCount: 0, results: [] }, "NVIDIA GPU"), /No matching expenses were found for “NVIDIA GPU”/);
});

test("deterministic answers use supplied metrics without recalculating totals", () => {
  const answer = deterministicAnswer("compare", "compare spending", [{ currency: "INR", amount: "120.00", previousAmount: "100.00", comparison: { value: 20, reason: null } }], { from: "2026-10-01", to: "2026-10-10" });
  assert.match(answer, /INR: 120\.00 this period versus 100\.00 previously, up 20\.00%/);
});
