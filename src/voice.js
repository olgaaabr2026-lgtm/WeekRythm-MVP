const API_KEY = import.meta.env.VITE_ANTHROPIC_KEY;

function localISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function emptyVoiceCommand(raw) {
  return {
    action: 'unknown',
    title: '',
    date: null,
    targetDate: null,
    category: null,
    energy: null,
    raw
  };
}

export function listenOnce() {
  return new Promise((resolve, reject) => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      reject(new Error('Web Speech API не поддерживается в этом браузере'));
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'ru-RU';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn(value);
    };

    const timeout = setTimeout(() => {
      try { rec.stop(); } catch {}
      finish(reject, new Error('Время ожидания истекло'));
    }, 10000);

    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript || '';
      finish(resolve, transcript);
    };

    rec.onerror = (e) => {
      const message = e.error === 'not-allowed'
        ? 'Нет доступа к микрофону'
        : `Ошибка распознавания: ${e.error}`;
      finish(reject, new Error(message));
    };

    rec.start();
  });
}

export async function parseVoiceCommand(text, weekDatesISO) {
  if (!API_KEY) {
    throw new Error('VITE_ANTHROPIC_KEY не задан');
  }

  const todayISO = localISODate(new Date());
  const today = weekDatesISO.find((date) => date === todayISO) || weekDatesISO[0];

  const systemPrompt = `
Ты помощник планировщика задач WeekRythm. Пользователь говорит голосом — текст может содержать оговорки и шум.
Сегодня: ${today}.
Текущая неделя (пн–вс): ${weekDatesISO.join(', ')}.

Распознай команду и верни ТОЛЬКО валидный JSON без пояснений, без markdown:
{
  "action": "add" | "move" | "complete" | "delete" | "unknown",
  "title": "название задачи или пустая строка",
  "date": "YYYY-MM-DD или null",
  "targetDate": "YYYY-MM-DD или null",
  "category": "work|personal|health|rest|learning или null",
  "energy": 1|2|3 или null
}

Правила:
- action=add: добавить новую задачу. date — день задачи (если не сказан — сегодня).
- action=move: перенести существующую задачу. title — какую задачу, targetDate — куда.
- action=complete: отметить задачу выполненной. title — какую.
- action=delete: удалить задачу. title — какую.
- action=unknown: если команда непонятна.
- Категории: работа/рабочее=work, личное=personal, здоровье/спорт=health, отдых=rest, обучение/учёба=learning.
- Энергия: лёгкая/простая=1, средняя=2, тяжёлая/сложная=3.
- Дни: сегодня → ${today}, завтра → следующий день из недели, пн/вт/ср/чт/пт/сб/вс → соответствующая дата из текущей недели.
- Если день не назван — для add используй сегодня.
`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: 'user', content: text }]
    })
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = await response.json();
  const raw = data.content?.[0]?.text || '';

  try {
    const cmd = JSON.parse(raw);
    return { ...cmd, raw: text };
  } catch {
    return emptyVoiceCommand(text);
  }
}
