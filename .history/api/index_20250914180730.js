const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Конфигурация
const BOT_TOKEN = process.env.BOT_TOKEN;
const DATA_FILE = path.join(__dirname, 'vacations.json');

// Инициализация бота
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// Загрузка данных из JSON файла
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Ошибка загрузки данных:', error);
  }
  return { vacations: {} };
}

// Сохранение данных в JSON файл
function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Ошибка сохранения данныхz.:', error);
  }
}

// Проверка, является ли дата выходным днем
function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6; // Воскресенье или суббота
}

// Получение названия дня недели на русском
function getDayName(date) {
  const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  return days[date.getDay()];
}

// Форматирование даты
function formatDate(date) {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

// Парсинг даты из строки (формат DD.MM)
function parseDate(dateStr, year = new Date().getFullYear()) {
  const [day, month] = dateStr.split('.');
  return new Date(year, parseInt(month) - 1, parseInt(day));
}

// Парсинг диапазона дат
function parseDateRange(dateStr) {
  const dates = [];
  
  if (dateStr.includes(' по ')) {
    // Диапазон дат: "16.08 по 25.08"
    const [startStr, endStr] = dateStr.split(' по ');
    const startDate = parseDate(startStr.trim());
    const endDate = parseDate(endStr.trim());
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d));
    }
  } else {
    // Список дат: "16.08 17.08"
    const dateStrings = dateStr.trim().split(/\s+/);
    for (const dateString of dateStrings) {
      if (dateString.match(/^\d{1,2}\.\d{1,2}$/)) {
        dates.push(parseDate(dateString));
      }
    }
  }
  
  return dates;
}

// Проверка ограничений
function checkLimits(data, dates, userName) {
  const currentYear = new Date().getFullYear();
  const errors = [];
  
  for (const date of dates) {
    // Проверка года
    if (date.getFullYear() !== currentYear) {
      errors.push(`Выходные можно брать только в ${currentYear} году`);
      continue;
    }
    
    // Проверка диапазона (30 дней)
    const today = new Date();
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0 || diffDays > 30) {
      errors.push(`Выходные можно брать только в ближайшие 30 дней`);
      continue;
    }
    
    const dateStr = formatDate(date);
    const existingVacations = data.vacations[dateStr] || [];
    
    // Проверка лимитов
    const isWeekendDay = isWeekend(date);
    const maxAllowed = isWeekendDay ? 3 : 2;
    
    if (existingVacations.length >= maxAllowed) {
      const dayType = isWeekendDay ? 'выходные' : 'будни';
      errors.push(`${getDayName(date)} ${dateStr} — лимит в ${dayType} исчерпан (максимум ${maxAllowed} человек)`);
    }
  }
  
  return errors;
}

// Добавление выходных
function addVacations(data, dates, userName) {
  for (const date of dates) {
    const dateStr = formatDate(date);
    if (!data.vacations[dateStr]) {
      data.vacations[dateStr] = [];
    }
    
    if (!data.vacations[dateStr].includes(userName)) {
      data.vacations[dateStr].push(userName);
    }
  }
}

// Удаление выходных
function removeVacations(data, dates, userName) {
  for (const date of dates) {
    const dateStr = formatDate(date);
    if (data.vacations[dateStr]) {
      data.vacations[dateStr] = data.vacations[dateStr].filter(name => name !== userName);
      if (data.vacations[dateStr].length === 0) {
        delete data.vacations[dateStr];
      }
    }
  }
}

// Форматирование календаря выходных
function formatVacationCalendar(data) {
  const today = new Date();
  const calendar = [];
  
  // Генерируем 30 дней вперед
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    
    const dateStr = formatDate(date);
    const dayName = getDayName(date);
    const vacations = data.vacations[dateStr] || [];
    
    const isWeekendDay = isWeekend(date);
    const maxAllowed = isWeekendDay ? 3 : 2;
    const isOverLimit = vacations.length > maxAllowed;
    
    const status = isOverLimit ? '❌' : '✅';
    const names = vacations.length > 0 ? vacations.join(', ') : 'Никто';
    
    calendar.push(`${dayName} ${dateStr} — ${names} ${status}`);
  }
  
  return `📅 Текущие выходные:\n${calendar.join('\n')}`;
}

// Обработка команд
function processCommand(message) {
  const text = message.text.toLowerCase().trim();
  const userName = message.from.first_name;
  const chatId = message.chat.id;
  
  // Обработка команды /start
  if (text === '/start') {
    return 'Привет! Я бот для управления выходными. Доступные команды:\n' +
           '/календарь - показать календарь выходных\n' +
           'выходной DD.MM.YYYY Имя - добавить выходной\n' +
           'отмена DD.MM.YYYY Имя - отменить выходной\n' +
           'отмена всех выходных Имя - отменить все выходные';
  }

  // Проверка, что это групповой чат (кроме команды /start)
  if (message.chat.type !== 'group' && message.chat.type !== 'supergroup') {
    return 'Бот работает только в групповых чатах';
  }
  
  const data = loadData();
  
  // Команда показа календаря
  if (text === '/календарь' || text === '/calendar' || text === 'календарь') {
    return formatVacationCalendar(data);
  }
  
  // Удаление всех выходных
  if (text.includes('отмена всех выходных')) {
    const nameMatch = text.match(/отмена всех выходных\s+(.+)/);
    if (nameMatch) {
      const targetName = nameMatch[1].trim();
      const allDates = Object.keys(data.vacations);
      const datesToRemove = allDates.map(dateStr => {
        const [day, month, year] = dateStr.split('.');
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      });
      
      removeVacations(data, datesToRemove, targetName);
      saveData(data);
      return `Удалены все выходные для ${targetName}`;
    }
  }
  
  // Удаление выходных
  if (text.includes('отмена')) {
    const nameMatch = text.match(/отмена\s+(?:выходных\s+)?(.+)/);
    if (nameMatch) {
      const rest = nameMatch[1].trim();
      const nameMatch2 = rest.match(/(.+?)\s+(.+)$/);
      if (nameMatch2) {
        const dateStr = nameMatch2[1].trim();
        const targetName = nameMatch2[2].trim();
        
        const dates = parseDateRange(dateStr);
        if (dates.length > 0) {
          removeVacations(data, dates, targetName);
          saveData(data);
          return `Удалены выходные для ${targetName}`;
        }
      }
    }
  }
  
  // Добавление выходных
  const nameMatch = text.match(/(?:выходной\s+)?(.+?)\s+(.+)$/);
  if (nameMatch) {
    const dateStr = nameMatch[1].trim();
    const targetName = nameMatch[2].trim();
    
    // Проверяем, что это не команда удаления
    if (!dateStr.includes('отмена')) {
      const dates = parseDateRange(dateStr);
      if (dates.length > 0) {
        // Проверяем ограничения
        const errors = checkLimits(data, dates, targetName);
        if (errors.length > 0) {
          return errors.join('\n');
        }
        
        addVacations(data, dates, targetName);
        saveData(data);
        return `Добавлены выходные для ${targetName}`;
      }
    }
  }
  
  return 'Неизвестная команда. Используйте /календарь для просмотра выходных.';
}

// Обработка webhook
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const update = req.body;
      
      if (update.message) {
        const response = processCommand(update.message);
        
        await bot.sendMessage(update.message.chat.id, response);
      }
      
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Ошибка обработки сообщения:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  } else {
    res.status(200).json({ message: 'Ozon Bot is running!' });
  }
};
