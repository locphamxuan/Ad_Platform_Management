import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequirePermission } from './components/guards';
import { Layout } from './components/Layout';
import { ActivityPage } from './features/activity/ActivityPage';
import { LoginPage } from './features/auth/LoginPage';
import { CampaignsPage } from './features/campaigns/CampaignsPage';
import { CreateCampaignPage } from './features/create-campaign/CreateCampaignPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { IntegrationsPage } from './features/integrations/IntegrationsPage';
import { RulesPage } from './features/rules/RulesPage';
import { UsersPage } from './features/users/UsersPage';
import type { Permission } from './lib/types';

const guard = (permission: Permission, page: ReactNode) => (
  <RequirePermission permission={permission}>{page}</RequirePermission>
);

export function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={guard('report:view', <DashboardPage />)} />
        <Route path="campaigns" element={guard('campaign:view', <CampaignsPage />)} />
        <Route path="campaigns/new" element={guard('campaign:manage', <CreateCampaignPage />)} />
        <Route path="rules" element={guard('rule:view', <RulesPage />)} />
        <Route path="integrations" element={guard('integration:view', <IntegrationsPage />)} />
        <Route path="activity" element={guard('activity:view', <ActivityPage />)} />
        <Route path="users" element={guard('user:manage', <UsersPage />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
