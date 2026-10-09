import cron from 'node-cron';
import type { Container } from '../container.js';

const EVERY_MINUTE = '* * * * *';

/** Periodically syncs insights, then evaluates enabled automation rules. */
export function startAutomationScheduler(c: Container) {
  let running = false;

  return cron.schedule(EVERY_MINUTE, async () => {
    if (running) return; // never overlap runs
    running = true;
    try {
      await c.sync.syncToday();
      const results = await c.rules.runAllEnabled();
      const actions = results.reduce((sum, r) => sum + r.actions.length, 0);
      if (actions > 0) console.log(`[automation] ${actions} action(s) applied`);
    } catch (error) {
      console.error('[automation] run failed', error);
    } finally {
      running = false;
    }
  });
}
