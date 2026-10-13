import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ROLE_META } from '../lib/constants';
import { NAV_ITEMS } from '../lib/navigation';
import { useTheme } from '../lib/theme';
import { CommandPalette } from './CommandPalette';
import { Icon } from './icons';
import { NotificationPanel } from './NotificationPanel';
import { Avatar } from './ui';

export function Layout() {
  const { user, can, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { pathname } = useLocation();
  const items = NAV_ITEMS.filter((item) => can(item.permission));
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    // Close the mobile menu after navigating.
    setPrevPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  return (
    <div className="min-h-screen bg-canvas bg-ai-wash bg-fixed lg:flex">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-3 py-2 text-sm text-canvas focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Bỏ qua điều hướng
      </a>

      <aside
        id="sidebar"
        className={`${menuOpen ? 'fixed inset-0 z-40 flex' : 'hidden'} flex-col border-r border-line bg-surface/95 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0`}
      >
        <div className="flex items-center justify-between px-5 pb-6 pt-6">
          <Wordmark />
          <button type="button" className="btn-icon lg:hidden" aria-label="Đóng menu" onClick={() => setMenuOpen(false)}>
            <Icon name="x" />
          </button>
        </div>

        <nav aria-label="Điều hướng chính" className="flex-1 overflow-y-auto px-3">
          <ul className="space-y-0.5">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                      isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-ink/5 hover:text-ink'
                    }`
                  }
                >
                  <Icon name={item.icon} size={18} />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="card-ai mt-6 block w-full p-4 text-left transition-shadow hover:shadow-glow"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Icon name="sparkles" size={16} className="text-spark" />
              <span className="text-ai">Trợ lý AdHub</span>
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted">
              Gõ một câu — trợ lý soạn chiến dịch, tạo rule hoặc tìm nhanh cho bạn.
            </span>
          </button>
        </nav>

        {user && (
          <div className="m-3 flex items-center gap-3 rounded-2xl border border-line bg-surface-raised p-3">
            <Avatar name={user.name} />
            <div className="min-w-0 flex-1">
              <NavLink to="/account" className="block truncate text-sm font-medium hover:text-accent">
                {user.name}
              </NavLink>
              <p className="truncate text-xs text-muted">{ROLE_META[user.role].label}</p>
            </div>
            <button type="button" className="btn-icon h-8 w-8" aria-label="Đăng xuất" title="Đăng xuất" onClick={() => void logout()}>
              <Icon name="logout" size={16} />
            </button>
          </div>
        )}
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line/70 bg-canvas/75 px-4 py-3 backdrop-blur sm:px-8 lg:px-12">
          <button
            type="button"
            className="btn-icon lg:hidden"
            aria-label="Mở menu"
            aria-expanded={menuOpen}
            aria-controls="sidebar"
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <div className="lg:hidden">
            <Wordmark />
          </div>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto flex h-10 min-w-0 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm text-subtle shadow-soft transition-colors hover:border-accent/40 hover:text-muted lg:ml-0 lg:w-full lg:max-w-md"
          >
            <Icon name="sparkles" size={16} className="shrink-0 text-spark" />
            <span className="hidden truncate sm:inline">Hỏi AdHub hoặc tìm nhanh…</span>
            <kbd className="ml-auto hidden rounded-md border border-line px-1.5 py-0.5 text-2xs text-muted md:block">Ctrl K</kbd>
          </button>
          <div className="flex items-center gap-1 lg:ml-auto">
            {/* Only owners are notified, about media buyers' campaign edits and deletes. */}
            {user?.role === 'owner' && <NotificationPanel />}
            <button
              type="button"
              className="btn-icon"
              aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              onClick={toggleTheme}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
          </div>
        </header>

        <main id="main" className="px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
          <div className="mx-auto max-w-7xl animate-fade-up" key={pathname}>
            <Outlet />
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={closePalette} onToggleTheme={toggleTheme} />
    </div>
  );
}

function Wordmark() {
  return (
    <p className="flex items-center gap-2 text-lg font-bold tracking-tight text-ink" translate="no">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-ai-gradient text-white shadow-glow">
        <Icon name="sparkles" size={16} />
      </span>
      AdHub
    </p>
  );
}
