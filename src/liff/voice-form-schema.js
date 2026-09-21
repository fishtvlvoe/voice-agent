// 語音助理要收集哪些欄位、講什麼人設，全部寫在這份設定檔，不寫死在程式邏輯裡。
// 依實際用途替換 VOICE_FORMS / descriptions / AGENT_INSTRUCTIONS 即可，不用動 voice-intake.js。
export const VOICE_FORMS = {
  generic_intake: ['contactName', 'topic', 'detail', 'phone', 'email'],
};

export const VOICE_OPTIONAL_FIELDS = {
  generic_intake: ['note'],
};

const descriptions = {
  contactName: '對方姓名',
  topic: '這次要記錄的主題',
  detail: '詳細內容',
  phone: '聯絡電話',
  email: '聯絡 Email',
  note: '備註（選填）',
};

export const SUBMIT_TOOL = {
  type: 'function', name: 'submit_voice_intake',
  description: '只在指定表單的必填欄位已齊全、逐項確認，且使用者同意送出後呼叫。',
  parameters: {
    type: 'object', additionalProperties: false,
    properties: {
      formType: { type: 'string', enum: Object.keys(VOICE_FORMS), description: '依使用者描述判斷的表單類型' },
      ...Object.fromEntries(Object.entries(descriptions).map(([field, description]) => [field, {
        type: 'string', description,
      }])),
    },
    required: ['formType'],
    oneOf: Object.entries(VOICE_FORMS).map(([formType, fields]) => ({
      properties: { formType: { const: formType } },
      required: ['formType', ...fields],
    })),
  },
};

export function buildRosterHint(memberNames) {
  if (!Array.isArray(memberNames) || memberNames.length === 0) return '';
  return `如果句子裡提到人名，這是使用者常用聯絡人清單，語音辨識常把姓名聽成同音錯字，請優先判斷句子裡的人名是不是在講清單裡的某一位（諧音也算），是的話直接輸出清單裡的正式姓名；如果聽起來不像清單裡任何一位，就照原音直接輸出你聽到的名字，不要瞎猜成清單以外的人。清單：${memberNames.join('、')}`;
}

export function buildMemoryHint(savedMemory) {
  if (!savedMemory || typeof savedMemory !== 'object') return '';
  const items = [];
  if (savedMemory.phone) items.push(`電話是 ${savedMemory.phone}`);
  if (savedMemory.email) items.push(`信箱是 ${savedMemory.email}`);
  if (savedMemory.address) items.push(`地址是 ${savedMemory.address}`);
  for (const [k, v] of Object.entries(savedMemory)) {
    if (!['phone', 'email', 'address'].includes(k) && v) {
      items.push(`${k}是 ${v}`);
    }
  }
  if (items.length === 0) return '';
  return `使用者已儲存的個人常用聯絡資料：${items.join('、')}。當使用者說「用我的電話」、「用我的手機」、「用我的信箱」、「用我的地址」或類似代換意圖時，請直接代入已存的值，不需要再向使用者詢問該欄位。`;
}

// 語音對話的 LLM 沒有內建時鐘，只能靠 system instructions 給它一個時間錨點自己換算相對日期。
export function buildTodayHint(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === 'year').value;
  const month = parts.find((p) => p.type === 'month').value;
  const day = parts.find((p) => p.type === 'day').value;
  const dateStr = `${year}-${month}-${day}`;
  const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
  const weekdayIndex = new Date(`${dateStr}T12:00:00+08:00`).getDay();
  return `今天是台灣時間 ${dateStr}（星期${WEEKDAY_NAMES[weekdayIndex]}）。使用者說「今天」「明天」「後天」「這禮拜X」「下禮拜X」等相對日期時，直接用這個日期當基準自己換算成 YYYY-MM-DD 填入欄位，不要反問使用者確切日期或年份；使用者已經講出完整日期時，照使用者講的為準。`;
}

export const FINISH_ENTRY_TOOL = {
  type: 'function',
  name: 'finish_current_entry',
  description: '當前這筆表單的必填欄位已齊全且使用者確認後呼叫。系統會把這筆存起來，你可以接著問「還有下一筆嗎？」。使用者說沒有了就呼叫 submit_voice_intake 送出全部。',
  parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
};

export const REMEMBER_TOOL = {
  type: 'function',
  name: 'remember_info',
  description: '當使用者明確要求「記住我的X」、「幫我記下我的X」且提供明確值時呼叫，立即儲存個人常用資料。僅支援電話、信箱、地址。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      field: { type: 'string', description: '要記住的欄位名稱，僅支援 phone（電話/手機）、email（信箱/電子郵件）、address（地址）' },
      value: { type: 'string', maxLength: 500, description: '要記住的值，長度上限 500 字元' },
    },
    required: ['field', 'value'],
  },
};

export const AGENT_INSTRUCTIONS = [
  '你是一個語音助理，負責用對話方式收集使用者提供的資訊，並整理成結構化欄位。',
  '一律使用繁體中文對話，絕對不可以先用英文開場或回答。語氣自然簡短，一次只問一個問題。',
  '先從使用者描述自動判斷要收集哪一種資料，不要求使用者先選類型。不確定時先釐清，不猜測。',
  ...Object.entries(VOICE_FORMS).map(([type, fields]) => `${type} 必填欄位：${fields.map(f => `${f}（${descriptions[f]}）`).join('、')}。`),
  '只追問當前缺少或不清楚的欄位，使用者可以一次提供多欄，已確認的不要重問。',
  '每收集到一項資訊，簡短跟使用者確認；確認或修正後立即呼叫 update_voice_intake，以 formType 和已確認欄位暫存，這不是送出。',
  '當使用者說「幫我記下我的X」、「記住我的X」且有明確值時，立即呼叫 remember_info 工具儲存（僅支援電話、信箱、地址），不用等表單送出。若使用者要求記住非支援欄位或超出範圍，依工具回傳結果口頭向使用者說明無法記住，不可假裝成功。',
  '當前筆必填欄位齊全且使用者確認後，呼叫 finish_current_entry 把這筆存起來，然後問「還有下一筆嗎？」。使用者說有就繼續收集下一筆，說沒有了再呼叫 submit_voice_intake 一次送出全部。',
  '只有一筆時也要先 finish_current_entry 再 submit_voice_intake，確保流程一致。',
  'submit_voice_intake 呼叫成功後，跟使用者說的結尾語句必須是「資料已經整理好了」，不可說已經送出到其他系統或已經完成後續處理。',
  '使用者想取消時結束對話，不要硬凹。',
].join('\n');
