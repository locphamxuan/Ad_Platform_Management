export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} "${id}" not found`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Vui lòng đăng nhập') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Bạn không có quyền thực hiện thao tác này') {
    super('FORBIDDEN', message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}

export class PlatformNotConnectedError extends AppError {
  constructor(platform: string) {
    super(
      'PLATFORM_NOT_CONNECTED',
      `Nền tảng "${platform}" chưa kết nối (hoặc cần kết nối lại sau khi bật API thật) — vào trang Kết nối nền tảng`,
      409,
    );
  }
}

export class TooManyRequestsError extends AppError {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number,
  ) {
    super('TOO_MANY_REQUESTS', message, 429);
  }
}
