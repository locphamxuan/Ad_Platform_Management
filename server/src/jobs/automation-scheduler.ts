import cron from 'node-cron';
import type { Container } from '../container.js';

const EVERY_MINUTE = '* * * * *';

/** Periodically syncs insights, statuses, then evaluates enabled automation rules. */
export function startAutomationScheduler(c: Container) {
  let running = false;
  let minuteCount = 0;

  return cron.schedule(EVERY_MINUTE, async () => {
    if (running) return; // never overlap runs
    running = true;
    minuteCount++;
    try {
      await c.sync.syncToday();

      // Run status sync & draft sweep every 5 minutes
      if (minuteCount % 5 === 0) {
        await c.sync.syncStatuses();
        await c.drafts.sweepStuckDrafts();
      }

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
