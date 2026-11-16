import { google } from 'googleapis';
import type { NextRequest } from 'next/server';

export const OAUTH_STATE_COOKIE = 'oauth_state';

/** Public base URL of the app (behind nginx the request host is 127.0.0.1). */
export function appUrl(req: NextRequest): string {
  return (process.env.APP_URL || req.nextUrl.origin).replace(/\/+$/, '');
}

export function oauthClient(req: NextRequest) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set');
  }
  return {
    client: new google.auth.OAuth2(clientId, clientSecret, `${appUrl(req)}/api/auth/google/callback`),
    clientId,
  };
}
