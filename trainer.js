// api подключается динамически в main() — так тренажёр сам понимает,
// есть ли рядом остальной проект (assets/firebase-config.js), и если нет —
// переходит на локальную заглушку без единого обращения к Firebase
let api;

const TRAINER_ID = 'multiplication-table';
const COLUMN_RANGE = [2, 3, 4, 5, 6, 7, 8, 9];
const V_TIMER_MULTIPLIER = 3; // вопросам типа В (клик по сетке) даём больше времени на осмотр

const TRAINER_CONFIG = {
  id: TRAINER_ID,
  name: 'Таблица умножения',
  icon: '✖️',
  description: 'Пять уровней от знакомства со всей таблицей 2–9 до автоматизма, плюс финальное испытание на поиск всех пар множителей.',
  subjects: ['Математика'],
  grades: ['2 класс', '3 класс', '4 класс'],
  types: ['Школьная программа'],
  defaultPassThreshold: 80,
  rewardRules: [
    { id: 'started_table', label: 'Освоил таблицу', icon: '🌱', condition: { type: 'milestone', event: 'level1_complete' } },
    { id: 'speed_level2', label: 'Набрал скорость', icon: '⚡', condition: { type: 'perfect', level: 2 } },
    { id: 'found_pairs', label: 'Нашёл все пары', icon: '🕵️', condition: { type: 'milestone', event: 'first_perfect_V' } },
    { id: 'lightning_level5', label: 'Молния', icon: '🎯', condition: { type: 'perfect', level: 5 } },
    { id: 'champion_final', label: 'Абсолютный чемпион', icon: '👑', condition: { type: 'milestone', event: 'exclusive_complete' } },
    { id: 'no_fails_combo', label: 'Без сбоев', icon: '🔗', condition: { type: 'combo', threshold: 10 } },
  ],
};

// портция столбцов, добавляемая за одну попытку внутри уровня —
// когда набирается 8 (весь диапазон 2-9), дальше всегда полный диапазон
const LEVELS = [
  { level: 1, portion: 3, minAttempts: 3, questionCount: 10, timerPerQ: 15, types: ['A', 'B'] },
  { level: 2, portion: 4, minAttempts: 3, questionCount: 12, timerPerQ: 10, types: ['A', 'B'] },
  { level: 3, portion: 7, minAttempts: 3, questionCount: 15, timerPerQ: 10, types: ['A', 'B', 'V'] },
  { level: 4, portion: 8, minAttempts: 3, questionCount: 17, timerPerQ: 7, types: ['A', 'B', 'V'] },
  { level: 5, portion: 8, minAttempts: 3, questionCount: 20, timerPerQ: 5, types: ['A', 'B', 'V'] },
];

const root = document.getElementById('root');
const loadingScreen = document.getElementById('loadingScreen');

let ctx = null;     // { tutorUid, studentId, canSave, passThreshold, progress:{ref,data} }
let session = null; // текущая попытка

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

// ---------- генерация вопросов ----------

function buildChoices(answer) {
  const set = new Set([answer]);
  let guard = 0;
  while (set.size < 4 && guard < 50) {
    guard++;
    const delta = Math.floor(Math.random() * 12) - 6;
    const candidate = answer + delta;
    if (candidate > 0 && candidate <= 81 && !set.has(candidate)) set.add(candidate);
  }
  return shuffle([...set]).map(String);
}

function makeQuestion(levelCfg, col) {
  const type = levelCfg.types[Math.floor(Math.random() * levelCfg.types.length)];
  const m = COLUMN_RANGE[Math.floor(Math.random() * COLUMN_RANGE.length)];

  if (type === 'A') {
    const answer = col * m;
    const mode = levelCfg.level >= 5 ? 'input' : (Math.random() < 0.5 ? 'input' : 'choice');
    return {
      type: 'A', text: `${col} × ${m}`, answer: String(answer), mode,
      choices: mode === 'choice' ? buildChoices(answer) : null,
      timer: levelCfg.timerPerQ,
    };
  }
  if (type === 'B') {
    const product = col * m;
    const hideFirst = Math.random() < 0.5;
    const text = hideFirst ? `? × ${m} = ${product}` : `${col} × ? = ${product}`;
    const answer = hideFirst ? col : m;
    const mode = levelCfg.level >= 5 ? 'input' : (Math.random() < 0.5 ? 'input' : 'choice');
    return {
      type: 'B', text, answer: String(answer), mode,
      choices: mode === 'choice' ? buildChoices(answer) : null,
      timer: levelCfg.timerPerQ,
    };
  }
  // type V — дан результат, нужно отметить все пары множителей на сетке
  const product = col * m;
  const correctPairs = [];
  for (const a of COLUMN_RANGE) for (const b of COLUMN_RANGE) if (a * b === product) correctPairs.push(`${a}x${b}`);
  return { type: 'V', text: String(product), answer: correctPairs, timer: levelCfg.timerPerQ * V_TIMER_MULTIPLIER };
}

