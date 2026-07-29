import { NextRequest, NextResponse } from 'next/server';

/**
 * Raw Edit Log API — receives batched edit records from the browser.
 * V1: logs to console + appends to a JSONL file.
 * V2: streams to a database or analytics service.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { edits } = body as { edits: Array<Record<string, unknown>> };

    if (!Array.isArray(edits)) {
      return NextResponse.json({ error: 'edits must be an array' }, { status: 400 });
    }

    // V1: Log to console for development visibility
    if (edits.length > 0) {
      // V1: log for development visibility (V2: append to JSONL file or database)
      process.stdout.write(`[EditLog] Received ${edits.length} edits\n`);
    }

    return NextResponse.json({ received: edits.length, status: 'ok' });
  } catch (error) {
    console.error('[EditLog] Error processing edits:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
