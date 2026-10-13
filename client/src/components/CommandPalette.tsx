import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseRule } from '../features/rules/parse-rule';
import { describeRule } from '../features/rules/describe-rule';
import { useAuth } from '../lib/auth';
import { NAV_ITEMS } from '../lib/navigation';
import { fold } from '../lib/text';
import { Icon, type IconName } from './icons';

interface Command {
  id: string;
  group: 'AI' | 'Đi tới' | 'Thao tác';
  label: string;
  detail?: string;
  icon: IconName;
  run: () => void;
}

/**
 * One box for everything: type a page name to jump there, a sentence to have the assistant draft a
 * rule or a campaign from it, or a campaign name to search. Opens with Ctrl/⌘+K.
 */
export function CommandPalette({ open, onClose, onToggleTheme }: { open: boolean; onClose: () => void; onToggleTheme: () => void }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // After the dialog is painted.
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  const commands = useMemo(() => {
    const go = (to: string) => () => {
      navigate(to);
      onClose();
    };
    const text = query.trim();
    const folded = fold(text);
    const list: Command[] = [];

    if (text.length >= 6) {
      const parsed = parseRule(text);
      const understood = !parsed.missing.includes('chỉ số') && !parsed.missing.includes('hành động');
      if (understood && can('rule:manage')) {
        const { condition, action } = describeRule(parsed.rule);
        list.push({
          id: 'ai-rule',
          group: 'AI',
          label: 'Tạo quy tắc tự động từ câu này',
          detail: `Nếu ${condition} → ${action}`,
          icon: 'zap',
          run: go(`/rules?draft=${encodeURIComponent(text)}`),
        });
      }
      if (can('campaign:manage')) {
        list.push({
          id: 'ai-campaign',
          group: 'AI',
          label: 'Soạn chiến dịch đa kênh từ mô tả',
          detail: `“${text.slice(0, 70)}”`,
          icon: 'wand',
          run: go(`/campaigns/new?brief=${encodeURIComponent(text)}`),
        });
      }
    }

    for (const item of NAV_ITEMS) {
      if (!can(item.permission)) continue;
      if (folded && !fold(item.label).includes(folded)) continue;
      list.push({ id: item.to, group: 'Đi tới', label: item.label, icon: item.icon, run: go(item.to) });
    }

    if (text && can('campaign:view')) {
      list.push({
        id: 'search',
        group: 'Thao tác',
        label: `Tìm chiến dịch “${text.slice(0, 40)}”`,
        icon: 'search',
        run: go(`/campaigns?q=${encodeURIComponent(text)}`),
      });
    }
    const themeLabel = 'Đổi giao diện sáng / tối';
    if (!folded || fold(themeLabel).includes(folded) || /theme|dark|toi|sang/.test(folded)) {
      list.push({
        id: 'theme',
        group: 'Thao tác',
        label: themeLabel,
        icon: 'moon',
        run: () => {
          onToggleTheme();
          onClose();
        },
      });
    }
    return list;
  }, [query, can, navigate, onClose, onToggleTheme]);

  if (!open) return null;
  const current = Math.min(active, commands.length - 1);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hỏi AdHub"
        className="w-full max-w-xl animate-fade-up overflow-hidden rounded-2xl border border-line bg-surface shadow-lift"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icon name="sparkles" className="shrink-0 text-spark" />
          <input
            ref={input}
            role="combobox"
            aria-expanded
            aria-controls="command-list"
            aria-activedescendant={commands[current] ? `cmd-${commands[current].id}` : undefined}
            className="h-14 w-full bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-subtle focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="VD: tạm dừng khi CPA > 150k trong 3 ngày · giảm 30% giày nữ, 3 triệu/ngày"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, commands.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                commands[current]?.run();
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
          />
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-2xs text-muted sm:block">Esc</kbd>
        </div>
        <ul id="command-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {commands.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Không có kết quả.</li>}
          {commands.map((command, index) => (
            <li key={command.id}>
              {(index === 0 || commands[index - 1].group !== command.group) && (
                <p className="eyebrow px-3 pb-1 pt-2">{command.group}</p>
              )}
              <div
                id={`cmd-${command.id}`}
                role="option"
                aria-selected={index === current}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${
                  index === current ? 'bg-accent-soft text-ink' : 'text-ink-soft'
                }`}
                onMouseEnter={() => setActive(index)}
                onClick={command.run}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    command.group === 'AI' ? 'bg-ai-gradient text-white' : 'bg-ink/5 text-muted'
                  }`}
                >
                  <Icon name={command.icon} size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{command.label}</span>
                  {command.detail && <span className="block truncate text-xs text-muted">{command.detail}</span>}
                </span>
                {index === current && <Icon name="arrowRight" size={16} className="ml-auto shrink-0 text-muted" />}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
