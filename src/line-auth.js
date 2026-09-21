// 純 LINE Login / LIFF 身分驗證，跟業務邏輯無關，抽出來單獨維護。
export async function verifyLineToken(idToken, liffId) {
  const channelId = liffId.split('-')[0];
  const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
    const err = new Error(`INVALID_LINE_TOKEN: ${response.status} ${detail}`);
    err.code = 'INVALID_LINE_TOKEN';
    err.status = response.status;
    err.detail = detail;
    throw err;
  }

  const body = await response.json();
  return {
    lineUserId: body.sub,
    displayName: body.name ?? 'User',
    pictureUrl: body.picture ?? null,
  };
}
