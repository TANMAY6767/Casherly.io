import { ApiError } from "../utils/ApiError.js";
import { authorizedScope, getInsights, getOpenClaims, resolvePeriod, customPeriod } from "../services/financialAnalytics.service.js";
import { askFinancialQuestion } from "../services/aiAnalytics.service.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const limit = 20; const windowMs = 5 * 60 * 1000; const requests = new Map();
function rateLimit(userId) {
  const now = Date.now(); const current = (requests.get(userId) || []).filter((at) => at > now - windowMs);
  if (current.length >= limit) throw new ApiError(429, "Too many analytics requests. Try again in a few minutes.");
  current.push(now); requests.set(userId, current);
  if (requests.size > 5000) for (const [id, times] of requests) if (!times.some((at) => at > now - windowMs)) requests.delete(id);
}
function auth(req) {
  if (!req.user?.sub) throw new ApiError(401, "Authentication required.");
  const { orgId } = req.params;
  if (!uuid.test(orgId || "")) throw new ApiError(400, "A valid organization ID is required.");
  return { userId: req.user.sub, orgId };
}
function fail(error) { throw new ApiError(error.statusCode || 400, error.message); }

export async function insights(req, res, next) {
  try {
    rateLimit(req.user?.sub || "anonymous");
    const { userId, orgId } = auth(req);
    const requestedTeamId = req.query.teamId ? String(req.query.teamId) : null;
    if (requestedTeamId && !uuid.test(requestedTeamId)) throw new ApiError(400, "A valid team ID is required.");
    const { teams, member } = await authorizedScope(orgId, userId, requestedTeamId);
    const key = String(req.query.period || "this_month");
    let period;
    try { period = resolvePeriod(key); } catch (error) { return fail(error); }
    const teamIds = teams.map((team) => team.id);
    const [data, openClaims] = await Promise.all([
      getInsights(orgId, teamIds, period, member.role === "owner" && !requestedTeamId),
      getOpenClaims(orgId, teamIds, member.role === "owner" ? null : userId),
    ]);
    data.unpaidClaims = openClaims;
    return res.json({ success: true, data, message: "Spending insights loaded." });
  } catch (error) { return next(error); }
}

export async function ask(req, res, next) {
  try {
    rateLimit(req.user?.sub || "anonymous");
    const { userId, orgId } = auth(req);
    const { question, from, to, teamId = null } = req.body || {};
    if (typeof question !== "string" || question.trim().length < 3 || question.length > 500) throw new ApiError(400, "Question must be between 3 and 500 characters.");
    if (teamId && !uuid.test(teamId)) throw new ApiError(400, "A valid team ID is required.");
    if ((from && !to) || (!from && to)) throw new ApiError(400, "Provide both from and to dates.");
    if (from && to) { try { customPeriod(from, to); } catch (error) { return fail(error); } }
    const { teams, member } = await authorizedScope(orgId, userId, teamId);
    const data = await askFinancialQuestion({ question: question.trim(), orgId, teamIds: teams.map((team) => team.id), teamNames: teams.map(({ id, name }) => ({ id, name })), requestedTeamId: teamId, from, to, includeUnassigned: member.role === "owner" });
    return res.json({ success: true, data, message: "Analytics question processed." });
  } catch (error) { return next(error); }
}

