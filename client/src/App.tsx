import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';
import LoginPage from '@/pages/LoginPage';
import SignupPage from '@/pages/SignupPage';
import AcceptInvitationPage from '@/pages/AcceptInvitationPage'; // ← new
import TeamsPage from '@/pages/TeamsPage';
import TeamDetailPage from '@/pages/TeamDetailPage';
import OrganizationPage from '@/pages/Organization/OrganizationPage';
import OrganizationOverview from '@/pages/Organization/OrganizationOverview';
import DashboardPage from '@/pages/DashboardPage';
import TransactionPage from '@/pages/TransactionPage';
import ProfilePage from './pages/profile/ProfilePage';
import SettingsPage from './pages/settings/SettingsPage';
import AuditLogPage from './pages/AuditLogPage';
import SpendingInsightsPage from './pages/SpendingInsightsPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public auth routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Public route — the page handles login redirect itself */}
          <Route
            path="/invitations/accept"
            element={<AcceptInvitationPage />}
          />

          {/* Protected app shell */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<OrganizationPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="teams" element={<TeamsPage />} />
            <Route path="teams/:teamId" element={<TeamDetailPage />} />
            <Route path="expenses" element={<TransactionPage />} />
            <Route path="audit-log" element={<AuditLogPage />} />
            <Route path="spending-insights" element={<SpendingInsightsPage />} />
            <Route path="organization" element={<OrganizationPage />} />
            <Route
              path="organization/:orgId"
              element={<OrganizationOverview />}
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
