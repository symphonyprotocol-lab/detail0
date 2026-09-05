/**
 * The scheduled queue drain. architecture.md 8.4.
 *
 * Every build is kicked off right after the response that queued it
 * (`after(runOperation)` in the dashboard and console actions), so this is
 * the safety net: operations whose follow-up run died with the function,
 * retries of failed ones, and the upload sweep that runs at the end of each
 * drain. Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`;
 * anything else is a 401, so the route cannot be used to make the platform
 * do work on demand.
 */
import { NextResponse } from 'next/server';
import { drainOperations } from '@/lib/application/ingestion';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 401 });
  }
  const outcomes = await drainOperations({ limit: 10 });
  return NextResponse.json(
    { drained: outcomes.length, outcomes: outcomes.map((outcome) => outcome.status) },
    { headers: { 'cache-control': 'no-store' } },
  );
}
