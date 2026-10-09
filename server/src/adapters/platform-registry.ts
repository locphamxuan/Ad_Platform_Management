import type { Platform } from '../domain/types.js';
import { ValidationError } from '../domain/errors.js';
import type { IAdPlatformAdapter } from './ad-platform.adapter.js';

/** Strategy registry: adding a channel = registering a new adapter. */
export class PlatformRegistry {
  private readonly adapters = new Map<Platform, IAdPlatformAdapter>();

  register(adapter: IAdPlatformAdapter): this {
    this.adapters.set(adapter.platform, adapter);
    return this;
  }

  get(platform: Platform): IAdPlatformAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) throw new ValidationError(`No adapter registered for "${platform}"`);
    return adapter;
  }

  all(): IAdPlatformAdapter[] {
    return [...this.adapters.values()];
  }
}
