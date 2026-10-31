import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Download, Plus, ReceiptText, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useOrganization } from '@/context/OrganizationContext';
import { getAllTeams, type TeamListItem } from '@/services/teams/teams';
import { approveReimbursementClaim, createTeamExpenseTransaction, payReimbursementClaim, rejectReimbursementClaim } from '@/services/teamActivity';
import { getOrganizationActivity, getTeamActivity, type ActivityQuery, type ActivityType, type OrganizationActivityRecord, type ActivityResponse } from '@/services/transactions/activity';

type ActivityFilter = 'all' | 'expenses' | 'reimbursements' | 'other';
type DateFilter = 'all' | '30days' | 'thisMonth' | 'thisYear';
const money = (amount: number | string, currency: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount) || 0);
const moneyByCurrency = (values: { amount: number; currency: string }[]) => {
  const totals = values.reduce<Record<string, number>>((result, value) => { result[value.currency] = (result[value.currency] ?? 0) + value.amount; return result; }, {});
  return Object.entries(totals).map(([currency, amount]) => money(amount, currency)).join(' · ') || money(0, 'INR');
};
const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
const typeForFilter: Record<ActivityFilter, ActivityType> = { all: 'all', expenses: 'expense', reimbursements: 'reimbursement', other: 'other' };

