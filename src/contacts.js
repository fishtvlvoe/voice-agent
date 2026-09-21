// 通用聯絡人別名清單：語音辨識常把人名聽成同音錯字，先把「使用者常用聯絡人清單」
// 餵給語音 AI 做校正。原系統這張表綁定特定組織的會員名冊，這裡改成通用範例，
// 實際使用時換成自己的聯絡人來源（通訊錄、CRM、使用者自建清單皆可）。
export const SEED_CONTACTS = [
  { chinese_name: '王小明', english_name: 'Ming', aliases: 'Ming' },
  { chinese_name: '陳大文', english_name: 'David', aliases: 'David' },
];

export async function seedContacts(db) {
  const now = Math.floor(Date.now() / 1000);
  let count = 0;
  for (const item of SEED_CONTACTS) {
    await db.prepare(
      `INSERT INTO contacts (chinese_name, english_name, aliases, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(chinese_name) DO UPDATE SET
         english_name = excluded.english_name,
         aliases = excluded.aliases,
         updated_at = excluded.updated_at`
    ).bind(item.chinese_name, item.english_name, item.aliases, now).run();
    count += 1;
  }
  return count;
}

export async function listContacts(db, timeoutMs = 2000) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('D1 database binding missing or invalid');
  }
  const query = db.prepare('SELECT chinese_name, english_name, aliases, updated_at FROM contacts').all();

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('D1 listContacts timeout')), timeoutMs);
  });

  try {
    const res = await Promise.race([query, timeoutPromise]);
    return res?.results || [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}
