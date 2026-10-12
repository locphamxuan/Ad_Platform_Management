import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { NAV_ITEMS } from '../lib/navigation';
import type { Permission } from '../lib/types';
import { Loading } from './ui';

/** Sends anonymous visitors to the login page, remembering where they wanted to go. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, restoring } = useAuth();
  const location = useLocation();
  if (restoring) return <Loading label="Đang khôi phục phiên đăng nhập…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

/** Hides a page the role cannot use and redirects to the first page it can. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (can(permission)) return children;
  const fallback = NAV_ITEMS.find((item) => can(item.permission));
  return <Navigate to={fallback?.to ?? '/login'} replace />;
}
