import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, collection, updateDoc,
  query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "../../assets/firebase-config.js";

// подхватывает уже инициализированное приложение, если тренажёр когда-нибудь
// откроют внутри iframe/встройки рядом с уже работающим кабинетом
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export function waitForAuth() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => { unsub(); resolve(user); });
  });
}

// создаёт запись в открытом каталоге тренажёров, если её там ещё нет —
// чтобы тренажёр появился в разделе «Тренажёры» у тьютора без ручной настройки
export async function ensureCatalogEntry(config) {
  try {
    const ref = doc(db, 'trainers', config.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        name: config.name,
        icon: config.icon,
        description: config.description,
        url: `trainers/${config.id}/index.html`,
        subjects: config.subjects,
        grades: config.grades,
        types: config.types,
        defaultPassThreshold: config.defaultPassThreshold,
        rewardRules: config.rewardRules,
        createdBy: 'system',
        createdAt: Date.now(),
      });
    }
  } catch (e) { console.error('ensureCatalogEntry failed', e); }
}

export async function loadProgress(tutorUid, studentId, trainerId) {
  const ref = doc(db, 'users', tutorUid, 'students', studentId, 'trainerProgress', trainerId);
  const snap = await getDoc(ref);
  if (snap.exists()) return { ref, data: snap.data() };
  const initial = {
    currentLevel: 1,
    levelState: { attemptsOnLevel: 0, unlockedColumns: [] },
    exclusiveUnlocked: false,
    exclusiveCompleted: false,
    bestScore: 0,
    bestComboEver: 0,
    totalAttempts: 0,
    lastPlayedAt: null,
  };
  await setDoc(ref, initial);
  return { ref, data: initial };
}

export async function saveProgress(ref, data) {
  await setDoc(ref, data, { merge: true });
}

export async function saveAttempt(tutorUid, studentId, trainerId, attempt) {
  const col = collection(db, 'users', tutorUid, 'students', studentId, 'trainerProgress', trainerId, 'attempts');
  const docRef = await addDoc(col, { ...attempt, finishedAt: Date.now() });
  return docRef.id;
}

export async function findPendingAssignments(tutorUid, studentId, trainerId) {
  const col = collection(db, 'users', tutorUid, 'students', studentId, 'trainerAssignments');
  const q = query(col, where('trainerId', '==', trainerId), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function markAssignmentDone(tutorUid, studentId, assignmentId, attemptId) {
  const ref = doc(db, 'users', tutorUid, 'students', studentId, 'trainerAssignments', assignmentId);
  await updateDoc(ref, { status: 'done', completedAt: Date.now(), linkedAttemptId: attemptId });
}

// награды выдаются один раз за всю историю — id награды детерминированный
// (trainerId_ruleId), поэтому просто проверяем существование перед записью
export async function awardBadgeIfNew(tutorUid, studentId, trainerId, ruleId, label, icon) {
  const badgeId = `${trainerId}_${ruleId}`;
  const ref = doc(db, 'users', tutorUid, 'students', studentId, 'badges', badgeId);
  const snap = await getDoc(ref);
  if (snap.exists()) return false;
  await setDoc(ref, { earnedAt: Date.now(), trainerId, ruleId, label, icon });
  return true;
}

// огонёк — отдельно на каждую пару (тьютор, предмет), не привязан к тренажёру
export async function updateStreaks(tutorUid, studentId, subjects) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  for (const subject of subjects) {
    const ref = doc(db, 'users', tutorUid, 'students', studentId, 'streaks', subject);
    const snap = await getDoc(ref);
    const prev = snap.exists() ? snap.data() : { currentStreak: 0, longestStreak: 0, lastActiveDate: null };
    if (prev.lastActiveDate === today) continue; // сегодняшний день уже учтён
    const currentStreak = prev.lastActiveDate === yesterday ? (prev.currentStreak || 0) + 1 : 1;
    const longestStreak = Math.max(prev.longestStreak || 0, currentStreak);
    await setDoc(ref, { currentStreak, longestStreak, lastActiveDate: today });
  }
}

// живое состояние во время урока — необязательное, ошибки молча игнорируем
export async function updateLive(tutorUid, studentId, trainerId, payload) {
  try {
    const ref = doc(db, 'users', tutorUid, 'students', studentId, 'trainerLive', trainerId);
    await setDoc(ref, { ...payload, updatedAt: Date.now() });
  } catch (e) { /* не критично для работы тренажёра */ }
}
