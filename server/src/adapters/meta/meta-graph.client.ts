import { createHmac } from 'node:crypto';
import { AppError } from '../../domain/errors.js';

export interface MetaGraphCredentials {
  accessToken: string;
  appSecret: string;
  apiVersion: string;
}

/** Shape of the `error` object the Graph API returns on failure. */
interface MetaErrorBody {
  message?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
}

export class MetaApiError extends AppError {
  constructor(
    message: string,
    public readonly metaCode?: number,
    public readonly fbtraceId?: string,
  ) {
    super('META_API_ERROR', message, 502);
  }
}

/** Codes Meta uses for expired, revoked or otherwise unusable tokens. */
const TOKEN_ERROR_CODES = new Set([102, 190]);
/** Codes Meta uses when the app or ad account hits its rate limit. */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80000, 80003, 80004]);

type Params = Record<string, string | number | boolean | object | undefined>;

/** Minimal Graph API client: signs every call and turns Meta errors into readable AppErrors. */
export class MetaGraphClient {
  private readonly baseUrl: string;
  private readonly appSecretProof: string;

  constructor(
    private readonly credentials: MetaGraphCredentials,
    private readonly http: typeof fetch = fetch,
  ) {
    this.baseUrl = `https://graph.facebook.com/${credentials.apiVersion}`;
    // Proves the call comes from our server, so a leaked token alone cannot be replayed elsewhere.
    this.appSecretProof = createHmac('sha256', credentials.appSecret).update(credentials.accessToken).digest('hex');
  }

  get<T>(path: string, params: Params = {}): Promise<T> {
    return this.request<T>('GET', path, params);
  }

  post<T>(path: string, params: Params = {}): Promise<T> {
    return this.request<T>('POST', path, params);
  }

  delete(path: string): Promise<unknown> {
    return this.request('DELETE', path, {});
  }

  private async request<T>(method: string, path: string, params: Params): Promise<T> {
    const body = new URLSearchParams({
      access_token: this.credentials.accessToken,
      appsecret_proof: this.appSecretProof,
    });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }

    const url = method === 'GET' ? `${this.baseUrl}/${path}?${body}` : `${this.baseUrl}/${path}`;
    const response = await this.http(url, method === 'GET' ? { method } : { method, body });
    const json = (await response.json().catch(() => ({}))) as { error?: MetaErrorBody } & T;
    if (!response.ok || json.error) throw toMetaApiError(json.error ?? { message: response.statusText });
    return json;
  }
}

function toMetaApiError(error: MetaErrorBody): MetaApiError {
  const code = error.code;
  let message = error.error_user_msg || error.message || 'Meta API request failed';
  if (code !== undefined && TOKEN_ERROR_CODES.has(code)) {
    message = `Token Meta hết hạn hoặc không hợp lệ, hãy tạo token mới trong server/.env (${error.message})`;
  } else if (code !== undefined && RATE_LIMIT_CODES.has(code)) {
    message = `Meta đang giới hạn tần suất gọi API, thử lại sau ít phút (${error.message})`;
  } else if (error.error_user_title && !message.startsWith(error.error_user_title)) {
    message = `${error.error_user_title}: ${message}`;
  }
  return new MetaApiError(message, code, error.fbtrace_id);
}