export default function TransactionPage() {
  const { activeOrganization, activeOrganizationId, loadingOrganizations } = useOrganization();
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [items, setItems] = useState<OrganizationActivityRecord[]>([]);
  const [pagination, setPagination] = useState<ActivityResponse['pagination']>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [summary, setSummary] = useState<ActivityResponse['summary']>({ transactions: 0, reimbursementClaims: 0, totalRecords: 0 });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<OrganizationActivityRecord | null>(null);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    if (!activeOrganizationId) { setTeams([]); setSelectedTeam(''); return; }
    let cancelled = false;
    setTeams([]); setSelectedTeam(''); setItems([]); setPage(1); setTeamFilter('all'); setStatusFilter('all'); setError('');
    void getAllTeams(activeOrganizationId).then((result) => {
      if (cancelled) return;
      setTeams(result);
      setSelectedTeam(result[0]?.id ?? '');
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load teams for this organization.');
    });
    return () => { cancelled = true; };
  }, [activeOrganizationId]);

  const query = useMemo<ActivityQuery>(() => {
    const now = new Date();
    let from: string | undefined;
    if (dateFilter === '30days') { const date = new Date(now); date.setDate(date.getDate() - 30); from = date.toISOString(); }
    else if (dateFilter === 'thisMonth') from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    else if (dateFilter === 'thisYear') from = new Date(now.getFullYear(), 0, 1).toISOString();
    return {
      type: typeForFilter[activityFilter],
      status: statusFilter as ActivityQuery['status'],
      search: search.trim() || undefined,
      from,
      limit: 50,
    };
  }, [activityFilter, dateFilter, search, statusFilter]);

  const fetchActivity = useCallback((orgId: string, teamId: string, activityQuery: ActivityQuery, pageNumber: number) => {
    const requestQuery = { ...activityQuery, page: pageNumber };
    return teamId === 'all'
      ? getOrganizationActivity(orgId, requestQuery)
      : getTeamActivity(orgId, teamId, requestQuery);
  }, []);

  useEffect(() => {
    if (!activeOrganizationId) { setItems([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void fetchActivity(activeOrganizationId, teamFilter, query, page)
        .then((result) => {
          if (cancelled) return;
          setItems(result.items);
          setPagination(result.pagination);
          setSummary(result.summary);
          setError('');
        })
        .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load organization activity.'); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, search ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [activeOrganizationId, fetchActivity, page, query, search, teamFilter]);

  const expenseItems = items.filter((item) => item.recordType === 'transaction' && item.transactionType === 'EXPENSE');
  const reimbursementItems = items.filter((item) => item.recordType === 'reimbursement_claim' || item.transactionType?.startsWith('REIMBURSEMENT'));
  const visibleExpenseSpend = moneyByCurrency(expenseItems.map((item) => ({ amount: Number(item.amount), currency: item.currency })));
  const selectedTeamCurrency = teams.find((team) => team.id === selectedTeam)?.budget?.currency ?? 'INR';

  const changeFilter = (update: () => void) => { update(); setPage(1); };

  const createTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeOrganizationId || !selectedTeam || saving) return;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) { setError('Enter an amount greater than zero.'); return; }
    try {
      setSaving(true); setError('');
      await createTeamExpenseTransaction(activeOrganizationId, selectedTeam, { amount: parsedAmount, description: description.trim(), category });
      setShowForm(false); setDescription(''); setAmount(''); setPage(1);
      const result = await fetchActivity(activeOrganizationId, teamFilter, query, 1);
      setItems(result.items); setPagination(result.pagination); setSummary(result.summary);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not record this expense.'); }
    finally { setSaving(false); }
  };

  const updateClaim = async (item: OrganizationActivityRecord, action: 'approve' | 'reject' | 'pay') => {
    if (!activeOrganizationId || actionId || item.recordType !== 'reimbursement_claim') return;
    try {
      setActionId(item.id); setError('');
      if (action === 'approve') await approveReimbursementClaim(activeOrganizationId, item.id);
      else if (action === 'reject') await rejectReimbursementClaim(activeOrganizationId, item.id);
      else await payReimbursementClaim(activeOrganizationId, item.id);
      const result = await fetchActivity(activeOrganizationId, teamFilter, query, page);
      setItems(result.items); setPagination(result.pagination); setSummary(result.summary);
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Could not ${action} this reimbursement.`); }
    finally { setActionId(''); }
  };

  const exportCsv = async () => {
    if (!activeOrganizationId || exporting || !pagination.total) return;
    try {
      setExporting(true); setError('');
      const allItems: OrganizationActivityRecord[] = [];
      const totalPages = Math.max(1, Math.ceil(pagination.total / 100));
      for (let currentPage = 1; currentPage <= totalPages; currentPage += 1) {
        const result = await fetchActivity(activeOrganizationId, teamFilter, { ...query, limit: 100 }, currentPage);
        allItems.push(...result.items);
      }
      const header = ['Date', 'Record type', 'Activity type', 'Description', 'Organization', 'Team', 'Person', 'Status', 'Amount', 'Currency', 'Reference'];
      const lines = allItems.map((item) => [
        new Date(item.createdAt).toISOString(), item.recordType, item.transactionType ?? 'REIMBURSEMENT_CLAIM',
        item.description ?? '', activeOrganization?.name ?? '', item.team?.name ?? '', item.person?.name ?? '',
        item.status ?? '', item.amount, item.currency, item.referenceId ?? item.id,
      ].map(csvCell).join(','));
      const blob = new Blob([[header.map(csvCell).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${activeOrganization?.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'organization'}-activity.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not export this activity.'); }
    finally { setExporting(false); }
  };

  if (loadingOrganizations) return <div className="page-wrap"><section className="panel org-home-empty"><p>Loading your workspace…</p></section></div>;
  if (!activeOrganization) return <div className="page-wrap"><section className="panel org-home-empty"><span className="modal-icon"><ReceiptText size={19}/></span><h1>Choose an organization</h1><p>Select an organization from the workspace menu to view its transactions.</p><Link className="button button-primary" to="/">View organizations <ArrowRight size={15}/></Link></section></div>;

  return <div className="page-wrap">
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/> {activeOrganization.name}</div><h1>Transactions &amp; activity</h1><p>Explore expenses, reimbursement claims, and team activity for this organization.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={() => void exportCsv()} disabled={!pagination.total || exporting}><Download size={15}/>{exporting ? 'Exporting…' : 'Export CSV'}</button><button className="button button-primary" onClick={() => { setError(''); setShowForm(true); }} disabled={!teams.length}><Plus size={17}/>Record expense</button></div></div>
    {error && <div className="form-note" role="alert">{error}</div>}
    <div className="transaction-stats"><div className="panel transaction-stat"><span className="metric-icon"><ReceiptText size={18}/></span><span className="subtle-label">EXPENSE SPEND ON PAGE</span><strong>{visibleExpenseSpend}</strong><small>{expenseItems.length} expense transactions on this page</small></div><div className="panel transaction-stat"><span className="metric-icon"><ReceiptText size={18}/></span><span className="subtle-label">MATCHING ACTIVITY</span><strong>{pagination.total}</strong><small>{activeOrganization.name} · {summary.transactions} transactions, {summary.reimbursementClaims} claims</small></div><div className="panel transaction-stat"><span className="metric-icon"><Check size={18}/></span><span className="subtle-label">REIMBURSEMENTS ON PAGE</span><strong>{reimbursementItems.length}</strong><small>Claims and reimbursement transactions</small></div></div>

    <section className="panel transactions-panel ledger-panel activity-ledger">
      <div className="activity-ledger-heading"><div><h2>{teamFilter === 'all' ? 'Organization activity' : `${teams.find((team) => team.id === teamFilter)?.name ?? 'Team'} activity`}</h2><p>{loading ? 'Loading activity…' : `${pagination.total} ${pagination.total === 1 ? 'record' : 'records'} match these filters`}</p></div><span className="activity-scope"><ReceiptText size={14}/>{teamFilter === 'all' ? `All ${teams.length} accessible teams` : teams.find((team) => team.id === teamFilter)?.name}</span></div>
      <div className="activity-filter-bar">
        <div className="activity-tabs" aria-label="Activity type">
          {([['all', 'All activity'], ['expenses', 'Expenses'], ['reimbursements', 'Reimbursements'], ['other', 'Other']] as [ActivityFilter, string][]).map(([key, label]) => <button key={key} className={`activity-tab ${activityFilter === key ? 'activity-tab-active' : ''}`} onClick={() => changeFilter(() => { setActivityFilter(key); if (key === 'expenses' || key === 'other') setStatusFilter('all'); })}>{label}{key === 'reimbursements' && activityFilter === key && <span>{pagination.total}</span>}</button>)}
        </div>
        <div className="activity-filters">
          <label className="search-field"><Search size={16}/><input aria-label="Search activity" value={search} onChange={(event) => changeFilter(() => setSearch(event.target.value))} placeholder="Search description, team, person"/></label>
          <select className="filter-select" aria-label="Filter by team" value={teamFilter} onChange={(event) => changeFilter(() => setTeamFilter(event.target.value))}><option value="all">All accessible teams</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
          <select className="filter-select" aria-label="Filter by date" value={dateFilter} onChange={(event) => changeFilter(() => setDateFilter(event.target.value as DateFilter))}><option value="all">All dates</option><option value="30days">Last 30 days</option><option value="thisMonth">This month</option><option value="thisYear">This year</option></select>
          {(activityFilter === 'all' || activityFilter === 'reimbursements') && <select className="filter-select" aria-label="Filter reimbursement status" value={statusFilter} onChange={(event) => changeFilter(() => setStatusFilter(event.target.value))}><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="rejected">Rejected</option></select>}
        </div>
      </div>

      <div className="table-scroll"><table className="data-table transaction-table activity-table"><thead><tr><th>ACTIVITY</th><th>TEAM</th><th>PERSON</th><th>DATE</th><th>TYPE / STATUS</th><th className="align-right">AMOUNT</th>{activeOrganization.role === 'owner' && <th>ACTIONS</th>}</tr></thead><tbody>
        {items.map((item) => {
          const isClaim = item.recordType === 'reimbursement_claim';
          const typeLabel = isClaim ? 'Reimbursement claim' : (item.transactionType ?? 'Transaction').replace(/_/g, ' ').toLowerCase();
          const status = item.status;
          return <tr key={`${item.recordType}-${item.id}`}>
            <td><div className="transaction-title"><span className={`merchant-icon ${isClaim ? 'peach' : 'lavender'}`}><ReceiptText size={16}/></span><button className="activity-record-link" onClick={() => setSelectedRecord(item)}><strong>{item.description || (isClaim ? 'Reimbursement request' : 'Team transaction')}</strong><small>{item.id} · View details</small></button></div></td>
            <td>{item.team ? <Link className="activity-team-link" to={`/teams/${item.team.id}`}>{item.team.name}<ArrowRight size={12}/></Link> : '—'}</td>
            <td>{item.person?.name ?? '—'}</td>
            <td>{new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
            <td>{isClaim && status ? <span className={`claim-status status-${status.toLowerCase()}`}>{status}</span> : <span className="category-pill">{typeLabel}</span>}</td>
            <td className="align-right amount-cell">{item.transactionType === 'REIMBURSEMENT_REJECTION_REVERSAL' ? '+' : '−'}{money(item.amount, item.currency)}</td>
            {activeOrganization.role === 'owner' && <td>{isClaim && status && status !== 'REJECTED' && status !== 'PAID' ? <div className="claim-actions">{status === 'PENDING' && <><button className="claim-action-button approve" disabled={actionId === item.id} onClick={() => void updateClaim(item, 'approve')}>Approve</button><button className="claim-action-button reject" disabled={actionId === item.id} onClick={() => void updateClaim(item, 'reject')}>Reject</button></>}{status === 'APPROVED' && <button className="claim-action-button pay" disabled={actionId === item.id} onClick={() => void updateClaim(item, 'pay')}>Mark paid</button>}</div> : <span className="activity-no-action">—</span>}</td>}
          </tr>;
        })}
      </tbody></table>
        {!loading && items.length === 0 && <div className="empty-state"><span><Search size={20}/></span><strong>{pagination.total ? 'No matching activity on this page' : 'No matching activity'}</strong><p>{pagination.total ? 'Go to another page or adjust the filters.' : 'Change the filters or record an expense to add activity.'}</p></div>}
      </div>
      <div className="table-pagination"><span>Showing <strong>{pagination.total ? (pagination.page - 1) * pagination.limit + 1 : 0}–{Math.min(pagination.page * pagination.limit, pagination.total)}</strong> of <strong>{pagination.total}</strong> records</span><span className="transaction-scope-note">{activeOrganization.name} · {teamFilter === 'all' ? 'all accessible teams' : 'selected team'}</span><div className="activity-pagination"><button className="button button-secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={loading || page <= 1}><ChevronLeft size={14}/>Previous</button><span>Page {pagination.page} of {Math.max(pagination.totalPages, 1)}</span><button className="button button-secondary" onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} disabled={loading || page >= pagination.totalPages}>Next<ChevronRight size={14}/></button></div></div>
    </section>

    {selectedRecord && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedRecord(null); }}><section className="modal-card activity-detail-modal"><div className="modal-heading"><div><span className="modal-icon"><ReceiptText size={18}/></span><h2>{selectedRecord.description || 'Activity details'}</h2><p>{selectedRecord.recordType === 'reimbursement_claim' ? 'Reimbursement claim' : (selectedRecord.transactionType ?? 'Transaction').replace(/_/g, ' ')}</p></div><button type="button" className="icon-button" onClick={() => setSelectedRecord(null)} aria-label="Close details"><X size={19}/></button></div>
      <div className="activity-detail-grid"><div><span>Amount</span><strong>{money(selectedRecord.amount, selectedRecord.currency)}</strong></div><div><span>Team</span><strong>{selectedRecord.team?.name ?? '—'}</strong></div><div><span>Recorded by</span><strong>{selectedRecord.person?.name ?? '—'}</strong></div><div><span>Date</span><strong>{new Date(selectedRecord.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</strong></div>{selectedRecord.status && <div><span>Status</span><strong className={`claim-status status-${selectedRecord.status.toLowerCase()}`}>{selectedRecord.status}</strong></div>}{selectedRecord.referenceId && <div><span>Reference</span><strong className="activity-reference">{selectedRecord.referenceId}</strong></div>}</div>
      {selectedRecord.ledgerEntries.length > 0 && <div className="activity-ledger-entries"><h3>Ledger entries</h3><div className="table-scroll"><table className="data-table"><thead><tr><th>ACCOUNT</th><th>DESCRIPTION</th><th className="align-right">DEBIT</th><th className="align-right">CREDIT</th></tr></thead><tbody>{selectedRecord.ledgerEntries.map((entry) => <tr key={entry.id}><td>{entry.account.name}</td><td>{entry.description || '—'}</td><td className="align-right">{money(entry.debit, selectedRecord.currency)}</td><td className="align-right">{money(entry.credit, selectedRecord.currency)}</td></tr>)}</tbody></table></div></div>}
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setSelectedRecord(null)}>Close</button>{selectedRecord.team && <Link className="button button-primary" to={`/teams/${selectedRecord.team.id}`} onClick={() => setSelectedRecord(null)}>Open team <ArrowRight size={14}/></Link>}</div>
    </section></div>}

    {showForm && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowForm(false); }}><form className="modal-card" onSubmit={(event) => void createTransaction(event)}><div className="modal-heading"><div><span className="modal-icon"><ReceiptText size={18}/></span><h2>Record a team expense</h2><p>This expense will be recorded in {activeOrganization.name}.</p></div><button type="button" className="icon-button" onClick={() => setShowForm(false)} aria-label="Close" disabled={saving}><X size={19}/></button></div>
      <label className="form-label">Team<select required value={selectedTeam} onChange={(event) => setSelectedTeam(event.target.value)}>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
      <label className="form-label">Amount<div className="input-with-prefix"><span>{selectedTeamCurrency}</span><input required min="0.01" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00"/></div></label>
      <label className="form-label">Description<input required maxLength={240} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What was this expense for?"/></label>
      <label className="form-label">Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Uncategorized</option>{['Travel','Meals','Software','Supplies','Marketing','Transport','Other'].map((item) => <option key={item}>{item}</option>)}</select></label>
      {error && <div className="form-note" role="alert">{error}</div>}<div className="form-note"><ReceiptText size={16}/> The expense will be deducted from the selected team's budget.</div><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button><button type="submit" className="button button-primary" disabled={saving || !teams.length}><Plus size={16}/>{saving ? 'Saving…' : 'Save expense'}</button></div></form></div>}
  </div>;
}
