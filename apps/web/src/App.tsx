import { Route, Routes } from 'react-router';
import { RequireAdmin } from './auth/RequireAdmin';
import { RequireAuth } from './auth/RequireAuth';
import { AccessLogPage } from './pages/admin/AccessLogPage';
import { RetentionPage } from './pages/admin/RetentionPage';
import { TemplatesPage } from './pages/admin/TemplatesPage';
import { UsersPage } from './pages/admin/UsersPage';
import { AgreementDetailPage } from './pages/AgreementDetailPage';
import { AgreementsPage } from './pages/AgreementsPage';
import { DashboardLayout } from './pages/DashboardLayout';
import { LoginPage } from './pages/LoginPage';
import { NewAgreementPage } from './pages/NewAgreementPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { SignPage } from './sign/SignPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/sign/:token" element={<SignPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<DashboardLayout />}>
          <Route index element={<AgreementsPage />} />
          <Route path="agreements/new" element={<NewAgreementPage />} />
          <Route path="agreements/:id" element={<AgreementDetailPage />} />
          <Route path="admin" element={<RequireAdmin />}>
            <Route path="users" element={<UsersPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="access-log" element={<AccessLogPage />} />
            <Route path="retention" element={<RetentionPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<p className="p-6">Page not found.</p>} />
    </Routes>
  );
}
