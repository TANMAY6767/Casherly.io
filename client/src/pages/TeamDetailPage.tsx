import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, CalendarDays, Check, CircleDollarSign, Plus, ReceiptText, ShieldCheck, UsersRound, WalletCards } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getOrg, type OrganizationDetail } from '@/services/oraganizations/org.services';
import { addTeamMember, getAllTeams, getOneTeam, getRemainingBudget, removeTeamMember, updateTeamMemberRole, type RemainingBudget, type TeamDetail, type TeamListItem } from '@/services/teams/teams';
import { approveReimbursementClaim, createReimbursementClaim, createTeamExpenseTransaction, getTeamReimbursementClaims, getTeamTransactions, payReimbursementClaim, rejectReimbursementClaim, type ReimbursementClaim, type TeamTransaction } from '@/services/teamActivity';
import { useOrganization } from '@/context/OrganizationContext';

const money = (amount: number | string, currency: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount) || 0);
const initials = (name: string) => name.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const transactionAmount = (transaction: TeamTransaction) => transaction.ledgerEntries.find((entry) => entry.account.accountType === 'expense')?.debit ?? transaction.ledgerEntries[0]?.debit ?? '0';

export default function TeamDetailPage() {
  const { teamId = '' } = useParams();
  const { user } = useAuth();
  const { activeOrganization, activeOrganizationId: organizationId, loadingOrganizations } = useOrganization();
  const [organizationDetail, setOrganizationDetail] = useState<OrganizationDetail | null>(null);
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [remainingBudget, setRemainingBudget] = useState<RemainingBudget | null>(null);
  const [transactions, setTransactions] = useState<TeamTransaction[]>([]);
  const [claims, setClaims] = useState<ReimbursementClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activityError, setActivityError] = useState('');
  const [remainingError, setRemainingError] = useState('');
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseSaved, setExpenseSaved] = useState(false);
  const [formError, setFormError] = useState('');
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimDescription, setClaimDescription] = useState('');
  const [claimAmount, setClaimAmount] = useState('');
  const [claimSaving, setClaimSaving] = useState(false);
  const [claimFeedback, setClaimFeedback] = useState('');
  const [claimError, setClaimError] = useState('');
  const [claimActionId, setClaimActionId] = useState('');
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState<'member' | 'admin'>('member');
  const [memberError, setMemberError] = useState('');
  const [memberSaving, setMemberSaving] = useState(false);

  const loadDetail = useCallback(async (orgId: string) => {
    const result = await getOneTeam(orgId, teamId);
    if (!result) throw new Error('Team not found.');
    setDetail(result);
    const [orgResult, budgetResult, transactionResult, claimResult] = await Promise.allSettled([
      getOrg(orgId),
      result.budget ? getRemainingBudget(teamId) : Promise.resolve(null),
      getTeamTransactions(orgId, teamId),
      getTeamReimbursementClaims(orgId, teamId),
    ]);
    if (orgResult.status === 'fulfilled') setOrganizationDetail(orgResult.value);
    if (budgetResult.status === 'fulfilled') { setRemainingBudget(budgetResult.value); setRemainingError(''); }
    else { setRemainingBudget(null); setRemainingError(budgetResult.reason instanceof Error ? budgetResult.reason.message : 'Could not load remaining budget.'); }
    if (transactionResult.status === 'fulfilled') setTransactions(transactionResult.value);
    if (claimResult.status === 'fulfilled') setClaims(claimResult.value);
    const activityFailures = [transactionResult, claimResult].filter((item) => item.status === 'rejected');
    setActivityError(activityFailures.length ? 'Some team activity could not be loaded. Refresh the page and try again.' : '');
  }, [teamId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (loadingOrganizations) { setLoading(true); return; }
      if (!organizationId) { setLoading(loadingOrganizations); return; }
      try {
        setLoading(true); setError(''); setDetail(null); setOrganizationDetail(null); setRemainingBudget(null);
        const [teamList, organization] = await Promise.all([getAllTeams(organizationId), getOrg(organizationId)]);
        const listItem: TeamListItem | undefined = teamList.find((team) => team.id === teamId);
        const hasTeamAccess = Boolean(listItem && (activeOrganization?.role === 'owner' || listItem.createdById === user?.id || listItem.members.length > 0));
        if (!hasTeamAccess) { if (!cancelled) setDetail(null); return; }
        if (!cancelled) { setOrganizationDetail(organization); await loadDetail(organizationId); }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load this team.');
      } finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [teamId, user?.id, loadDetail, organizationId, activeOrganization?.role, loadingOrganizations]);

  const teamTransactions = useMemo(() => [...transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [transactions]);
  if (!organizationId && !loadingOrganizations) return <div className="page-wrap"><section className="panel org-home-empty"><span className="modal-icon"><UsersRound size={19}/></span><h1>Choose an organization</h1><p>Select an organization to open its team details.</p><Link className="button button-primary" to="/">View organizations</Link></section></div>;
  if (!loading && !detail && !error) return <Navigate to="/teams" replace />;
  if (!detail) return <div className="page-wrap">{error ? <div className="form-note" role="alert">{error}</div> : <section className="panel team-empty-state"><p>{loading ? 'Loading team…' : 'Team unavailable.'}</p></section>}</div>;

  const budgetAmount = Number(detail.budget?.totalBudget ?? 0);
  const spent = remainingBudget?.spending.spent ?? 0;
  const left = remainingBudget?.remaining;
  const percentUsed = budgetAmount ? Math.round((spent / budgetAmount) * 100) : 0;
  const myMembership = detail.members.find((member) => member.userId === user?.id);
  const isOrganizationOwner = organizationDetail?.createdById === user?.id;
  const access = isOrganizationOwner ? 'Organization owner' : myMembership?.role === 'admin' ? 'Team admin' : myMembership?.role === 'owner' ? 'Team owner' : 'Team member';
  const canManageMembers = detail.createdById === user?.id;
  const eligibleMembers = organizationDetail?.members.filter((member) => !detail.members.some((teamMember) => teamMember.userId === member.userId)) ?? [];

  const submitExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError(''); setExpenseSaved(false);
    const amount = Number(expenseAmount);
    if (!expenseDescription.trim()) { setFormError('Describe this expense.'); return; }
    if (!Number.isFinite(amount) || amount <= 0 || !/^\d{1,12}(?:\.\d{1,2})?$/.test(expenseAmount)) { setFormError('Enter a positive amount with up to two decimal places.'); return; }
    setExpenseSaving(true);
    try {
      await createTeamExpenseTransaction(organizationId, teamId, { amount, description: expenseDescription.trim(), category: expenseCategory });
      setExpenseDescription(''); setExpenseAmount(''); setShowTransactionForm(false); setExpenseSaved(true);
      await loadDetail(organizationId);
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Could not record this expense.'); }
    finally { setExpenseSaving(false); }
  };

  const submitClaim = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setClaimError(''); setClaimFeedback('');
    const amount = Number(claimAmount);
    if (!claimDescription.trim()) { setClaimError('Describe what you are claiming.'); return; }
    if (!Number.isFinite(amount) || amount <= 0 || !/^\d{1,10}(?:\.\d{1,2})?$/.test(claimAmount)) { setClaimError('Enter a positive amount with up to two decimal places.'); return; }
    setClaimSaving(true);
    try {
      await createReimbursementClaim(organizationId, teamId, { amount, description: claimDescription.trim() });
      setClaimDescription(''); setClaimAmount(''); setShowClaimForm(false); setClaimFeedback('Reimbursement request submitted.');
      await loadDetail(organizationId);
    } catch (cause) { setClaimError(cause instanceof Error ? cause.message : 'Could not submit the reimbursement request.'); }
    finally { setClaimSaving(false); }
  };

  const handleClaimAction = async (claim: ReimbursementClaim, action: 'approve' | 'reject' | 'pay') => {
    setClaimActionId(claim.id); setClaimError(''); setClaimFeedback('');
    try {
      if (action === 'approve') await approveReimbursementClaim(organizationId, claim.id);
      else if (action === 'reject') await rejectReimbursementClaim(organizationId, claim.id);
      else await payReimbursementClaim(organizationId, claim.id);
      setClaimFeedback(`Reimbursement claim ${({ approve: 'approved', reject: 'rejected', pay: 'paid' } as const)[action]}.`);
      await loadDetail(organizationId);
    } catch (cause) { setClaimError(cause instanceof Error ? cause.message : `Could not ${action} this claim.`); }
    finally { setClaimActionId(''); }
  };

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!memberUserId || memberSaving) return;
    setMemberSaving(true); setMemberError('');
    try { await addTeamMember(teamId, memberUserId, memberRole); await loadDetail(organizationId); setMemberUserId(''); }
    catch (cause) { setMemberError(cause instanceof Error ? cause.message : 'Could not add this member.'); }
    finally { setMemberSaving(false); }
  };

  const changeMemberRole = async (userId: string, role: 'member' | 'admin') => {
    setMemberError('');
    try { await updateTeamMemberRole(teamId, userId, role); await loadDetail(organizationId); }
    catch (cause) { setMemberError(cause instanceof Error ? cause.message : 'Could not update this role.'); }
  };

  const removeMember = async (member: TeamDetail['members'][number]) => {
    if (!window.confirm(`Remove ${member.user.name} from this team?`)) return;
    setMemberError('');
    try { await removeTeamMember(teamId, member.userId); await loadDetail(organizationId); }
    catch (cause) { setMemberError(cause instanceof Error ? cause.message : 'Could not remove this member.'); }
  };

  const renderClaimActions = (claim: ReimbursementClaim) => {
    if (!isOrganizationOwner) return null;
    if (claim.status === 'PENDING') return <><button className="claim-action claim-approve" disabled={claimActionId === claim.id} onClick={() => void handleClaimAction(claim, 'approve')}>Approve</button><button className="claim-action claim-reject" disabled={claimActionId === claim.id} onClick={() => void handleClaimAction(claim, 'reject')}>Reject</button></>;
    if (claim.status === 'APPROVED') return <button className="claim-action claim-approve" disabled={claimActionId === claim.id} onClick={() => void handleClaimAction(claim, 'pay')}>Pay claim</button>;
    return null;
  };

  return <div className="page-wrap team-detail-page">
    <Link to="/teams" className="back-link"><ArrowLeft size={15}/> All teams</Link>
    <section className="team-detail-hero panel">
      <div className="team-detail-identity"><div className="team-avatar tone-violet team-avatar-large">{initials(detail.name)}</div><div><div className="eyebrow"><span className="eyebrow-dot"/> {detail.organization.name.toUpperCase()}</div><h1>{detail.name}</h1><p>Team budget, membership, and spending activity.</p></div></div>
      <div className="team-detail-actions"><span className="team-access-chip"><ShieldCheck size={14}/>{access}</span><button type="button" className="button button-primary" disabled={!myMembership} title={!myMembership ? 'Join this team to record an expense.' : undefined} onClick={() => { setExpenseSaved(false); setShowTransactionForm((visible) => !visible); }}><CircleDollarSign size={16}/>Record expense</button><button type="button" className="button button-secondary" disabled={!myMembership} title={!myMembership ? 'Join this team to request reimbursement.' : undefined} onClick={() => { setClaimFeedback(''); setShowClaimForm((visible) => !visible); }}><Plus size={15}/>Request reimbursement</button></div>
      <div className="team-detail-meta"><span><CalendarDays size={15}/> Created {new Date(detail.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span><span><UsersRound size={15}/>{detail.members.length} team members</span><span><ReceiptText size={15}/>{teamTransactions.length} transactions</span></div>
    </section>

    {expenseSaved && <div className="team-success-note" role="status"><Check size={16}/> Expense recorded successfully.</div>}
    {claimFeedback && <div className="team-success-note" role="status"><Check size={16}/> {claimFeedback}</div>}
    {activityError && <div className="form-note team-page-error" role="alert">{activityError}</div>}

    {showTransactionForm && <form className="panel team-transaction-form" onSubmit={(event) => void submitExpense(event)}>
      <div className="team-form-heading"><div><h2>Record a team expense</h2><p>This creates an expense transaction and updates the team's ledger.</p></div><button type="button" className="icon-button" onClick={() => setShowTransactionForm(false)} aria-label="Close form">×</button></div>
      <div className="team-form-grid"><label className="form-label">Description<input autoFocus required maxLength={500} value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} placeholder="e.g. Design software subscription"/></label><label className="form-label">Amount ({detail.budget?.currency ?? 'INR'})<input required type="number" min="0.01" step="0.01" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} placeholder="0.00"/></label><label className="form-label">Category<select value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)}><option value="">Uncategorized</option>{['Travel','Meals','Software','Supplies','Marketing','Transport','Other'].map((item) => <option key={item}>{item}</option>)}</select></label></div>
      {formError && <p className="team-form-error" role="alert">{formError}</p>}<div className="team-form-footer"><span>Recorded by {user?.name || 'You'}</span><button type="button" className="button button-secondary" onClick={() => setShowTransactionForm(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={expenseSaving}>{expenseSaving ? 'Saving…' : 'Save expense'}</button></div>
    </form>}

    {showClaimForm && <form className="panel team-transaction-form" onSubmit={(event) => void submitClaim(event)}>
      <div className="team-form-heading"><div><h2>Request reimbursement</h2><p>Submit a claim for organization owner approval.</p></div><button type="button" className="icon-button" onClick={() => setShowClaimForm(false)} aria-label="Close form">×</button></div>
      <div className="team-form-grid"><label className="form-label">Description<input autoFocus required maxLength={500} value={claimDescription} onChange={(event) => setClaimDescription(event.target.value)} placeholder="What did you pay for?"/></label><label className="form-label">Amount ({detail.budget?.currency ?? 'INR'})<input required type="number" min="0.01" step="0.01" value={claimAmount} onChange={(event) => setClaimAmount(event.target.value)} placeholder="0.00"/></label></div>
      {claimError && <p className="team-form-error" role="alert">{claimError}</p>}<div className="team-form-footer"><span>Claim submitted by {user?.name || 'You'}</span><button type="button" className="button button-secondary" onClick={() => setShowClaimForm(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={claimSaving}>{claimSaving ? 'Submitting…' : 'Submit claim'}</button></div>
    </form>}

    {error && <div className="form-note team-page-error" role="alert">{error}</div>}

    <section className="team-budget-detail panel">
      <div className="team-budget-detail-head"><div><span className="subtle-label">TEAM BUDGET</span><h2>{detail.budget ? money(budgetAmount, detail.budget.currency) : 'No budget set'}</h2></div><span className="team-budget-icon"><WalletCards size={20}/></span></div>
      {detail.budget ? <><div className="team-budget-numbers"><div><span>Spent</span><strong>{remainingBudget ? money(spent, remainingBudget.budget.currency) : remainingError ? 'Unavailable' : 'Loading…'}</strong></div><div><span>Remaining</span><strong className={left !== undefined && left < 0 ? 'budget-over' : ''}>{left === undefined ? remainingError ? 'Unavailable' : 'Loading…' : money(left, remainingBudget?.budget.currency ?? detail.budget.currency)}</strong></div><div><span>Budget used</span><strong>{remainingBudget ? `${percentUsed}%` : '—'}</strong></div></div><div className="team-budget-track team-budget-track-large"><span style={{ width: `${Math.min(percentUsed, 100)}%` }}/></div><div className="team-budget-caption">{remainingBudget ? left! >= 0 ? `${money(left!, remainingBudget.budget.currency)} remaining` : `${money(Math.abs(left!), remainingBudget.budget.currency)} over budget` : remainingError || 'Loading budget balance…'}</div></> : <p className="team-budget-caption">The team owner can set a budget from the teams page.</p>}
    </section>

    <div className="team-detail-columns">
      <section className="panel team-member-detail"><div className="panel-heading"><div><h2>Team members</h2><p>People with access to this team.</p></div><span className="inline-count">{detail.members.length}</span></div>
        {canManageMembers && <form className="team-add-member-form" onSubmit={(event) => void addMember(event)}><select aria-label="Choose organization member" value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)}><option value="">Add an organization member…</option>{eligibleMembers.map((member) => <option key={member.userId} value={member.userId}>{member.user.name} · {member.user.email}</option>)}</select><select aria-label="New team role" value={memberRole} onChange={(event) => setMemberRole(event.target.value as 'member' | 'admin')}><option value="member">Member</option><option value="admin">Admin</option></select><button className="button button-secondary" type="submit" disabled={!memberUserId || memberSaving}><Plus size={14}/>{memberSaving ? 'Adding…' : 'Add'}</button></form>}
        {memberError && <div className="form-note team-member-error" role="alert">{memberError}</div>}
        <div className="team-member-list">{detail.members.map((member) => <div className="team-member-row" key={member.id}><span className="avatar avatar-small avatar-indigo">{initials(member.user.name)}</span><div className="team-member-copy"><strong>{member.user.name}{member.userId === user?.id && <span className="you-label">You</span>}</strong><span>{member.user.email}</span></div>{canManageMembers && member.userId !== detail.createdById ? <div className="team-member-actions"><select aria-label={`Role for ${member.user.name}`} value={member.role} onChange={(event) => void changeMemberRole(member.userId, event.target.value as 'member' | 'admin')}><option value="member">Member</option><option value="admin">Admin</option></select><button className="edit-budget-button team-delete-action" onClick={() => void removeMember(member)}>Remove</button></div> : <span className={`team-role-pill role-${member.role}`}>{member.role === 'owner' ? 'Owner' : member.role === 'admin' ? 'Admin' : 'Member'}</span>}</div>)}</div>
      </section>
      <section className="panel team-about-panel"><div className="panel-heading"><div><h2>Team details</h2><p>About this team and its access.</p></div></div><dl className="team-about-list"><div><dt>Organization</dt><dd>{detail.organization.name}</dd></div><div><dt>Your access</dt><dd>{access}</dd></div><div><dt>Team owner</dt><dd>{detail.createdBy.name}</dd></div><div><dt>Created</dt><dd>{new Date(detail.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div><div><dt>Spend calculation</dt><dd>Ledger based</dd></div></dl></section>
    </div>

    <section className="panel team-transactions-panel"><div className="team-transactions-heading"><div><h2>Team transactions</h2><p>Expense and reimbursement activity recorded by the team.</p></div><span className="inline-count">{teamTransactions.length}</span></div>
      {teamTransactions.length ? <div className="table-scroll"><table className="data-table team-transactions-table"><thead><tr><th>TRANSACTION</th><th>TYPE</th><th>PAID BY</th><th>DATE</th><th className="amount-cell">AMOUNT</th></tr></thead><tbody>{teamTransactions.map((transaction) => <tr key={transaction.id}><td><div className="transaction-copy"><strong>{transaction.description || 'Team transaction'}</strong><small>{transaction.id}</small></div></td><td><span className="team-category-chip">{transaction.transactionType.replace(/_/g, ' ')}</span></td><td>{transaction.createdBy?.name ?? '—'}</td><td>{new Date(transaction.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td><td className="amount-cell">{transaction.transactionType === 'REIMBURSEMENT_REJECTION_REVERSAL' ? '+' : '−'}{money(transactionAmount(transaction), detail.budget?.currency ?? 'INR')}</td></tr>)}</tbody></table></div> : <div className="team-empty-transactions"><ReceiptText size={19}/><strong>No team transactions yet</strong><span>Record an expense to start the team activity list.</span></div>}
    </section>

    <section className="panel team-transactions-panel team-claims-panel"><div className="team-transactions-heading"><div><h2>Reimbursement claims</h2><p>{isOrganizationOwner ? 'Review requests from team members.' : 'Your reimbursement requests and their status.'}</p></div><span className="inline-count">{claims.length}</span></div>
      {claimError && <div className="form-note team-page-error" role="alert">{claimError}</div>}
      {claims.length ? <div className="table-scroll"><table className="data-table team-transactions-table"><thead><tr><th>CLAIM</th><th>REQUESTED BY</th><th>DATE</th><th>STATUS</th><th className="amount-cell">AMOUNT</th><th>ACTIONS</th></tr></thead><tbody>{claims.map((claim) => <tr key={claim.id}><td><div className="transaction-copy"><strong>{claim.description || 'Reimbursement request'}</strong><small>{claim.id}</small></div></td><td>{claim.employee.name}</td><td>{new Date(claim.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td><td><span className={`claim-status status-${claim.status.toLowerCase()}`}>{claim.status}</span></td><td className="amount-cell">{money(claim.amount, detail.budget?.currency ?? 'INR')}</td><td><div className="claim-actions">{renderClaimActions(claim)}</div></td></tr>)}</tbody></table></div> : <div className="team-empty-transactions"><ReceiptText size={19}/><strong>No reimbursement claims</strong><span>Team members can submit reimbursement requests here.</span></div>}
    </section>
  </div>;
}
