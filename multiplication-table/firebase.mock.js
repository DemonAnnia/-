// Локальная заглушка, повторяющая интерфейс firebase.js — но без единого
// обращения к настоящему Firebase. Используется автоматически, когда рядом
// нет остального проекта (в частности, ../../assets/firebase-config.js),
// то есть при открытии тренажёра отдельно, без основного репозитория.
// Прогресс, попытки, награды и огонёк никуда не сохраняются — только
// держатся в памяти вкладки, чтобы можно было пройти все экраны и увидеть,
// как всё работает.

console.info('[Тренажёр] Firebase не найден рядом — работаю в локальном тестовом режиме, без сохранения.');

export const auth = null;
export const db = null;

export function waitForAuth() {
  return Promise.resolve({ uid: 'local-test-user' });
}

export async function ensureCatalogEntry() { /* нет каталога в тестовом режиме */ }

export async function loadProgress() {
  const initial = {
    currentLevel: 1,
    levelState: { attemptsOnLevel: 0, unlockedColumns: [] },
    exclusiveUnlocked: false,
    exclusiveCompleted: false,
    bestScore: 0,
    totalAttempts: 0,
    lastPlayedAt: null,
  };
  return { ref: null, data: initial };
}

export async function saveProgress() { /* нет сохранения в тестовом режиме */ }

export async function saveAttempt(tutorUid, studentId, trainerId, attempt) {
  console.info('[Тренажёр · тест] попытка завершена:', attempt);
  return 'local-test-attempt';
}

export async function findPendingAssignments() { return []; }
export async function markAssignmentDone() { /* нет назначений в тестовом режиме */ }

export async function awardBadgeIfNew(tutorUid, studentId, trainerId, ruleId, label, icon) {
  console.info('[Тренажёр · тест] награда получена:', label);
  return true; // в тестовом режиме награды показываются каждый раз, без дедупликации
}

export async function updateStreaks() { /* нет огонька в тестовом режиме */ }
export async function updateLive() { /* нет живого просмотра в тестовом режиме */ }
