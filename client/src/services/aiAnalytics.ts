import { apiClient } from '@/helper/commonHelper';

export type AnalyticsPeriod = 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'year_to_date';
export interface AnalyticsLine { currency: string; amount: string; previousAmount?: string; comparison?: { value: number | null; reason: string | null }; teamId?: string | null; teamName?: string; category?: string; count?: number }
export interface ExpenseLine { id?: string; description: string | null; teamName: string | null; amount: string; currency: string; createdAt: string }
export interface Insights { period: { from: string; to: string; timezone: string; label: string }; comparisonPeriod: { from: string; to: string }; currency: string; calculation: string; totals: AnalyticsLine[]; teams: AnalyticsLine[]; categories: AnalyticsLine[]; largestExpenses: ExpenseLine[]; unpaidClaims: { status: string; currency: string; amount: string }[]; hasData: boolean; categoryLimitation: string }
export interface Answer { answer: string; period: { from: string; to: string; timezone?: string } | null; currency: string | null; metrics: unknown | null; results: Record<string, unknown>[]; limitations: string[] }
interface Envelope<T> { success: boolean; data: T; message: string }
function unwrap<T>(response: { data: Envelope<T> | null; error: string | null }): T { if (response.error || !response.data?.success) throw new Error(response.error || response.data?.message || 'Analytics request failed.'); return response.data.data; }
export async function getInsights(orgId: string, period: AnalyticsPeriod, teamId?: string) { const response = await apiClient.get<Envelope<Insights>>(`/org/${encodeURIComponent(orgId)}/ai/insights`, { params: { period, ...(teamId ? { teamId } : {}) } }); return unwrap(response); }
export async function askSpending(orgId: string, input: { question: string; teamId?: string }) { const response = await apiClient.post<Envelope<Answer>>(`/org/${encodeURIComponent(orgId)}/ai/ask`, input); return unwrap(response); }
