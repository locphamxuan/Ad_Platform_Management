import { createHash, randomUUID } from 'node:crypto';
import type { MediaAsset } from '../domain/types.js';
import { ValidationError, NotFoundError } from '../domain/errors.js';
import type { MediaRepository } from '../repositories/media.repository.js';

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Extracts width and height from PNG, JPEG, and WebP buffers using headers.
 * Throws ValidationError if format is unsupported or dimensions cannot be parsed.
 */
export function parseImageDimensions(buffer: Buffer): { mimeType: string; width: number; height: number } {
  if (buffer.length < 24) {
    throw new ValidationError('Không tải được hình — kiểm tra lại tệp');
  }

  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { mimeType: 'image/png', width, height };
  }

  // 2. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      // Standalone markers without length: SOI (D8), EOI (D9), RST0-RST7 (D0-D7)
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      // SOF markers: SOF0 (C0), SOF1 (C1), SOF2 (C2), SOF3 (C3), SOF5 (C5), SOF6 (C6), SOF7 (C7),
      // SOF9 (C9), SOF10 (CA), SOF11 (CB), SOF13 (CD), SOF14 (CE), SOF15 (CF)
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { mimeType: 'image/jpeg', width, height };
      }
      const length = buffer.readUInt16BE(offset + 2);
      offset += 2 + length;
    }
  }

  // 3. WebP: RIFF .... WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    // VP8 chunk
    if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x20) {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      return { mimeType: 'image/webp', width, height };
    }
    // VP8L (lossless)
    if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x4c) {
      const b1 = buffer[21];
      const b2 = buffer[22];
      const b3 = buffer[23];
      const b4 = buffer[24];
      const width = 1 + (((b2 & 0x3f) << 8) | b1);
      const height = 1 + (((b4 & 0xf) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
      return { mimeType: 'image/webp', width, height };
    }
    // VP8X (extended)
    if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x58) {
      const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
      const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
      return { mimeType: 'image/webp', width, height };
    }
  }

  throw new ValidationError('Không tải được hình — kiểm tra lại tệp (chỉ hỗ trợ JPG, PNG, WebP)');
}

export class MediaService {
  constructor(private readonly mediaRepo: MediaRepository) {}

  /**
   * Validates and saves an image asset.
   * Constraints:
   * - Max size: 4MB
   * - Min dimensions: 600px x 600px
   * - Allowed types: JPEG, PNG, WebP
   */
  async upload(
    ownerId: string,
    file: { fileName: string; data: Buffer },
  ): Promise<MediaAsset> {
    const MAX_SIZE = 4 * 1024 * 1024; // 4MB
    if (file.data.length > MAX_SIZE) {
      throw new ValidationError('Không tải được hình — dung lượng vượt quá 4MB');
    }

    const { mimeType, width, height } = parseImageDimensions(file.data);

    if (width < 600 || height < 600) {
      throw new ValidationError(`Không tải được hình — kích thước tối thiểu là 600x600px (hiện tại: ${width}x${height}px)`);
    }

    const sha256 = createHash('sha256').update(file.data).digest('hex');

    // Reuse existing asset with identical sha256
    const existing = await this.mediaRepo.findBySha256(sha256);
    if (existing) {
      return existing;
    }

    const asset: MediaAsset = {
      id: randomUUID(),
      ownerId,
      fileName: file.fileName || `image-${Date.now()}.${mimeType.split('/')[1]}`,
      mimeType,
      size: file.data.length,
      width,
      height,
      sha256,
      metaHashes: {},
      data: file.data.toString('base64'),
      createdAt: new Date().toISOString(),
    };

    return this.mediaRepo.insert(asset);
  }

  async getById(id: string): Promise<MediaAsset> {
    return this.mediaRepo.getById(id);
  }

  async getImageBuffer(id: string): Promise<{ data: Buffer; mimeType: string }> {
    const asset = await this.mediaRepo.getById(id);
    if (!asset.data) {
      throw new NotFoundError('MediaAssetData', id);
    }
    return {
      data: Buffer.from(asset.data, 'base64'),
      mimeType: asset.mimeType,
    };
  }

  async saveMetaHash(mediaId: string, accountId: string, hash: string): Promise<void> {
    await this.mediaRepo.updateMetaHash(mediaId, accountId, hash);
  }
}

