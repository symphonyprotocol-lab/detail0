/**
 * The anchoring tick. aptos-anchoring-proposal.md 4.3.
 *
 * Its own route rather than a few lines inside the queue drain, because
 * anchoring is a side path that has to come out cleanly (4.1): deleting this
 * directory and one line of vercel.json removes the whole schedule, with no
 * edit to anything the rest of the platform runs on.
 *
 * Every fifteen minutes, which is not how often it anchors. One version batch
 * an hour and one audit batch a day are decided inside the tick; the frequency
 * here is for the other half of the work -- confirming a transaction that was
 * submitted on an earlier tick, which is what keeps the two-hour SLO in 4.8
 * comfortable rather than tight.
 *
 * A deployment with no APTOS_* configuration answers 200 with nothing done:
 * the tick finds itself unconfigured and skips, which is the same switch that
 * removes anchoring everywhere else.
 */
import { NextResponse } from 'next/server';
import { reportAnchorAlerts, runAnchorTick } from '@/lib/application/anchors';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 401 });
  }

  const anchors = await runAnchorTick();
  /*
   * Evaluated after the tick, so a batch this run confirmed is not still being
   * reported as stalled. The lines go to the log because that is the delivery
   * that exists (architecture.md 17.2); routing them to a channel is
   * configuration, not code.
   */
  const alerts = await reportAnchorAlerts();

  return NextResponse.json(
    { anchors, alerts: alerts.map((alert) => `${alert.severity}:${alert.code}`) },
    { headers: { 'cache-control': 'no-store' } },
  );
}
