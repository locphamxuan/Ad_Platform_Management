import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ROLE_META } from '../lib/constants';
import { NAV_ITEMS } from '../lib/navigation';

export function Layout() {
  const { user, can, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const items = NAV_ITEMS.filter((item) => can(item.permission));
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    // Close the mobile menu after navigating.
    setPrevPath(pathname);
    setMenuOpen(false);
  }

  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-3 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Bỏ qua điều hướng
      </a>

      <div className="flex items-center justify-between bg-ink px-4 py-3 lg:hidden">
        <Wordmark />
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? 'Đóng' : 'Menu'}
        </button>
      </div>

      <aside
        id="sidebar"
        className={`${menuOpen ? 'flex' : 'hidden'} flex-col bg-ink text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0`}
      >
        <div className="hidden px-6 pb-8 pt-7 lg:block">
          <Wordmark />
          <p className="mt-1.5 text-xs text-white/45">Facebook · TikTok · Google Ads</p>
        </div>

        <nav aria-label="Điều hướng chính" className="flex-1 overflow-y-auto px-3 py-3 lg:py-0">
          <ul className="space-y-0.5">
            {items.map((item, index) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    `group flex items-baseline gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                      isActive ? 'bg-white text-ink' : 'text-white/70 hover:bg-white/[0.07] hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        aria-hidden
                        className={`w-5 text-2xs tabular-nums ${isActive ? 'text-accent' : 'text-white/35 group-hover:text-white/60'}`}
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      {item.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {user && (
          <div className="border-t border-white/10 px-6 py-5">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="mt-0.5 truncate text-xs text-white/50">
              {ROLE_META[user.role].label} · {user.email}
            </p>
            <div className="mt-3 flex gap-4">
              <NavLink
                to="/account"
                className={({ isActive }) =>
                  `text-xs font-medium underline-offset-4 hover:text-white hover:underline ${isActive ? 'text-white' : 'text-white/60'}`
                }
              >
                Thông tin cá nhân
              </NavLink>
              <button
                type="button"
                onClick={() => void logout()}
                className="text-xs font-medium text-white/60 underline-offset-4 hover:text-white hover:underline"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        )}
      </aside>

      <main id="main" className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Wordmark() {
  return (
    <p className="text-lg font-bold tracking-tight text-white" translate="no">
      AdHub<span className="text-accent">.</span>
    </p>
  );
}
