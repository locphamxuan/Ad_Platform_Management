import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ErrorMessage, Field, PageHeader, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ROLE_META } from '../../lib/constants';
import { formatDateTime, formatVnd } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';
import type { AuthUser } from '../../lib/types';

/** Every role edits its own name, email and password here; role changes stay with the owner. */
export function AccountPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <>
      <PageHeader
        eyebrow="Tài khoản"
        title="Thông tin cá nhân"
        description="Cập nhật tên hiển thị, email đăng nhập và mật khẩu của bạn."
      />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* Keyed by the saved values so the form resets to them after each save. */}
        <ProfileForm key={`${user.name}|${user.email}`} user={user} />
        <div className="space-y-6">
          <PasswordForm />
          <AccountSummary user={user} />
        </div>
      </div>
    </>
  );
}

function ProfileForm({ user }: { user: AuthUser }) {
  const queryClient = useQueryClient();
  const { updateProfile } = useAuth();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [saved, setSaved] = useState(false);

  const emailChanged = email.trim().toLowerCase() !== user.email;
  const dirty = name.trim() !== user.name || emailChanged;

  const save = useMutation({
    mutationFn: () =>
      updateProfile({
        name: name.trim(),
        ...(emailChanged && { email: email.trim(), currentPassword }),
      }),
    onSuccess: () => {
      setSaved(true);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.users }),
        queryClient.invalidateQueries({ queryKey: queryKeys.activity }),
      ]);
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    save.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="card-pad space-y-4">
      <h2 className="section-title">Hồ sơ</h2>
      <Field label="Họ tên">
        <input
          className="input"
          required
          minLength={2}
          maxLength={80}
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Email đăng nhập">
        <input
          className="input"
          type="email"
          required
          spellCheck={false}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      {emailChanged && (
        <Field label="Mật khẩu hiện tại" hint="Cần xác nhận mật khẩu khi đổi email đăng nhập">
          <input
            className="input"
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={!dirty || save.isPending}>
          {save.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
        {saved && !dirty && (
          <span role="status" className="text-sm text-positive">
            Đã lưu
          </span>
        )}
      </div>
      <ErrorMessage error={save.error} />
    </form>
  );
}

const EMPTY_PASSWORDS = { current: '', next: '', confirm: '' };

function PasswordForm() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_PASSWORDS);
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  const mismatch = form.confirm !== '' && form.confirm !== form.next;

  const change = useMutation({
    mutationFn: () => api.auth.changePassword(form.current, form.next),
    onSuccess: () => {
      setForm(EMPTY_PASSWORDS);
      setDone(true);
      return queryClient.invalidateQueries({ queryKey: queryKeys.activity });
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setDone(false);
    if (!mismatch) change.mutate();
  };

  const inputType = visible ? 'text' : 'password';
  return (
    <form onSubmit={onSubmit} className="card-pad space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="section-title">Đổi mật khẩu</h2>
        <button
          type="button"
          className="text-xs font-medium text-accent underline-offset-4 hover:underline"
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        </button>
      </div>
      <Field label="Mật khẩu hiện tại">
        <input
          className="input"
          type={inputType}
          required
          autoComplete="current-password"
          value={form.current}
          onChange={(e) => setForm({ ...form, current: e.target.value })}
        />
      </Field>
      <Field label="Mật khẩu mới" hint="Tối thiểu 8 ký tự">
        <input
          className="input"
          type={inputType}
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          value={form.next}
          onChange={(e) => setForm({ ...form, next: e.target.value })}
        />
      </Field>
      <Field label="Nhập lại mật khẩu mới">
        <input
          className="input"
          type={inputType}
          required
          autoComplete="new-password"
          aria-invalid={mismatch}
          value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
        />
      </Field>
      {mismatch && <p className="text-sm text-negative">Hai mật khẩu mới chưa khớp.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={mismatch || change.isPending}>
          {change.isPending ? 'Đang đổi…' : 'Đổi mật khẩu'}
        </button>
        {done && (
          <span role="status" className="text-sm text-positive">
            Đã đổi mật khẩu; các thiết bị khác đã được đăng xuất
          </span>
        )}
      </div>
      <ErrorMessage error={change.error} />
    </form>
  );
}

function AccountSummary({ user }: { user: AuthUser }) {
  return (
    <section className="card-pad">
      <h2 className="section-title">Quyền của bạn</h2>
      <dl className="mt-4 space-y-2.5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Vai trò</dt>
          <dd>
            <Tag tone="accent">{ROLE_META[user.role].label}</Tag>
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Hạn mức ngân sách</dt>
          <dd className="font-medium tabular-nums">
            {user.dailyBudgetLimit === null ? 'Không giới hạn' : `${formatVnd(user.dailyBudgetLimit)}/ngày`}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Tham gia</dt>
          <dd className="tabular-nums">{formatDateTime(user.createdAt)}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs text-muted">{ROLE_META[user.role].description}</p>
    </section>
  );
}
