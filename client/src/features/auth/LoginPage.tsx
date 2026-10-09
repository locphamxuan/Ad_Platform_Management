import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ErrorMessage, Field } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { ROLE_META, ROLES } from '../../lib/constants';
import type { Role } from '../../lib/types';

/** Seeded by the server (see server/src/seed.ts); offered only in development builds. */
const DEMO_PASSWORD = 'adhub@123';
const DEMO_EMAIL: Record<Role, string> = {
  owner: 'owner@adhub.vn',
  admin: 'admin@adhub.vn',
  media_buyer: 'buyer@adhub.vn',
  client: 'client@adhub.vn',
};

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';
  if (user) return <Navigate to={redirectTo} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between bg-ink px-14 py-12 text-white lg:flex">
        <p className="text-lg font-bold tracking-tight" translate="no">
          AdHub<span className="text-accent">.</span>
        </p>
        <div className="max-w-md">
          <p className="eyebrow text-white/45">Một trạm điều khiển cho mọi kênh</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">
            Quản lý Facebook, TikTok và Google Ads ở cùng một nơi.
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-white/60">
            Báo cáo hợp nhất, tạo chiến dịch một lần cho nhiều kênh và để rule tự động tối ưu ngân sách — với
            phân quyền rõ ràng cho từng thành viên.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-t border-white/10 pt-8 text-sm">
          {ROLES.map((role) => (
            <div key={role}>
              <dt className="font-medium">{ROLE_META[role].label}</dt>
              <dd className="mt-0.5 text-xs text-white/50">{ROLE_META[role].description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <p className="text-lg font-bold tracking-tight lg:hidden" translate="no">
            AdHub<span className="text-accent">.</span>
          </p>
          <h2 className="mt-6 text-2xl font-semibold tracking-tight lg:mt-0">Đăng nhập</h2>
          <p className="mt-2 text-sm text-muted">Dùng tài khoản được quản trị viên cấp cho bạn.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <Field label="Email">
              <input
                className="input"
                type="email"
                name="email"
                autoComplete="username"
                spellCheck={false}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ten@congty.vn"
              />
            </Field>
            <Field label="Mật khẩu">
              <input
                className="input"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <ErrorMessage error={error} />
            <button type="submit" className="btn-primary h-10 w-full" disabled={submitting}>
              {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>
          </form>

          {import.meta.env.DEV && (
            <div className="mt-10 border-t border-line pt-6">
              <p className="eyebrow">Tài khoản demo</p>
              <p className="mt-1 text-xs text-muted">Chọn một vai trò để điền sẵn thông tin đăng nhập.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      setEmail(DEMO_EMAIL[role]);
                      setPassword(DEMO_PASSWORD);
                    }}
                  >
                    {ROLE_META[role].label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
