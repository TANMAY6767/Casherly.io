import { apiClient } from '@/helper/commonHelper';

export interface TeamTransaction {
  id: string;
  teamId: string;
  createdById: string | null;
  transactionType: string;
  description: string | null;
  referenceId: string | null;
  createdAt: string;
  createdBy: { id: string; name: string; email: string } | null;
  ledgerEntries: {
    id: string;
    accountId: string;
    debit: string;
    credit: string;
    description: string | null;
    account: { id: string; name: string; accountType: string };
  }[];
}

export type ReimbursementStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';

export interface ReimbursementClaim {
  id: string;
  organizationId: string;
  employeeId: string;
  teamId: string;
  amount: string;
  description: string | null;
  status: ReimbursementStatus;
  createdAt: string;
  updatedAt: string;
  employee: { id: string; name: string; email: string };
}

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

function unwrap<T>(response: { data: ApiEnvelope<T> | null; error: string | null }, fallback: string): T {
  if (response.error || !response.data?.success) throw new Error(response.error || response.data?.message || fallback);
  return response.data.data;
}

export async function getTeamTransactions(orgId: string, teamId: string): Promise<TeamTransaction[]> {
  const response = await apiClient.get<{ message: string; transactions: TeamTransaction[] }>(`/org/${encodeURIComponent(orgId)}/teams/${encodeURIComponent(teamId)}/transactions`);
  if (response.error || !response.data) throw new Error(response.error || 'Could not load team transactions.');
  return response.data.transactions ?? [];
}

export async function createTeamExpenseTransaction(orgId: string, teamId: string, input: { amount: number; description: string; category?: string }): Promise<TeamTransaction> {
  const response = await apiClient.post<ApiEnvelope<TeamTransaction>>(
    `/org/${encodeURIComponent(orgId)}/teams/${encodeURIComponent(teamId)}/transactions`,
    { transactionType: 'EXPENSE', amount: input.amount, description: input.description, category: input.category },
  );
  return unwrap(response, 'Could not record this team expense.');
}

export async function getTeamReimbursementClaims(orgId: string, teamId: string): Promise<ReimbursementClaim[]> {
  const response = await apiClient.get<ApiEnvelope<ReimbursementClaim[]>>(
    `/org/${encodeURIComponent(orgId)}/teams/${encodeURIComponent(teamId)}/reimbursement-claims`,
  );
  return unwrap(response, 'Could not load reimbursement claims.');
}

export async function createReimbursementClaim(orgId: string, teamId: string, input: { amount: number; description: string }): Promise<ReimbursementClaim> {
  const response = await apiClient.post<ApiEnvelope<{ claim: ReimbursementClaim }>>(
    `/org/${encodeURIComponent(orgId)}/teams/${encodeURIComponent(teamId)}/reimbursement-claims`,
    input,
  );
  return unwrap(response, 'Could not submit this reimbursement claim.').claim;
}

async function updateClaim(orgId: string, claimId: string, action: 'approve' | 'reject' | 'pay'): Promise<ReimbursementClaim> {
  const response = await apiClient.patch<ApiEnvelope<ReimbursementClaim | { claim: ReimbursementClaim }>>(
    `/org/${encodeURIComponent(orgId)}/reimbursement-claims/${encodeURIComponent(claimId)}/${action}`,
    {},
  );
  const result = unwrap(response, `Could not ${action} this reimbursement claim.`);
  return 'claim' in result ? result.claim : result;
}

export const approveReimbursementClaim = (orgId: string, claimId: string) => updateClaim(orgId, claimId, 'approve');
export const rejectReimbursementClaim = (orgId: string, claimId: string) => updateClaim(orgId, claimId, 'reject');
export const payReimbursementClaim = (orgId: string, claimId: string) => updateClaim(orgId, claimId, 'pay');