function generateQuestions(levelCfg, unlockedColumns) {
  const count = levelCfg.questionCount;
  const qs = [];
  // гарантируем: хотя бы один вопрос на каждый открытый столбец
  for (const col of shuffle(unlockedColumns)) {
    if (qs.length >= count) break;
    qs.push(makeQuestion(levelCfg, col));
  }
  while (qs.length < count) {
    const col = unlockedColumns[Math.floor(Math.random() * unlockedColumns.length)];
    qs.push(makeQuestion(levelCfg, col));
  }
  return shuffle(qs).slice(0, count);
}

function generateExclusiveQuestions() {
  // финальный вызов: только тип В, весь диапазон, без подмешивания
  const qs = [];
  for (const col of shuffle(COLUMN_RANGE)) {
    const m = COLUMN_RANGE[Math.floor(Math.random() * COLUMN_RANGE.length)];
    const product = col * m;
    const correctPairs = [];
    for (const a of COLUMN_RANGE) for (const b of COLUMN_RANGE) if (a * b === product) correctPairs.push(`${a}x${b}`);
    qs.push({ type: 'V', text: String(product), answer: correctPairs });
  }
  return qs;
}

// ---------- главный экран (карта уровней) ----------

function levelStatusLabel(cfg, progress) {
  if (progress.currentLevel > cfg.level) return 'пройден';
  if (progress.currentLevel < cfg.level) return 'закрыт';
  const covered = progress.levelState.unlockedColumns.length;
  return `открыт · столбцов освоено ${covered}/8 · попыток ${progress.levelState.attemptsOnLevel}/${cfg.minAttempts}`;
}

function renderHome() {
  const progress = ctx.progress.data;
  const rows = LEVELS.map((cfg) => {
    const locked = cfg.level > progress.currentLevel;
    const current = cfg.level === progress.currentLevel;
    return `
      <div class="level-row ${locked ? 'locked' : ''} ${current ? 'current' : ''}" data-level="${cfg.level}">
        <div class="level-num">${cfg.level}</div>
        <div class="level-info">
          <div class="level-title">Уровень ${cfg.level}</div>
          <div class="level-meta">${locked ? 'закрыт' : levelStatusLabel(cfg, progress)}</div>
        </div>
      </div>`;
  }).join('');

  const exclusiveLocked = !progress.exclusiveUnlocked;
  const exclusiveRow = `
    <div class="level-row exclusive-row ${exclusiveLocked ? 'locked' : ''}" data-level="exclusive">
      <div class="level-num">★</div>
      <div class="level-info">
        <div class="level-title">Финальный вызов</div>
        <div class="level-meta">${exclusiveLocked ? 'откроется после уровня 5' : (progress.exclusiveCompleted ? 'пройден идеально 👑' : 'доступен')}</div>
      </div>
    </div>`;

  root.innerHTML = `
    <h1>✖️ Таблица умножения</h1>
    <div class="sub">Пять уровней и финальный вызов на поиск всех пар.</div>
    ${ctx.isLocalTest ? `<div class="banner">🧪 Локальный тест: Firebase не подключён, ничего не сохраняется — можно свободно проверять механику.</div>` : (!ctx.canSave ? `<div class="banner">Демо-режим: прогресс и награды не сохраняются.</div>` : '')}
    <div class="levels">${rows}${exclusiveRow}</div>
  `;

  root.querySelectorAll('.level-row:not(.locked)').forEach((el) => {
    el.addEventListener('click', () => {
      const lv = el.dataset.level;
      if (lv === 'exclusive') startExclusive();
      else startLevel(Number(lv));
    });
  });
}

// ---------- прохождение попытки ----------

