import { describe, expect, it } from 'vitest';
import { parseImageDimensions, MediaService } from '../src/services/media.service.js';
import { mapMetaError } from '../src/adapters/meta/meta-errors.js';
import { ValidationError } from '../src/domain/errors.js';

function createDummyPngBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(32);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // Chunk length (13)
  buf.writeUInt32BE(13, 8);
  // "IHDR"
  buf.set([0x49, 0x48, 0x44, 0x52], 12);
  // Width & height
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function createDummyJpegBuffer(width: number, height: number): Buffer {
  // SOI (FF D8) + SOF0 (FF C0) + length (11) + precision (8) + height (2) + width (2) + EOI (FF D9)
  const buf = Buffer.alloc(64);
  buf.set([0xff, 0xd8], 0); // SOI
  buf.set([0xff, 0xc0], 2); // SOF0
  buf.writeUInt16BE(11, 4); // chunk length
  buf.writeUInt8(8, 6); // precision
  buf.writeUInt16BE(height, 7); // height
  buf.writeUInt16BE(width, 9); // width
  buf.set([0xff, 0xd9], 14); // EOI
  return buf;
}

class FakeMediaRepo {
  private assets = new Map<string, any>();

  async findById(id: string) {
    return this.assets.get(id) ?? null;
  }
  async getById(id: string) {
    const a = this.assets.get(id);
    if (!a) throw new Error('Not found');
    return a;
  }
  async findBySha256(sha256: string) {
    for (const a of this.assets.values()) {
      if (a.sha256 === sha256) return a;
    }
    return null;
  }
  async insert(asset: any) {
    this.assets.set(asset.id, asset);
    return asset;
  }
  async updateMetaHash(id: string, accountId: string, hash: string) {
    const a = this.assets.get(id);
    if (a) a.metaHashes[accountId] = hash;
  }
  async delete(id: string) {
    return this.assets.delete(id);
  }
}

describe('MediaService and image parsing', () => {
  it('parses valid PNG dimensions', () => {
    const png = createDummyPngBuffer(800, 600);
    const parsed = parseImageDimensions(png);
    expect(parsed.mimeType).toBe('image/png');
    expect(parsed.width).toBe(800);
    expect(parsed.height).toBe(600);
  });

  it('parses valid JPEG dimensions', () => {
    const jpeg = createDummyJpegBuffer(1200, 628);
    const parsed = parseImageDimensions(jpeg);
    expect(parsed.mimeType).toBe('image/jpeg');
    expect(parsed.width).toBe(1200);
    expect(parsed.height).toBe(628);
  });

  it('rejects unsupported or corrupt image formats', () => {
    const corrupt = Buffer.from('not an image at all but with some length');
    expect(() => parseImageDimensions(corrupt)).toThrow(ValidationError);
  });

  it('rejects images below 600px', async () => {
    const smallPng = createDummyPngBuffer(400, 400);
    const svc = new MediaService(new FakeMediaRepo() as any);
    await expect(svc.upload('user-1', { fileName: 'small.png', data: smallPng })).rejects.toThrow(
      /kích thước tối thiểu là 600x600px/,
    );
  });

  it('rejects files larger than 4MB', async () => {
    const hugeBuf = Buffer.alloc(4 * 1024 * 1024 + 1);
    const svc = new MediaService(new FakeMediaRepo() as any);
    await expect(svc.upload('user-1', { fileName: 'huge.jpg', data: hugeBuf })).rejects.toThrow(
      /vượt quá 4MB/,
    );
  });

  it('uploads valid image and deduplicates identical sha256', async () => {
    const png = createDummyPngBuffer(1080, 1080);
    const repo = new FakeMediaRepo();
    const svc = new MediaService(repo as any);

    const asset1 = await svc.upload('user-1', { fileName: 'banner.png', data: png });
    expect(asset1.width).toBe(1080);
    expect(asset1.height).toBe(1080);
    expect(asset1.mimeType).toBe('image/png');

    // Upload identical data again
    const asset2 = await svc.upload('user-2', { fileName: 'banner-copy.png', data: png });
    expect(asset2.id).toBe(asset1.id);
  });
});

describe('Meta error mapper', () => {
  it('maps token expired code 190', () => {
    const mapped = mapMetaError({ code: 190, message: 'Session expired' });
    expect(mapped.code).toBe('META_TOKEN_EXPIRED');
    expect(mapped.message).toContain('hết hạn');
  });

  it('maps rate limit codes', () => {
    const mapped = mapMetaError({ code: 17, message: 'User request limit reached' });
    expect(mapped.code).toBe('META_RATE_LIMIT');
    expect(mapped.message).toContain('giới hạn tần suất');
  });

  it('maps page advertising restricted error with page name', () => {
    const mapped = mapMetaError(
      { code: 100, error_subcode: 1885316, message: 'Page restricted' },
      { pageName: 'Fanpage Bán Hàng', level: 'AD' },
    );
    expect(mapped.code).toBe('META_PAGE_RESTRICTED');
    expect(mapped.message).toContain('[Fanpage Bán Hàng]');
  });
});

