/**
 * The scheduled queue drain. architecture.md 8.4.
 *
 * Every build is kicked off right after the response that queued it
 * (`after(runOperation)` in the dashboard and console actions), so for those
 * this is the safety net: operations whose follow-up run died with the function,
 * retries of failed ones, and the upload sweep that runs at the end of each
 * drain. It is also the schedule: each call first queues a refresh for every
 * platform source whose policy says it is due (`scheduleDueRefreshes`).
 * Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`;
 * anything else is a 401, so the route cannot be used to make the platform
 * do work on demand.
 */
import { NextResponse } from 'next/server';
import { reportAnchorAlerts, runAnchorTick } from '@/lib/application/anchors';
import { drainOperations, isIngestionConfigured, scheduleDueRefreshes } from '@/lib/application/ingestion';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 401 });
  }
  /*
   * Policies first, then the queue: a source that fell due since the last
   * drain is queued here and built in the same call. Not when the deployment
   * cannot build -- queuing work that fails on the spot would only mark
   * libraries failed for a missing provider key.
   */
  const scheduled = isIngestionConfigured() ? await scheduleDueRefreshes() : [];
  const outcomes = await drainOperations({ limit: 10 });

  /*
   * Anchoring rides on the same tick, after the queue and never before it: it
   * is the side path (aptos-anchoring-proposal.md 4.1), so a chain that is slow
   * or down must not delay a build. The tick decides for itself whether
   * anything is due -- one version batch an hour, one audit batch a day -- so
   * the ten-minute schedule does not turn into ten-minute anchoring.
   */
  const anchors = await runAnchorTick();
  /*
   * Evaluated after the tick, so a batch this run confirmed is not still being
   * reported as stalled. The lines go to the log because that is the delivery
   * that exists (architecture.md 17.2 names what to watch, not where to send
   * it); routing them to a channel is configuration, not code.
   */
  const alerts = await reportAnchorAlerts();

  return NextResponse.json(
    {
      scheduled: scheduled.length,
      drained: outcomes.length,
      outcomes: outcomes.map((outcome) => outcome.status),
      anchors,
      alerts: alerts.map((alert) => `${alert.severity}:${alert.code}`),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