function startLevel(levelNum) {
  const levelCfg = LEVELS[levelNum - 1];
  const progress = ctx.progress.data;
  const already = progress.levelState.unlockedColumns;
  const remaining = COLUMN_RANGE.filter((c) => !already.includes(c));
  const take = Math.min(levelCfg.portion, remaining.length);
  const newlyUnlocked = shuffle(remaining).slice(0, take);
  const unlockedForThisAttempt = [...already, ...newlyUnlocked];

  session = {
    mode: 'level', levelCfg, unlockedForThisAttempt, newlyUnlocked,
    questions: generateQuestions(levelCfg, unlockedForThisAttempt),
    index: 0, correct: 0, combo: 0, maxCombo: 0, answers: [], timerHandle: null,
  };
  renderQuestion();
}

function startExclusive() {
  session = {
    mode: 'exclusive', levelCfg: null,
    questions: generateExclusiveQuestions(),
    index: 0, correct: 0, combo: 0, maxCombo: 0, answers: [], timerHandle: null,
  };
  renderQuestion();
}

function currentQuestion() { return session.questions[session.index]; }

function renderQuestion() {
  clearTimeout(session.timerHandle);
  const q = currentQuestion();
  const progressLine = `<div class="progress-count">Вопрос ${session.index + 1} из ${session.questions.length}</div>`;
  const timerBar = q.timer ? `<div class="timerbar-wrap"><div class="timerbar" id="timerbar" style="width:100%"></div></div>` : '';

  let body = '';
  if (q.type === 'A' || q.type === 'B') {
    body = `<div class="question-box"><div class="question-text">${esc(q.text)}</div>`;
    if (q.mode === 'input') {
      body += `
        <input id="answerInput" class="answer-input" type="number" inputmode="numeric" placeholder="?" autofocus>
        <button class="btn btn-primary" id="submitBtn">Ответить</button>`;
    } else {
      body += `<div class="choices">${q.choices.map((c) => `<button class="choice-btn" data-val="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
    }
    body += `</div>`;
  } else {
    // тип В — сетка
    body = `<div class="question-box"><div class="sub">Где встречается число</div><div class="question-text">${esc(q.text)}</div></div>`;
    body += renderGrid();
    body += `<button class="btn btn-primary" id="submitGridBtn">Готово</button>`;
  }

  root.innerHTML = `${progressLine}${timerBar}<div class="card">${body}</div><div class="combo-pill" id="comboPill"></div>`;
  updateComboPill();

  if (q.type === 'A' || q.type === 'B') {
    if (q.mode === 'input') {
      const input = document.getElementById('answerInput');
      document.getElementById('submitBtn').addEventListener('click', () => submitAnswer(input.value.trim()));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAnswer(input.value.trim()); });
    } else {
      root.querySelectorAll('.choice-btn').forEach((btn) => {
        btn.addEventListener('click', () => submitAnswer(btn.dataset.val));
      });
    }
  } else {
    document.getElementById('submitGridBtn').addEventListener('click', () => submitGridAnswer());
  }

  if (q.timer) startTimer(q.timer);
}

