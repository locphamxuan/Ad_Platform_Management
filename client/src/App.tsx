import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequirePermission } from './components/guards';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { ActivityPage } from './features/activity/ActivityPage';
import { LoginPage } from './features/auth/LoginPage';
import { CampaignsPage } from './features/campaigns/CampaignsPage';
import { CreateCampaignPage } from './features/create-campaign/CreateCampaignPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { IntegrationsPage } from './features/integrations/IntegrationsPage';
import { RulesPage } from './features/rules/RulesPage';
import { UsersPage } from './features/users/UsersPage';
import type { Permission } from './lib/types';

// Draft layouts few people open: loaded on demand to keep them out of the main bundle.
const designOptions = () => import('./features/design-options/DesignOptionsPage');
const DesignOptionsIndex = lazy(() => designOptions().then((m) => ({ default: m.DesignOptionsIndex })));
const DesignOptionPage = lazy(() => designOptions().then((m) => ({ default: m.DesignOptionPage })));

const guard = (permission: Permission, page: ReactNode) => (
  <RequirePermission permission={permission}>{page}</RequirePermission>
);

const lazyPage = (page: ReactNode) => <Suspense fallback={<Loading />}>{page}</Suspense>;

export function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      {/* Design options bring their own page shell, so they sit outside <Layout>. */}
      <Route
        path="phuong-an"
        element={<RequireAuth>{guard('report:view', lazyPage(<DesignOptionsIndex />))}</RequireAuth>}
      />
      <Route
        path="phuong-an/:id"
        element={<RequireAuth>{guard('report:view', lazyPage(<DesignOptionPage />))}</RequireAuth>}
      />
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
