import type { CampaignSchedule } from './types';

export function formatDateTime(isoString?: string): string {
  if (!isoString) return 'Ngay khi được duyệt';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d) + ' (UTC+7)';
  } catch {
    return isoString;
  }
}

export function describeSchedule(schedule?: CampaignSchedule): string {
  if (!schedule?.startTime && !schedule?.endTime) {
    return 'Chạy liên tục không thời hạn (từ khi tạo)';
  }

  const startDesc = schedule.startTime ? `Từ ${formatDateTime(schedule.startTime)}` : 'Bắt đầu ngay';
  const endDesc = schedule.endTime ? `đến ${formatDateTime(schedule.endTime)}` : 'liên tục';
  return `${startDesc} ${endDesc}`;
}

export function estimateCampaignDurationDays(schedule?: CampaignSchedule): number | null {
  if (!schedule?.endTime) return null;
  const start = schedule.startTime ? new Date(schedule.startTime).getTime() : Date.now();
  const end = new Date(schedule.endTime).getTime();
  if (end <= start) return null;
  return Math.ceil((end - start) / (24 * 60 * 60 * 1000));
}

export function estimateCostVnd(dailyBudget: number, schedule?: CampaignSchedule): {
  days: number;
  totalVnd: number;
  isUnlimited: boolean;
} {
  const days = estimateCampaignDurationDays(schedule);
  if (days === null) {
    // Default 30-day estimation
    return {
      days: 30,
      totalVnd: dailyBudget * 30,
      isUnlimited: true,
    };
  }
  return {
    days,
    totalVnd: dailyBudget * days,
    isUnlimited: false,
  };
}

