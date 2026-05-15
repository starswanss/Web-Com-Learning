/**
 * LINE Notify — sends a push message to the LINE Notify group.
 * Teacher sets their LINE Notify token at notify.line.me → "My page" → "Generate token".
 * The token is stored in Firestore system/config.lineNotifyToken.
 */
export async function sendLineNotify(token: string, message: string): Promise<void> {
  try {
    await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `message=${encodeURIComponent(message)}`,
    });
  } catch {
    // LINE Notify is best-effort — never block the main flow
  }
}

/** Fetch the LINE Notify token from Firestore (used server-side only). */
export async function getLineNotifyToken(adminDb: FirebaseFirestore.Firestore): Promise<string | null> {
  try {
    const snap = await adminDb.collection('system').doc('config').get();
    return (snap.data()?.lineNotifyToken as string) || null;
  } catch {
    return null;
  }
}
