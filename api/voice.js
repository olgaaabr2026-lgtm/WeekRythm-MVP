export default async function handler(req, res) {
  // Только POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, weekDatesISO, today } = req.body;

  // Валидация входных данных
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid text' });
  }
  if (!Array.isArray(weekDatesISO) || weekDatesISO.length === 0) {
    return res.status(400).json({ error: 'Missing or invalid weekDatesISO' });
  }

  // Ключ хранится только на сервере.
  const API_KEY = process.env.ANTHROPIC_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const todayDate = today || weekDatesISO[0];

  const systemPrompt = `
Ты помощник планировщика задач WeekRythm. Пользователь говорит голосом — текст может содержать оговорки и шум.
Сегодня: ${todayDate}.
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
- action=move: перенести существующую задачу. title — какую, targetDate — куда.
- action=complete: отметить задачу выполненной. title — какую.
- action=delete: удалить задачу. title — какую.
- action=unknown: если команда непонятна.
- Категории: работа/рабочее=work, личное=personal, здоровье/спорт=health, отдых=rest, обучение/учёба=learning.
- Энергия: лёгкая/простая=1, средняя=2, тяжёлая/сложная=3.
- Дни: сегодня → ${todayDate}, завтра → следующий день из недели, пн/вт/ср/чт/пт/сб/вс → соответствующая дата из текущей недели.
- Если день не назван — для add используй сегодня.
`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
        // Запрос выполняется серверной функцией.
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: 'user', content: text }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: `Anthropic API error: ${response.status}`, detail: err });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';

    try {
      const cmd = JSON.parse(raw);
      return res.status(200).json({ ...cmd, raw: text });
    } catch {
      return res.status(200).json({
        action: 'unknown', title: '', date: null,
        targetDate: null, category: null, energy: null, raw: text
      });
    }

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
