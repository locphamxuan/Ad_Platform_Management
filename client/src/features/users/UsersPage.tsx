import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ErrorMessage, Field, Loading, PageHeader, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ROLE_META, ROLES } from '../../lib/constants';
import { formatDateTime } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';
import type { NewUser, Role, User } from '../../lib/types';

/** Mirrors the server rule for UI hints only; the server still enforces it. */
const manageableRoles = (role: Role, governsWorkspace: boolean): Role[] =>
  governsWorkspace ? ROLES : ROLES.slice(ROLES.indexOf(role) + 1);

export function UsersPage() {
  const queryClient = useQueryClient();
  const { user: me, can } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: queryKeys.users, queryFn: api.users.list });
  const assignable = me ? manageableRoles(me.role, can('workspace:manage')) : [];

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.users }),
      queryClient.invalidateQueries({ queryKey: queryKeys.activity }),
    ]);
  const update = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: { role?: Role; active?: boolean } }) =>
      api.users.update(id, changes),
    onSuccess: refresh,
  });

  const toggleActive = (user: User) => {
    if (user.active && !confirm(`Vô hiệu hoá ${user.name}? Người này sẽ bị đăng xuất ngay lập tức.`)) return;
    update.mutate({ id: user.id, changes: { active: !user.active } });
  };

  return (
    <>
      <PageHeader
        eyebrow="Quản trị"
        title="Người dùng và phân quyền"
        description="Mỗi thành viên có một vai trò quyết định họ được xem và thay đổi những gì."
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <ErrorMessage error={error ?? update.error} />
          {isLoading && <Loading />}
          {data && (
            <div className="card relative overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className="border-b border-line bg-canvas/60">
                  <tr>
                    <th className="table-head">Thành viên</th>
                    <th className="table-head">Vai trò</th>
                    <th className="table-head">Trạng thái</th>
                    <th className="table-head text-right">
                      <span className="sr-only">Thao tác</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.map((user) => {
                    const isMe = user.id === me?.id;
                    const editable = !isMe && assignable.includes(user.role);
                    return (
                      <tr key={user.id} className={user.active ? 'hover:bg-canvas/50' : 'bg-canvas/40 text-muted'}>
                        <td className="table-cell max-w-[240px]">
                          <p className="truncate font-medium text-ink">
                            {user.name}
                            {isMe && <span className="ml-2 text-xs font-normal text-muted">(bạn)</span>}
                          </p>
                          <p className="truncate text-xs text-muted">{user.email}</p>
                        </td>
                        <td className="table-cell">
                          {editable ? (
                            <select
                              aria-label={`Vai trò của ${user.name}`}
                              className="input h-8 w-36 text-[0.8125rem]"
                              value={user.role}
                              disabled={update.isPending}
                              onChange={(e) => update.mutate({ id: user.id, changes: { role: e.target.value as Role } })}
                            >
                              {assignable.map((role) => (
                                <option key={role} value={role}>
                                  {ROLE_META[role].label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-sm">{ROLE_META[user.role].label}</span>
                          )}
                        </td>
                        <td className="table-cell">
                          {user.active ? <Tag tone="positive">Hoạt động</Tag> : <Tag>Vô hiệu</Tag>}
                          <p className="mt-1 whitespace-nowrap text-xs tabular-nums text-muted">
                            {user.lastLoginAt ? `Đăng nhập ${formatDateTime(user.lastLoginAt)}` : 'Chưa đăng nhập'}
                          </p>
                        </td>
                        <td className="table-cell text-right">
                          {editable && (
                            <button
                              type="button"
                              className={`${user.active ? 'btn-danger' : 'btn-secondary'} btn-sm`}
                              disabled={update.isPending}
                              onClick={() => toggleActive(user)}
                            >
                              {user.active ? 'Vô hiệu hoá' : 'Kích hoạt'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <RoleGuide />
        </div>
        <CreateUserForm roles={assignable} onCreated={refresh} />
      </div>
    </>
  );
}

function RoleGuide() {
  return (
    <section className="card-pad">
      <h2 className="section-title">Vai trò trong AdHub</h2>
      <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {ROLES.map((role) => (
          <div key={role}>
            <dt className="text-sm font-medium">{ROLE_META[role].label}</dt>
            <dd className="mt-0.5 text-xs text-muted">{ROLE_META[role].description}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CreateUserForm({ roles, onCreated }: { roles: Role[]; onCreated: () => void }) {
  const initial: NewUser = { email: '', name: '', role: roles.includes('media_buyer') ? 'media_buyer' : roles[0], password: '' };
  const [form, setForm] = useState<NewUser>(initial);
  const create = useMutation({
    mutationFn: api.users.create,
    onSuccess: () => {
      setForm(initial);
      onCreated();
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(form);
  };

  return (
    <form onSubmit={onSubmit} className="card-pad space-y-4 xl:sticky xl:top-10">
      <div>
        <p className="eyebrow">Thành viên mới</p>
        <h2 className="mt-1 section-title">Thêm người dùng</h2>
      </div>
      <Field label="Họ tên">
        <input
          className="input"
          required
          minLength={2}
          maxLength={80}
          autoComplete="off"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Field>
      <Field label="Email">
        <input
          className="input"
          type="email"
          required
          spellCheck={false}
          autoComplete="off"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </Field>
      <Field label="Vai trò" hint={ROLE_META[form.role].description}>
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          {roles.map((role) => (
            <option key={role} value={role}>
              {ROLE_META[role].label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Mật khẩu tạm" hint="Tối thiểu 8 ký tự; gửi riêng cho thành viên">
        <input
          className="input"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
      </Field>
      <button type="submit" className="btn-primary h-10 w-full" disabled={create.isPending}>
        {create.isPending ? 'Đang thêm…' : 'Thêm người dùng'}
      </button>
      <ErrorMessage error={create.error} />
    </form>
  );
}
