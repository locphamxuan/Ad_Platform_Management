export interface MetaMappedError {
  code: string;
  message: string;
  fix?: string;
  level?: 'CAMPAIGN' | 'AD_SET' | 'AD_CREATIVE' | 'AD';
}

/**
 * Maps raw Meta error codes, subcodes or error messages into Vietnamese-friendly
 * error descriptions with actionable guidance.
 */
export function mapMetaError(error: unknown, context?: { pageName?: string; pageId?: string; level?: 'CAMPAIGN' | 'AD_SET' | 'AD_CREATIVE' | 'AD' }): MetaMappedError {
  const err = error as {
    code?: number;
    error_subcode?: number;
    metaCode?: number;
    errorSubcode?: number;
    message?: string;
    error_user_msg?: string;
    error_user_title?: string;
    errorUserMsg?: string;
    errorUserTitle?: string;
  } | undefined;

  const code = err?.metaCode ?? err?.code;
  const subcode = err?.errorSubcode ?? err?.error_subcode;
  const userMsg = err?.errorUserMsg ?? err?.error_user_msg;
  const userTitle = err?.errorUserTitle ?? err?.error_user_title;
  const rawMsg = err?.message ?? '';

  const pagePrefix = context?.pageName ? `[${context.pageName}] ` : '';

  // 1. Expired or invalid token
  if (code === 190 || code === 102) {
    return {
      code: 'META_TOKEN_EXPIRED',
      message: 'Token truy cập Meta đã hết hạn hoặc bị thu hồi quyền.',
      fix: 'Vui lòng làm mới token Meta trong Kết nối nền tảng hoặc file cấu hình .env.',
      level: context?.level,
    };
  }

  // 2. Rate limit
  if (code === 4 || code === 17 || code === 32 || code === 613 || (code !== undefined && code >= 80000 && code <= 80004)) {
    return {
      code: 'META_RATE_LIMIT',
      message: 'Meta đang giới hạn tần suất gọi API từ ứng dụng hoặc tài khoản.',
      fix: 'Hệ thống sẽ không thử lại liên tục để tránh bị khóa. Vui lòng chờ ít phút rồi thử lại.',
      level: context?.level,
    };
  }

  // 3. Permissions / Access denied
  if (code === 200 || code === 10) {
    if (context?.pageName) {
      return {
        code: 'META_PAGE_PERMISSION',
        message: `${pagePrefix}Tài khoản không đủ quyền quảng cáo trên Trang này.`,
        fix: 'Kiểm tra quyền của người dùng trên Trang (cần vai trò nhà quảng cáo hoặc quản trị viên Trang).',
        level: 'AD_CREATIVE',
      };
    }
    return {
      code: 'META_PERMISSION_DENIED',
      message: 'Tài khoản Meta không có quyền thực hiện thao tác này.',
      fix: 'Kiểm tra quyền truy cập vào tài khoản quảng cáo và Business Manager.',
      level: context?.level,
    };
  }

  // 4. Inactive account / payment / spend cap
  if (code === 272 || rawMsg.includes('account is disabled') || rawMsg.includes('account_status')) {
    return {
      code: 'META_ACCOUNT_INACTIVE',
      message: 'Tài khoản quảng cáo Meta đang bị vô hiệu hóa hoặc chưa kích hoạt.',
      fix: 'Kiểm tra trạng thái tài khoản trong Meta Ads Manager hoặc Business Manager.',
      level: 'CAMPAIGN',
    };
  }
  if (code === 1487739 || rawMsg.toLowerCase().includes('payment') || rawMsg.toLowerCase().includes('billing')) {
    return {
      code: 'META_PAYMENT',
      message: 'Tài khoản quảng cáo gặp vấn đề về phương thức thanh toán.',
      fix: 'Thêm hoặc cập nhật phương thức thanh toán hợp lệ trên Meta Ads Manager.',
      level: 'CAMPAIGN',
    };
  }
  if (code === 1487534 || rawMsg.toLowerCase().includes('spend cap')) {
    return {
      code: 'META_SPEND_CAP',
      message: 'Tài khoản quảng cáo đã chạm ngưỡng chi tiêu tối đa (Spend Cap).',
      fix: 'Tăng hoặc đặt lại ngưỡng chi tiêu trong cài đặt thanh toán của Meta.',
      level: 'CAMPAIGN',
    };
  }

  // 5. Page advertising restriction / subcodes
  if (subcode === 1885316 || rawMsg.includes('restricted from advertising') || rawMsg.includes('capability')) {
    return {
      code: 'META_PAGE_RESTRICTED',
      message: `${pagePrefix}Trang này bị hạn chế quảng cáo hoặc chưa được xuất bản.`,
      fix: 'Bỏ Trang này khỏi chiến dịch hoặc xác minh kháng nghị Trang trên Meta Business Suite.',
      level: 'AD',
    };
  }
  if (code === 100 && (rawMsg.includes('does not exist') || subcode === 33)) {
    return {
      code: 'META_OBJECT_NOT_FOUND',
      message: `${pagePrefix}Đối tượng quảng cáo hoặc Trang không tồn tại trên Meta.`,
      fix: 'Tải lại danh sách Trang để cập nhật những Trang còn khả dụng.',
      level: context?.level ?? 'AD',
    };
  }

  // 6. User friendly message from Meta
  if (userMsg) {
    const title = userTitle ? `${userTitle}: ` : '';
    return {
      code: `META_ERR_${code ?? 'UNKNOWN'}`,
      message: `${pagePrefix}${title}${userMsg}`,
      fix: 'Vui lòng kiểm tra lại thông số chiến dịch theo thông báo từ Meta.',
      level: context?.level,
    };
  }

  return {
    code: `META_ERR_${code ?? 'UNKNOWN'}`,
    message: `${pagePrefix}${rawMsg || 'Lỗi không xác định từ Meta API.'}`,
    fix: 'Vui lòng thử lại hoặc đối chiếu thông tin trong Meta Ads Manager.',
    level: context?.level,
  };
}

