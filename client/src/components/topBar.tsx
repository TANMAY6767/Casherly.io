import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ChevronRight, FileClock, LayoutDashboard, Menu, ReceiptText, Search, Settings2, UsersRound, X, Sparkles } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';

const labels: Record<string, string> = { '': 'Organizations', dashboard: 'Overview', organization: 'Organization details', teams: 'Teams & budgets', expenses: 'Transactions', 'audit-log': 'Audit log', 'spending-insights': 'Spending insights', settings: 'Settings', profile: 'My profile' };
const destinations = [
  { to: '/dashboard', label: 'Overview', hint: 'Organization summary', icon: LayoutDashboard },
  { to: '/', label: 'Organizations', hint: 'Your workspaces', icon: Building2 },
  { to: '/teams', label: 'Teams & budgets', hint: 'Manage teams', icon: UsersRound },
  { to: '/expenses', label: 'Transactions', hint: 'Expenses and activity', icon: ReceiptText },
  { to: '/audit-log', label: 'Audit log', hint: 'Organization activity history', icon: FileClock },
  { to: '/spending-insights', label: 'Spending insights', hint: 'AI spending questions and trends', icon: Sparkles },
  { to: '/settings', label: 'Settings', hint: 'Workspace preferences', icon: Settings2 },
];

export default function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { organizations, activeOrganization, selectOrganization } = useOrganization();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const parts = pathname.split('/').filter(Boolean);
  const current = labels[parts[0]] || 'Organization';
  const initials = user?.name?.trim().slice(0, 2).toUpperCase() || 'JD';
  const shortcutLabel = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingPages = useMemo(() => destinations.filter((item) => `${item.label} ${item.hint}`.toLocaleLowerCase().includes(normalizedQuery)), [normalizedQuery]);
  const matchingOrganizations = useMemo(() => organizations.filter((item) => item.name.toLocaleLowerCase().includes(normalizedQuery)), [normalizedQuery, organizations]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (event.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (searchOpen) window.setTimeout(() => inputRef.current?.focus(), 0);
    else setQuery('');
  }, [searchOpen]);

  const openOrganization = (id: string) => {
    selectOrganization(id);
    setSearchOpen(false);
    navigate('/dashboard');
  };

  return <>
    <header className="topbar">
      <button className="icon-button mobile-menu" onClick={onMenuClick} aria-label="Open menu"><Menu size={20}/></button>
      <div className="breadcrumbs"><Link to="/">Organizations</Link>{activeOrganization && parts.length > 0 && <><ChevronRight size={14}/><span>{activeOrganization.name}</span></>}<ChevronRight size={14}/><span className="crumb-current">{current}</span></div>
      <div className="topbar-actions">
        <button className="search-trigger" onClick={() => setSearchOpen(true)} aria-label="Search pages and organizations" aria-haspopup="dialog" aria-expanded={searchOpen}><Search size={16}/><span>Search pages and organizations</span><kbd>{shortcutLabel}</kbd></button>
        <div className="topbar-divider"/>
        <Link to="/profile" className="avatar avatar-indigo top-avatar" aria-label={`My profile, ${user?.name || 'user'}`}>{initials}</Link>
      </div>
    </header>

    {searchOpen && <div className="command-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
      <section className="command-dialog" role="dialog" aria-modal="true" aria-label="Search pages and organizations">
        <div className="command-search"><Search size={18}/><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages or organizations..." aria-label="Search"/><button className="icon-button" onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={18}/></button></div>
        <div className="command-results">
          {matchingPages.length > 0 && <><p className="command-label">PAGES</p>{matchingPages.map(({ to, label, hint, icon: Icon }) => <button className="command-item" key={to} onClick={() => { setSearchOpen(false); navigate(to); }}><span className="command-icon"><Icon size={16}/></span><span><strong>{label}</strong><small>{hint}</small></span><ChevronRight size={15}/></button>)}</>}
          {matchingOrganizations.length > 0 && <><p className="command-label">ORGANIZATIONS</p>{matchingOrganizations.map((organization) => <button className="command-item" key={organization.id} onClick={() => openOrganization(organization.id)}><span className="command-icon"><Building2 size={16}/></span><span><strong>{organization.name}</strong><small>{organization.memberCount} {organization.memberCount === 1 ? 'member' : 'members'} · {organization.role}</small></span><ChevronRight size={15}/></button>)}</>}
          {matchingPages.length === 0 && matchingOrganizations.length === 0 && <div className="command-empty"><Search size={18}/><strong>No results found</strong><span>Try a page name or organization.</span></div>}
        </div>
        <div className="command-footer"><span>Search pages and organizations</span><span><kbd>esc</kbd> to close</span></div>
      </section>
    </div>}
  </>;
}
