/**
 * API route error-handling middleware.
 * Wraps Next.js App Router route handlers with consistent error recovery.
 */
import { NextRequest, NextResponse } from 'next/server';

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

type RouteHandler = (
  req: NextRequest,
  context: { params: Record<string, string> },
) => Promise<NextResponse | Response>;

/**
 * Wraps an API route handler to catch and normalize errors.
 *
 * Usage:
 *   export const POST = withErrorHandler(async (req, ctx) => { ... });
 */
export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      console.error(`[API Error] ${req.method} ${req.nextUrl.pathname}`, error);

      if (error instanceof APIError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      // Unknown error → 500 with safe message
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  };
}
