import type { CampaignDraftPayload } from './types';

export interface StepValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  warnings?: Record<string, string>;
}

export function validateStep1(payload: Partial<CampaignDraftPayload>): StepValidationResult {
  const errors: Record<string, string> = {};

  if (!payload.name?.trim()) {
    errors.name = 'Vui lòng nhập tên chiến dịch';
  } else if (payload.name.trim().length > 120) {
    errors.name = 'Tên chiến dịch tối đa 120 ký tự';
  }

  if (!payload.objective) {
    errors.objective = 'Vui lòng chọn mục tiêu chiến dịch';
  }

  if (!payload.platforms || payload.platforms.length === 0) {
    errors.platforms = 'Vui lòng chọn ít nhất 1 nền tảng';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateStep2(payload: Partial<CampaignDraftPayload>): StepValidationResult {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  const creative = payload.creative;

  if (payload.platforms?.includes('facebook') && (!payload.pages || payload.pages.length === 0)) {
    errors.pages = 'Vui lòng chọn ít nhất 1 Trang Fanpage để phân phối quảng cáo';
  }

  if (!creative?.headline?.trim()) {
    errors.headline = 'Vui lòng nhập tiêu đề quảng cáo';
  } else if (creative.headline.trim().length > 100) {
    errors.headline = 'Tiêu đề tối đa 100 ký tự';
  }

  if (!creative?.primaryText?.trim()) {
    errors.primaryText = 'Vui lòng nhập nội dung chính';
  } else if (creative.primaryText.trim().length > 500) {
    errors.primaryText = 'Nội dung chính tối đa 500 ký tự';
  }

  if (!creative?.landingUrl?.trim()) {
    errors.landingUrl = 'Vui lòng nhập đường dẫn liên kết';
  } else if (!/^https?:\/\/.+/i.test(creative.landingUrl.trim())) {
    errors.landingUrl = 'Đường dẫn phải bắt đầu bằng http:// hoặc https://';
  }

  if (!creative?.imageId) {
    warnings.imageId = 'Chưa chọn hình ảnh — quảng cáo sẽ chỉ có văn bản';
  }

  return { valid: Object.keys(errors).length === 0, errors, warnings };
}

export function validateStep3(payload: Partial<CampaignDraftPayload>): StepValidationResult {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  const audience = payload.audience;

  if (!audience) {
    return { valid: false, errors: { audience: 'Chưa cấu hình đối tượng mục tiêu' } };
  }

  if (payload.specialCategory === 'HOUSING') {
    if (audience.ageMin !== 18 || audience.ageMax !== 65) {
      errors.age = 'Chính sách nhà ở yêu cầu cố định độ tuổi 18–65';
    }
    if (!audience.genders || audience.genders.length < 2) {
      errors.genders = 'Chính sách nhà ở yêu cầu nhắm tới tất cả giới tính';
    }
  } else {
    if (audience.ageMin < 18 || audience.ageMin > 65) {
      errors.age = 'Độ tuổi tối thiểu từ 18 đến 65';
    }
    if (audience.ageMax < 18 || audience.ageMax > 65) {
      errors.age = 'Độ tuổi tối đa từ 18 đến 65';
    }
    if (audience.ageMin > audience.ageMax) {
      errors.age = 'Độ tuổi tối thiểu không được lớn hơn độ tuổi tối đa';
    }
    if (!audience.genders || audience.genders.length === 0) {
      errors.genders = 'Vui lòng chọn ít nhất một giới tính';
    }
  }

  if (audience.locations === 'VN') {
    if (!payload.acknowledgeNationwide) {
      errors.locations = 'Vui lòng xác nhận nhắm mục tiêu toàn quốc (hoặc chọn tỉnh thành cụ thể)';
    }
  } else if (!Array.isArray(audience.locations) || audience.locations.length === 0) {
    errors.locations = 'Vui lòng chọn ít nhất 1 tỉnh/thành phố hoặc chọn Toàn quốc';
  }

  return { valid: Object.keys(errors).length === 0, errors, warnings };
}

export function validateStep4(payload: Partial<CampaignDraftPayload>): StepValidationResult {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  const totalBudget = payload.totalDailyBudget ?? 0;
  if (totalBudget < 50_000) {
    errors.totalDailyBudget = 'Ngân sách ngày tối thiểu là 50.000 ₫';
  } else if (totalBudget % 1000 !== 0) {
    errors.totalDailyBudget = 'Ngân sách phải là bội số của 1.000 ₫';
  }

  const allocations = payload.allocations ?? [];
  const totalPercent = allocations.reduce((sum, a) => sum + (a.percentage ?? a.percent ?? 0), 0);
  if (Math.round(totalPercent) !== 100) {
    errors.allocations = `Tổng tỷ lệ phân bổ phải bằng 100% (hiện tại: ${totalPercent}%)`;
  }

  for (const alloc of allocations) {
    const p = alloc.percentage ?? alloc.percent ?? 0;
    if (p === 0) {
      warnings[alloc.platform] = `Kênh ${alloc.platform} được phân bổ 0% — sẽ không chi tiêu ngân sách`;
    }
  }

  const schedule = payload.schedule;
  if (schedule?.startTime) {
    const start = new Date(schedule.startTime).getTime();
    if (start < Date.now() - 5 * 60 * 1000) {
      errors.startTime = 'Thời gian bắt đầu không được ở trong quá khứ';
    }
  }

  if (schedule?.startTime && schedule?.endTime) {
    const start = new Date(schedule.startTime).getTime();
    const end = new Date(schedule.endTime).getTime();
    if (end <= start) {
      errors.endTime = 'Thời gian kết thúc phải sau thời gian bắt đầu';
    } else if (end - start < 24 * 60 * 60 * 1000) {
      errors.endTime = 'Thời gian chạy chiến dịch tối thiểu 24 giờ';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, warnings };
}

export function validateDraftAll(payload: Partial<CampaignDraftPayload>): {
  valid: boolean;
  stepErrors: Record<number, Record<string, string>>;
} {
  const s1 = validateStep1(payload);
  const s2 = validateStep2(payload);
  const s3 = validateStep3(payload);
  const s4 = validateStep4(payload);

  const stepErrors: Record<number, Record<string, string>> = {};
  if (!s1.valid) stepErrors[1] = s1.errors;
  if (!s2.valid) stepErrors[2] = s2.errors;
  if (!s3.valid) stepErrors[3] = s3.errors;
  if (!s4.valid) stepErrors[4] = s4.errors;

  return {
    valid: s1.valid && s2.valid && s3.valid && s4.valid,
    stepErrors,
  };
}

