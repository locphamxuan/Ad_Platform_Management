import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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

/** Tabs announce sign-in/out here so the others re-check whose session the shared cookie holds. */
const AUTH_CHANNEL = 'adhub-auth';

function notifyOtherTabs() {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(AUTH_CHANNEL);
  channel.postMessage('changed');
  channel.close();
}

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

  // The session cookie is shared by every tab, but the profile lives in each tab's memory.
  // Signing in or out in another tab silently swaps the account this tab's requests run as,
  // so re-check who the cookie belongs to whenever that may have happened.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const resync = useCallback(() => {
    if (!hasSessionCookie()) {
      if (userRef.current) clearSession();
      return;
    }
    api.auth
      .me()
      .then((current) => {
        const previous = userRef.current;
        if (previous && (previous.id !== current.id || previous.role !== current.role)) queryClient.clear();
        setUser(current);
      })
      .catch(clearSession);
  }, [clearSession, queryClient]);

  useEffect(() => {
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(AUTH_CHANNEL);
    channel?.addEventListener('message', resync);
    const onVisible = () => {
      if (document.visibilityState === 'visible') resync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      channel?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [resync]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      restoring,
      login: async (email, password) => {
        // The server sets the session cookie; only the profile is kept in memory.
        const session = await api.auth.login(email, password);
        // A different account may have been open before; its cached data must not leak in.
        if (userRef.current?.id !== session.user.id) queryClient.clear();
        setUser(session.user);
        notifyOtherTabs();
      },
      logout: async () => {
        await api.auth.logout().catch(() => undefined);
        clearSession();
        notifyOtherTabs();
      },
      updateProfile: async (changes) => {
        setUser(await api.auth.updateProfile(changes));
      },
      can: (permission) => user?.permissions.includes(permission) ?? false,
    }),
    [user, restoring, clearSession, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
