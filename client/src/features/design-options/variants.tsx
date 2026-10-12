import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { ROLE_META } from '../../lib/constants';
import { formatDecimal, formatNumber, formatPercent, formatVnd } from '../../lib/format';
import type { DashboardSummary } from '../../lib/types';
import { kpiList, platformColor, platformLabel, SpendBars, useNavItems } from './shared';

type OptionProps = { data: DashboardSummary };

const shareOf = (data: DashboardSummary, spend: number) =>
  data.totals.spend > 0 ? Math.round((spend / data.totals.spend) * 100) : 0;

/* ------------------------------------------------------------------ A: Sảnh tối */
export function OptionA({ data }: OptionProps) {
  const nav = useNavItems();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[#0E0F12] text-[#EDE6D6] lining-nums lg:flex">
      <div className="flex items-center justify-between border-b border-[#C9A96E]/20 px-4 py-3 lg:hidden">
        <p className="font-serif text-xl">AdHub</p>
        <button type="button" className="text-sm text-[#C9A96E]" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Đóng' : 'Menu'}
        </button>
      </div>
      <aside
        className={`${open ? 'block' : 'hidden'} border-r border-[#C9A96E]/15 bg-[#14161B] lg:sticky lg:top-0 lg:block lg:h-screen lg:w-64 lg:shrink-0`}
      >
        <div className="hidden px-7 pb-10 pt-9 lg:block">
          <p className="font-serif text-2xl tracking-wide">AdHub</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-[#C9A96E]">Quảng cáo đa kênh</p>
        </div>
        <ul className="space-y-1 px-4 py-3">
          {nav.map((item, index) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className={`block rounded-md px-3 py-2.5 text-sm ${index === 0 ? 'bg-[#C9A96E] text-[#0E0F12]' : 'text-[#EDE6D6]/70 hover:text-[#EDE6D6]'}`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        {user && <p className="px-7 py-6 text-xs text-[#EDE6D6]/45">{user.name} · {ROLE_META[user.role].label}</p>}
      </aside>
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-10 lg:py-12">
        <p className="text-[11px] uppercase tracking-[0.3em] text-[#C9A96E]">14 ngày gần nhất</p>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl">Tổng quan hiệu quả</h1>
        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {kpiList(data.totals).map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-[#C9A96E]/20 bg-[#16181D] p-4 last:col-span-2 lg:last:col-span-1"
            >
              <p className="text-[11px] uppercase tracking-widest text-[#EDE6D6]/50">{kpi.label}</p>
              <p className="mt-2 truncate font-serif text-xl sm:text-2xl">{kpi.value}</p>
              <p className="mt-1 truncate text-[11px] text-[#C9A96E]/80">{kpi.hint}</p>
            </div>
          ))}
        </div>
        <section className="mt-6 rounded-xl border border-[#C9A96E]/20 bg-[#16181D] p-5">
          <h2 className="font-serif text-lg">Chi tiêu theo ngày</h2>
          <div className="mt-5">
            <SpendBars data={data} track="#1E2026" labelClass="text-[#EDE6D6]/50" />
          </div>
        </section>
        <section className="mt-6 grid gap-3 md:grid-cols-3">
          {data.byPlatform.map((p) => (
            <div key={p.platform} className="rounded-xl border border-[#C9A96E]/20 bg-[#16181D] p-5">
              <p className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full" style={{ background: platformColor(p.platform) }} />
                {platformLabel(p.platform)}
              </p>
              <p className="mt-3 font-serif text-2xl">{formatVnd(p.kpis.spend)}</p>
              <p className="mt-1 text-xs text-[#EDE6D6]/55">
                ROAS {formatDecimal(p.kpis.roas)}x · {p.activeCampaigns}/{p.totalCampaigns} đang chạy
              </p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ B: Tạp chí */
export function OptionB({ data }: OptionProps) {
  const nav = useNavItems();
  const t = data.totals;
  return (
    <div className="min-h-screen bg-[#FBF8F2] text-[#1B1A17] lining-nums">
      <h1 className="sr-only">Tổng quan hiệu quả</h1>
      <header className="border-b border-[#1B1A17]/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-8">
          <p className="font-serif text-2xl italic">AdHub</p>
          <nav className="-mx-1 flex max-w-full gap-1 overflow-x-auto text-sm">
            {nav.map((item, index) => (
              <Link
                key={item.to}
                to={item.to}
                className={`whitespace-nowrap px-2 py-1 ${index === 0 ? 'border-b-2 border-[#8C6A2F] font-semibold' : 'text-[#1B1A17]/60 hover:text-[#1B1A17]'}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8 lg:py-16">
        <p className="text-xs uppercase tracking-[0.3em] text-[#8C6A2F]">Báo cáo 14 ngày</p>
        <div className="mt-4 grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div>
            <p className="font-serif text-7xl leading-none sm:text-8xl">{formatDecimal(t.roas)}x</p>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-[#1B1A17]/70">
              Mỗi đồng chi cho quảng cáo mang về {formatDecimal(t.roas)} đồng doanh thu, trên tổng chi{' '}
              <strong className="text-[#1B1A17]">{formatVnd(t.spend)}</strong>.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[#1B1A17]/15 pt-6">
            {kpiList(t)
              .filter((k) => k.label !== 'ROAS')
              .map((kpi) => (
                <div key={kpi.label}>
                  <dt className="text-xs uppercase tracking-widest text-[#1B1A17]/50">{kpi.label}</dt>
                  <dd className="mt-1 font-serif text-2xl">{kpi.value}</dd>
                </div>
              ))}
          </dl>
        </div>
        <div className="mt-14 grid gap-10 border-t border-[#1B1A17]/15 pt-10 lg:grid-cols-2">
          <section>
            <h2 className="font-serif text-2xl">Nhịp chi tiêu</h2>
            <div className="mt-6">
              <SpendBars data={data} monochrome="#8C6A2F" labelClass="text-[#1B1A17]/50" />
            </div>
          </section>
          <section>
            <h2 className="font-serif text-2xl">Theo nền tảng</h2>
            <ol className="mt-6 divide-y divide-[#1B1A17]/10">
              {data.byPlatform.map((p, index) => (
                <li key={p.platform} className="flex items-baseline gap-4 py-4">
                  <span className="font-serif text-3xl text-[#8C6A2F]">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{platformLabel(p.platform)}</p>
                    <p className="text-sm text-[#1B1A17]/60">
                      {shareOf(data, p.kpis.spend)}% ngân sách · ROAS {formatDecimal(p.kpis.roas)}x
                    </p>
                  </div>
                  <p className="font-serif text-lg">{formatVnd(p.kpis.spend)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ C: Buồng lái */
export function OptionC({ data }: OptionProps) {
  const nav = useNavItems();
  const best = [...data.byPlatform].sort((a, b) => b.kpis.roas - a.kpis.roas)[0];
  return (
    <div className="min-h-screen bg-[#0B1622] text-[#E7ECF2] md:flex">
      <nav className="flex gap-1 overflow-x-auto border-b border-white/10 bg-[#07101A] p-2 md:sticky md:top-0 md:h-screen md:w-20 md:flex-col md:items-center md:border-b-0 md:border-r md:py-6">
        <p className="hidden pb-6 font-serif text-xl text-[#B08D57] md:block">AH</p>
        {nav.map((item, index) => (
          <Link
            key={item.to}
            to={item.to}
            title={item.label}
            className={`flex h-12 min-w-12 shrink-0 items-center justify-center rounded-xl px-2 text-[11px] font-semibold md:w-14 ${index === 0 ? 'bg-[#B08D57] text-[#0B1622]' : 'text-white/60 hover:bg-white/5'}`}
          >
            {item.label
              .split(' ')
              .map((w) => w[0])
              .join('')
              .slice(0, 3)
              .toUpperCase()}
          </Link>
        ))}
      </nav>
      <main className="min-w-0 flex-1 p-4 sm:p-8">
        <h1 className="text-2xl font-semibold">Tổng quan · 14 ngày</h1>
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 md:grid-cols-5">
          {kpiList(data.totals).map((kpi) => (
            <div key={kpi.label} className="bg-[#0F1D2C] p-4 last:col-span-2 md:last:col-span-1">
              <p className="text-xs text-white/50">{kpi.label}</p>
              <p className="mt-1 truncate text-xl font-semibold tabular-nums">{kpi.value}</p>
            </div>
          ))}
        </div>
        <section className="mt-6 rounded-2xl bg-[#0F1D2C] p-5">
          <h2 className="text-sm font-semibold text-white/80">Chi tiêu theo ngày</h2>
          <div className="mt-4">
            <SpendBars data={data} height={200} track="#142638" labelClass="text-white/40" />
          </div>
        </section>
      </main>
      <aside className="border-t border-white/10 bg-[#07101A] p-5 sm:p-8 xl:w-80 xl:shrink-0 xl:border-l xl:border-t-0">
        <h2 className="text-xs uppercase tracking-[0.25em] text-[#B08D57]">Phân tích nhanh</h2>
        {best && (
          <p className="mt-4 text-sm leading-relaxed text-white/75">
            <strong className="text-white">{platformLabel(best.platform)}</strong> đang hiệu quả nhất với ROAS{' '}
            {formatDecimal(best.kpis.roas)}x. Cân nhắc dồn thêm ngân sách cho kênh này.
          </p>
        )}
        <ul className="mt-6 space-y-4">
          {data.byPlatform.map((p) => (
            <li key={p.platform}>
              <div className="flex justify-between text-sm">
                <span>{platformLabel(p.platform)}</span>
                <span className="tabular-nums text-white/60">{shareOf(data, p.kpis.spend)}%</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${shareOf(data, p.kpis.spend)}%`, background: platformColor(p.platform) }}
                />
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ D: Bento */
export function OptionD({ data }: OptionProps) {
  const nav = useNavItems();
  const [spend, clicks, conversions, cpa, roas] = kpiList(data.totals);
  return (
    <div className="min-h-screen bg-[#EFEBE3] pb-28 text-[#121212] lining-nums">
      <h1 className="sr-only">Tổng quan hiệu quả</h1>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 pt-6 sm:px-8">
        <p className="font-serif text-2xl">AdHub</p>
        <p className="text-xs text-black/50">14 ngày gần nhất</p>
      </header>
      <main className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-4 pt-6 sm:px-8 md:grid-cols-4 md:auto-rows-[150px]">
        <div className="col-span-2 row-span-2 flex flex-col justify-between rounded-3xl bg-[#121212] p-6 text-white">
          <p className="text-xs uppercase tracking-[0.25em] text-[#D4B483]">{roas.label}</p>
          <div>
            <p className="font-serif text-6xl sm:text-7xl">{roas.value}</p>
            <p className="mt-2 text-sm text-white/60">{roas.hint}</p>
          </div>
        </div>
        {[spend, clicks, conversions, cpa].map((kpi) => (
          <div key={kpi.label} className="flex flex-col justify-between rounded-3xl bg-white p-5">
            <p className="text-xs text-black/50">{kpi.label}</p>
            <p className="truncate text-base font-semibold sm:text-xl">{kpi.value}</p>
          </div>
        ))}
        <div className="col-span-2 rounded-3xl bg-[#D4B483] p-5 md:row-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest">Chi tiêu theo ngày</p>
          <div className="mt-4">
            <SpendBars data={data} height={190} monochrome="#121212" labelClass="text-black/60" />
          </div>
        </div>
        {data.byPlatform.map((p) => (
          <div key={p.platform} className="col-span-2 flex items-center justify-between rounded-3xl bg-white p-5 md:col-span-1">
            <div>
              <p className="text-xs text-black/50">{platformLabel(p.platform)}</p>
              <p className="mt-1 text-lg font-semibold">{formatVnd(p.kpis.spend)}</p>
            </div>
            <span className="rounded-full px-3 py-1 text-xs text-white" style={{ background: platformColor(p.platform) }}>
              {formatDecimal(p.kpis.roas)}x
            </span>
          </div>
        ))}
      </main>
      <nav className="fixed inset-x-0 bottom-4 z-10 mx-auto flex w-max max-w-[calc(100%-2rem)] gap-1 overflow-x-auto rounded-full bg-[#121212] p-1.5 shadow-xl">
        {nav.map((item, index) => (
          <Link
            key={item.to}
            to={item.to}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs ${index === 0 ? 'bg-[#D4B483] font-semibold text-black' : 'text-white/70 hover:text-white'}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------ E: Sổ cái */
export function OptionE({ data }: OptionProps) {
  const nav = useNavItems();
  return (
    <div className="min-h-screen bg-[#0F1F1A] text-[#E9E4D4] lining-nums">
      <header className="border-b border-[#BFA05A]/30 px-4 pt-5 sm:px-8">
        <div className="flex items-baseline justify-between">
          <p className="font-serif text-2xl">AdHub <span className="text-sm text-[#BFA05A]">sổ cái quảng cáo</span></p>
        </div>
        <nav className="-mb-px mt-4 flex gap-6 overflow-x-auto text-sm">
          {nav.map((item, index) => (
            <Link
              key={item.to}
              to={item.to}
              className={`whitespace-nowrap border-b-2 pb-3 ${index === 0 ? 'border-[#BFA05A] text-[#E9E4D4]' : 'border-transparent text-[#E9E4D4]/55 hover:text-[#E9E4D4]'}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="overflow-x-auto border-b border-[#BFA05A]/20 bg-[#0B1713]">
        <dl className="flex min-w-max divide-x divide-[#BFA05A]/20 font-mono text-sm">
          {kpiList(data.totals).map((kpi) => (
            <div key={kpi.label} className="flex items-baseline gap-2 px-4 py-3 sm:px-8">
              <dt className="text-[11px] uppercase tracking-widest text-[#BFA05A]">{kpi.label}</dt>
              <dd className="tabular-nums">{kpi.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <main className="px-4 py-8 sm:px-8">
        <h1 className="font-serif text-3xl">Sổ cái 14 ngày</h1>
        <div className="mt-6 overflow-x-auto rounded-lg border border-[#BFA05A]/25">
          <table className="w-full min-w-[720px] font-mono text-sm">
            <thead className="bg-[#0B1713] text-left text-[11px] uppercase tracking-widest text-[#BFA05A]">
              <tr>
                {['Nền tảng', 'Chiến dịch', 'Chi tiêu', 'Tỷ trọng', 'Click', 'CTR', 'Chuyển đổi', 'CPA', 'ROAS'].map((h) => (
                  <th key={h} className={`px-4 py-3 font-medium ${h === 'Nền tảng' ? '' : 'text-right'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#BFA05A]/15">
              {data.byPlatform.map((p) => (
                <tr key={p.platform} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-sans">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: platformColor(p.platform) }} />
                    {platformLabel(p.platform)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.activeCampaigns}/{p.totalCampaigns}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatVnd(p.kpis.spend)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{shareOf(data, p.kpis.spend)}%</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(p.kpis.clicks)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPercent(p.kpis.ctr)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(p.kpis.conversions)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatVnd(p.kpis.cpa)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#BFA05A]">{formatDecimal(p.kpis.roas)}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="mt-8 max-w-3xl">
          <h2 className="text-[11px] uppercase tracking-widest text-[#BFA05A]">Chi tiêu theo ngày</h2>
          <div className="mt-4">
            <SpendBars data={data} height={120} monochrome="#BFA05A" track="#13281F" labelClass="text-[#E9E4D4]/45" />
          </div>
        </section>
      </main>
    </div>
  );
}
