import type { Dispatch, SetStateAction } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Building2, LayoutDashboard, UsersRound, ReceiptText, Settings2, Sun, Moon, LogOut, X, WalletCards, FileClock, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';

const navItems = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/', label: 'Organizations', icon: Building2, end: true },
  { to: '/teams', label: 'Teams & budgets', icon: UsersRound },
  { to: '/expenses', label: 'Transactions', icon: ReceiptText },
  { to: '/audit-log', label: 'Audit log', icon: FileClock },
  { to: '/spending-insights', label: 'Spending insights', icon: Sparkles },
];

type Props = { open: boolean; onClose: () => void; isDark: boolean; setIsDark: Dispatch<SetStateAction<boolean>> };

export default function Sidebar({ open, onClose, isDark, setIsDark }: Props) {
  const { user, logout } = useAuth();
  const { organizations, activeOrganization, activeOrganizationId, selectOrganization } = useOrganization();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const handleLogout = () => { void logout(); navigate('/login', { replace: true }); };
  const initials = user?.name?.trim().slice(0, 2).toUpperCase() || 'JD';
  const switchOrganization = (id: string) => {
    selectOrganization(id);
    if (pathname.startsWith('/teams/')) navigate('/teams');
    else if (pathname === '/' || pathname.startsWith('/organization/')) navigate('/dashboard');
  };

  return <>
    <button aria-label="Close navigation" className={`sidebar-backdrop ${open ? 'show' : ''}`} onClick={onClose} />
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand-lockup">
        <div className="brand-mark"><WalletCards size={21} /></div>
        <div><div className="brand-name">Cashflow</div><div className="brand-caption">WORKSPACE</div></div>
        <button className="icon-button sidebar-close" onClick={onClose} aria-label="Close menu"><X size={18}/></button>
      </div>
      <label className="workspace-switcher workspace-switcher-control">
        <div className="workspace-avatar">{activeOrganization?.name.trim().slice(0, 1).toUpperCase() ?? 'W'}</div>
        <div className="workspace-meta"><span className="workspace-label">WORKSPACE</span><strong>{activeOrganization?.name ?? 'All organizations'}</strong></div>
        <select aria-label="Switch organization" value={activeOrganizationId} onChange={(event) => switchOrganization(event.target.value)}>
          <option value="">All organizations</option>
          {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
        </select>
      </label>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="side-nav">
        {navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={onClose} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Icon size={18} strokeWidth={1.8}/><span>{label}</span>
        </NavLink>)}
      </nav>
      <div className="nav-caption nav-caption-spaced">PREFERENCES</div>
      <nav className="side-nav"><NavLink to="/settings" onClick={onClose} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Settings2 size={18}/><span>Settings</span></NavLink></nav>
      <div className="sidebar-bottom">
        <button className="theme-toggle" onClick={() => setIsDark((value) => !value)}><span className="theme-toggle-icon">{isDark ? <Sun size={17}/> : <Moon size={17}/>}</span><span>{isDark ? 'Light mode' : 'Dark mode'}</span><span className={`switch ${isDark ? 'switch-on' : ''}`}><i/></span></button>
        <div className="user-card"><div className="avatar avatar-indigo">{initials}</div><div className="user-info"><strong>{user?.name || 'User'}</strong><span>{user?.email || ''}</span></div><button onClick={handleLogout} className="icon-button logout-button" aria-label="Log out"><LogOut size={17}/></button></div>
      </div>
    </aside>
  </>;
}
