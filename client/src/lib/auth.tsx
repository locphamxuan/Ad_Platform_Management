import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, hasSessionCookie, setUnauthorizedHandler } from './api';
import type { AuthUser, Permission, ProfileChanges } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  /** True until the stored session has been checked against the server */
  restoring: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Saves the signed-in user's own name/email and refreshes the profile shown everywhere */
  updateProfile: (changes: ProfileChanges) => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [restoring, setRestoring] = useState(hasSessionCookie);

  const clearSession = useCallback(() => {
    setUser(null);
    // Cached data belongs to the previous user's role; never show it to the next one.
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    if (!hasSessionCookie()) return;
    api.auth
      .me()
      .then(setUser)
      .catch(clearSession)
      .finally(() => setRestoring(false));
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      restoring,
      login: async (email, password) => {
        // The server sets the session cookie; only the profile is kept in memory.
        const session = await api.auth.login(email, password);
        setUser(session.user);
      },
      logout: async () => {
        await api.auth.logout().catch(() => undefined);
        clearSession();
      },
      updateProfile: async (changes) => {
        setUser(await api.auth.updateProfile(changes));
      },
      can: (permission) => user?.permissions.includes(permission) ?? false,
    }),
    [user, restoring, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
