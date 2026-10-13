import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../../components/icons';
import { ErrorMessage, Field } from '../../components/ui';
import { useAuth } from '../../lib/auth';

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'sparkles', title: 'Bản tin & đề xuất tự động', text: 'Trợ lý đọc số liệu, chỉ ra chiến dịch lỗ và việc nên làm — áp dụng một chạm.' },
  { icon: 'wand', title: 'Soạn chiến dịch từ một câu', text: 'Mô tả ưu đãi, trợ lý viết nội dung và chia ngân sách theo ROAS từng kênh.' },
  { icon: 'zap', title: 'Rule bằng tiếng Việt', text: '“Tạm dừng khi CPA > 150k trong 3 ngày” — xem trước tác động rồi mới bật.' },
];

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
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.1fr_1fr]">
      {/* Always dark: the brand panel reads the same in both themes. */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#0B0C1A] px-14 py-12 text-white lg:flex">
        <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-[#4F46E5]/40 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-48 right-0 h-[30rem] w-[30rem] rounded-full bg-[#C026D3]/30 blur-3xl" />
        <p className="relative flex items-center gap-2 text-lg font-bold tracking-tight" translate="no">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#6366F1] to-[#D946EF]">
            <Icon name="sparkles" size={16} />
          </span>
          AdHub
        </p>
        <div className="relative max-w-lg">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-[#D946EF]" />
            Quảng cáo đa kênh, vận hành bởi trợ lý thông minh
          </p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight">
            Facebook, TikTok và Google Ads —{' '}
            <span className="bg-gradient-to-r from-[#A5B4FC] to-[#F0ABFC] bg-clip-text text-transparent">tự tối ưu mỗi phút.</span>
          </h1>
          <ul className="mt-8 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
                  <Icon name={f.icon} size={17} />
                </span>
                <div>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="mt-0.5 text-sm text-white/60">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/40">Phân quyền 3 cấp: Chủ sở hữu · Media Buyer · Khách hàng</p>
      </section>

      <section className="flex items-center justify-center bg-ai-wash px-4 py-12 sm:px-8">
        <div className="card w-full max-w-sm p-7 shadow-lift">
          <p className="flex items-center gap-2 text-lg font-bold tracking-tight lg:hidden" translate="no">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-ai-gradient text-white">
              <Icon name="sparkles" size={16} />
            </span>
            AdHub
          </p>
          <h2 className="mt-6 text-2xl font-semibold tracking-tight lg:mt-0">Đăng nhập</h2>
          <p className="mt-2 text-sm text-muted">Dùng tài khoản được Chủ sở hữu cấp cho bạn.</p>

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
            <button type="submit" className="btn-ai h-11 w-full" disabled={submitting}>
              {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
              {!submitting && <Icon name="arrowRight" size={16} />}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