function renderGrid() {
  let html = `<div class="grid-wrap"><table class="mult-grid" id="multGrid"><thead><tr><th></th>${COLUMN_RANGE.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>`;
  for (const row of COLUMN_RANGE) {
    html += `<tr><th>${row}</th>`;
    for (const col of COLUMN_RANGE) {
      html += `<td data-cell="${row}x${col}"></td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table></div>`;
  return html;
}

let gridPicked = new Set();
function attachGridHandlers() {
  gridPicked = new Set();
  document.querySelectorAll('#multGrid td[data-cell]').forEach((td) => {
    td.addEventListener('click', () => {
      const key = td.dataset.cell;
      if (gridPicked.has(key)) { gridPicked.delete(key); td.classList.remove('picked'); }
      else { gridPicked.add(key); td.classList.add('picked'); }
    });
  });
}

function startTimer(seconds) {
  let remaining = seconds * 10;
  const total = remaining;
  const bar = document.getElementById('timerbar');
  session.timerHandle = setInterval(() => {
    remaining -= 1;
    if (bar) {
      const pct = Math.max(0, (remaining / total) * 100);
      bar.style.width = pct + '%';
      bar.classList.toggle('warn', pct < 50);
      bar.classList.toggle('danger', pct < 20);
    }
    if (remaining <= 0) {
      clearInterval(session.timerHandle);
      if (currentQuestion().type === 'V') submitGridAnswer(true);
      else submitAnswer(null, true);
    }
  }, 100);
}

// нужно вызвать attachGridHandlers сразу после вставки разметки сетки
const _origRenderQuestion = renderQuestion;
renderQuestion = function () {
  _origRenderQuestion();
  if (currentQuestion().type === 'V') attachGridHandlers();
};

function updateComboPill() {
  const pill = document.getElementById('comboPill');
  if (!pill) return;
  if (session.combo >= 3) { pill.textContent = `🔥 серия: ${session.combo}`; pill.classList.add('show'); }
  else pill.classList.remove('show');
}

function submitAnswer(value, timedOut = false) {
  clearInterval(session.timerHandle);
  const q = currentQuestion();
  const isCorrect = !timedOut && value !== null && String(value) === String(q.answer);
  registerAnswer(q, value, isCorrect);
}

function submitGridAnswer(timedOut = false) {
  clearInterval(session.timerHandle);
  const q = currentQuestion();
  const picked = [...gridPicked];
  const correctSet = new Set(q.answer);
  const pickedSet = new Set(picked);
  const isCorrect = !timedOut && correctSet.size === pickedSet.size && [...correctSet].every((k) => pickedSet.has(k));
  // подсветка перед переходом дальше
  document.querySelectorAll('#multGrid td[data-cell]').forEach((td) => {
    const key = td.dataset.cell;
    if (correctSet.has(key) && pickedSet.has(key)) td.classList.add('correct');
    else if (!correctSet.has(key) && pickedSet.has(key)) td.classList.add('wrong-pick');
    else if (correctSet.has(key) && !pickedSet.has(key)) td.classList.add('missed');
  });
  registerAnswer(q, picked, isCorrect, 400);
}

function registerAnswer(q, studentAnswer, isCorrect, delay = 150) {
  session.answers.push({ type: q.type, question: q.text, studentAnswer, correctAnswer: q.answer, correct: isCorrect });
  if (isCorrect) { session.correct += 1; session.combo += 1; session.maxCombo = Math.max(session.maxCombo, session.combo); }
  else { session.combo = 0; }
  session.index += 1;
  setTimeout(() => {
    if (session.index < session.questions.length) renderQuestion();
    else finishAttempt();
  }, delay);
}

// ---------- завершение попытки ----------

async function finishAttempt() {
  const scorePercent = Math.round((session.correct / session.questions.length) * 100);
  root.innerHTML = `<div class="card"><div class="question-box">Считаю результат…</div></div>`;

  const attempt = {
    startedAt: Date.now(), score: scorePercent, totalQuestions: session.questions.length,
    correctAnswers: session.correct, maxCombo: session.maxCombo,
    level: session.mode === 'level' ? session.levelCfg.level : 'exclusive',
    mode: session.mode, answers: session.answers,
  };

  let attemptId = null;
  if (ctx.canSave) attemptId = await api.saveAttempt(ctx.tutorUid, ctx.studentId, TRAINER_ID, attempt);

  const progress = ctx.progress.data;
  progress.totalAttempts = (progress.totalAttempts || 0) + 1;
  progress.bestScore = Math.max(progress.bestScore || 0, scorePercent);
  progress.bestComboEver = Math.max(progress.bestComboEver || 0, session.maxCombo);
  progress.lastPlayedAt = Date.now();

  let leveledUp = false;
  if (session.mode === 'level') {
    progress.levelState.unlockedColumns = session.unlockedForThisAttempt;
    progress.levelState.attemptsOnLevel += 1;
    const allCovered = progress.levelState.unlockedColumns.length >= 8;
    if (allCovered && progress.levelState.attemptsOnLevel >= session.levelCfg.minAttempts && scorePercent >= ctx.passThreshold) {
      if (progress.currentLevel < 5) {
        progress.currentLevel += 1;
        progress.levelState = { attemptsOnLevel: 0, unlockedColumns: [] };
        leveledUp = true;
      } else {
        progress.exclusiveUnlocked = true;
      }
    }
  } else if (session.mode === 'exclusive') {
    if (scorePercent === 100) progress.exclusiveCompleted = true;
  }

  if (ctx.canSave) await api.saveProgress(ctx.progress.ref, progress);

  const earnedBadges = ctx.canSave ? await checkBadges(scorePercent, session, progress) : [];
  if (ctx.canSave) {
    await checkAssignments(scorePercent, attemptId);
    await api.updateStreaks(ctx.tutorUid, ctx.studentId, TRAINER_CONFIG.subjects);
  }

  renderSummary(scorePercent, leveledUp, earnedBadges, progress);
}

async function checkBadges(scorePercent, sess, progress) {
  const earned = [];
  const check = async (ruleId, label, icon) => {
    const got = await api.awardBadgeIfNew(ctx.tutorUid, ctx.studentId, TRAINER_ID, ruleId, label, icon);
    if (got) earned.push({ label, icon });
  };
  if (sess.mode === 'level') {
    if (sess.levelCfg.level === 1 && progress.currentLevel > 1) await check('started_table', 'Освоил таблицу', '🌱');
    if (sess.levelCfg.level === 2 && scorePercent === 100) await check('speed_level2', 'Набрал скорость', '⚡');
    if (sess.levelCfg.level === 5 && scorePercent === 100) await check('lightning_level5', 'Молния', '🎯');
    if (sess.answers.some((a) => a.type === 'V' && a.correct)) await check('found_pairs', 'Нашёл все пары', '🕵️');
  } else if (sess.mode === 'exclusive' && scorePercent === 100) {
    await check('champion_final', 'Абсолютный чемпион', '👑');
  }
  if (sess.maxCombo >= 10) await check('no_fails_combo', 'Без сбоев', '🔗');
  return earned;
}

async function checkAssignments(scorePercent, attemptId) {
  const pending = await api.findPendingAssignments(ctx.tutorUid, ctx.studentId, TRAINER_ID);
  for (const a of pending) {
    const threshold = a.passThreshold || TRAINER_CONFIG.defaultPassThreshold;
    if (scorePercent >= threshold) await api.markAssignmentDone(ctx.tutorUid, ctx.studentId, a.id, attemptId);
  }
}

function renderSummary(scorePercent, leveledUp, earnedBadges, progress) {
  const badgesHtml = earnedBadges.map((b) => `<div class="badge-earned"><span class="icon">${b.icon}</span><span>Новая награда: ${esc(b.label)}</span></div>`).join('');
  root.innerHTML = `
    <div class="card">
      <div class="summary-score">${scorePercent}%</div>
      <div class="summary-sub">${session.correct} из ${session.questions.length} верно</div>
      ${leveledUp ? `<div class="banner">🎉 Открыт следующий уровень!</div>` : ''}
      ${progress.exclusiveUnlocked && !progress.exclusiveCompleted && session.mode === 'level' && leveledUp === false && progress.currentLevel === 5 ? `<div class="banner">⭐ Открыт финальный вызов!</div>` : ''}
      ${badgesHtml}
      <button class="btn btn-primary" id="backBtn">К уровням</button>
    </div>
  `;
  document.getElementById('backBtn').addEventListener('click', renderHome);
}

// ---------- запуск ----------

async function main() {
  const params = new URLSearchParams(location.search);
  const forceTest = params.get('test') === '1';

  let isLocalTest = false;
  if (forceTest) {
    api = await import('./firebase.mock.js');
    isLocalTest = true;
  } else {
    try {
      api = await import('./firebase.js');
    } catch (e) {
      api = await import('./firebase.mock.js');
      isLocalTest = true;
    }
  }

  const tutorUid = params.get('tutorUid');
  const studentId = params.get('studentId');

  const user = await api.waitForAuth();
  if (!user) { location.replace('../../index.html'); return; }

  await api.ensureCatalogEntry(TRAINER_CONFIG);

  const canSave = !!(tutorUid && studentId) && !isLocalTest;
  ctx = { tutorUid, studentId, canSave, isLocalTest, passThreshold: TRAINER_CONFIG.defaultPassThreshold };

  if (canSave) {
    ctx.progress = await api.loadProgress(tutorUid, studentId, TRAINER_ID);
    const pending = await api.findPendingAssignments(tutorUid, studentId, TRAINER_ID);
    if (pending[0] && pending[0].passThreshold) ctx.passThreshold = pending[0].passThreshold;
  } else {
    ctx.progress = {
      ref: null,
      data: { currentLevel: 1, levelState: { attemptsOnLevel: 0, unlockedColumns: [] }, exclusiveUnlocked: false, exclusiveCompleted: false, bestScore: 0, totalAttempts: 0, lastPlayedAt: null },
    };
  }

  loadingScreen.style.display = 'none';
  root.style.display = 'block';
  renderHome();
}

main();
