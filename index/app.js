  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
  import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
    sendPasswordResetEmail
  } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
  import {
    getFirestore, doc, getDoc, setDoc, runTransaction, enableIndexedDbPersistence
  } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
  import { firebaseConfig } from "../assets/firebase-config.js";

  const fbApp = initializeApp(firebaseConfig);
  const auth = getAuth(fbApp);
  const db = getFirestore(fbApp);
  try { await enableIndexedDbPersistence(db); } catch (e) {}

  function showToast(message, type='error', duration=10000){
    let wrap = document.getElementById('toastWrap');
    if(!wrap){
      wrap = document.createElement('div');
      wrap.id = 'toastWrap';
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    wrap.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    const span = document.createElement('span');
    span.style.flex = '1';
    span.textContent = message;
    const close = document.createElement('span');
    close.style.opacity = '.6';
    close.textContent = '✕';
    el.appendChild(span); el.appendChild(close);
    el.onclick = () => el.classList.remove('show');
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  async function claimInviteCode(code, uid) {
    const linkRef = doc(db, 'studentLinks', code);
    let capturedTutorUid = null, capturedStudentId = null;
    await runTransaction(db, async (tx) => {
      const linkSnap = await tx.get(linkRef);
      if (!linkSnap.exists() || linkSnap.data().claimed) {
        throw new Error('код недействителен или уже использован');
      }
      const { tutorUid, studentId } = linkSnap.data();
      capturedTutorUid = tutorUid; capturedStudentId = studentId;
      tx.update(linkRef, { claimed: true, claimedBy: uid });
      tx.set(doc(db, 'studentAccess', uid), { isStudent: true }, { merge: true });
      tx.set(doc(db, 'studentAccess', uid, 'links', tutorUid), { studentId });
    });
    notifyNewStudent(capturedTutorUid, capturedStudentId);
  }

  async function notifyNewStudent(tutorUid, studentId) {
    try {
      const token = await auth.currentUser.getIdToken();
      await fetch('https://ct030786.tw1.ru/api/send-push.php', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'new_student', targetTutorUid: tutorUid, studentId }),
      });
    } catch (e) { console.error('push notify failed', e); }
  }

  async function goToRightPlace(user) {
    const accessSnap = await getDoc(doc(db, 'studentAccess', user.uid));
    window.location.replace(accessSnap.exists() ? 'app/student.html' : 'app/tutor.html');
  }

  function loginToEmail(login) {
    const trimmed = login.trim().toLowerCase();
    if (trimmed.includes('@')) return trimmed; // already a real email (e.g. Аня's existing account) — use as-is
    const clean = trimmed.replace(/[^a-z0-9._-]/g, '');
    return clean + '@kabinet-repetitora.local';
  }

  function friendlyAuthError(e){
    const map = {
      'auth/invalid-email': 'Проверь логин — кажется, там ошибка или он пустой.',
      'auth/invalid-credential': 'Неверный логин или пароль.',
      'auth/wrong-password': 'Неверный логин или пароль.',
      'auth/user-not-found': 'Неверный логин или пароль.',
      'auth/missing-password': 'Впиши пароль.',
      'auth/weak-password': 'Пароль слишком простой — сделай его длиннее.',
      'auth/email-already-in-use': 'Такой логин уже занят — выбери другой.',
      'auth/too-many-requests': 'Слишком много попыток — подожди немного и попробуй снова.',
      'auth/network-request-failed': 'Нет связи с интернетом — проверь подключение.',
      'auth/user-disabled': 'Этот вход отключён — обратись к преподавателю.',
    };
    return map[e && e.code] || 'Что-то пошло не так — попробуй ещё раз.';
  }

  window.doLogin = async function () {
    const email = loginToEmail(document.getElementById('loginEmail').value);
    const pass = document.getElementById('loginPassword').value;
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
      showToast(friendlyAuthError(e));
    }
  };

  window.doSignup = async function () {
    const rawLogin = document.getElementById('loginEmail').value.trim();
    const email = loginToEmail(rawLogin);
    const pass = document.getElementById('loginPassword').value;
    const code = document.getElementById('loginInviteCode').value.trim().toUpperCase();
    if (!rawLogin) { showToast('Впиши логин'); return; }
    if (pass.length < 6) { showToast('Пароль должен быть не короче 6 символов'); return; }
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (code) {
        try {
          await claimInviteCode(code, cred.user.uid);
        } catch (e) {
          showToast('Такого кода приглашения не существует или он уже использован — попроси у преподавателя актуальный.');
          return;
        }
      }
      await goToRightPlace(cred.user);
    } catch (e) {
      if (e.code === 'auth/invalid-email') {
        showToast('Логин может содержать только буквы, цифры, точку, дефис и подчёркивание.');
      } else {
        showToast(friendlyAuthError(e));
      }
    }
  };

  window.doForgotPassword = async function () {
    const raw = document.getElementById('loginEmail').value.trim();
    if (!raw.includes('@')) {
      showToast('Для короткого логина восстановление по почте недоступно — попроси преподавателя выдать новый код приглашения и завести новый вход.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, raw.toLowerCase());
      showToast('Письмо со ссылкой для смены пароля отправлено на ' + raw, 'success', 6000);
    } catch (e) {
      showToast(friendlyAuthError(e));
    }
  };

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await goToRightPlace(user);
    } else {
      document.getElementById('loadingScreen').style.display = 'none';
      document.getElementById('loginGate').style.display = 'flex';
    }
  });

  if ("serviceWorker" in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("../sw.js").then((reg) => {
        reg.update();
        setInterval(() => reg.update(), 60000);
        if (reg.waiting) showSwUpdateBanner(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showSwUpdateBanner(newWorker);
            }
          });
        });
      }).catch(() => {});
    });
  }
  function showSwUpdateBanner(worker){
    if (document.getElementById('swUpdateBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'swUpdateBanner';
    banner.style.cssText = 'position:fixed; bottom:0; left:0; right:0; background:#1F2A3D; color:#fff; padding:0.75rem 1rem; display:flex; align-items:center; gap:0.75rem; z-index:999; font-size:0.875rem; box-shadow:0 -2px 12px rgba(0,0,0,0.15);';
    banner.innerHTML = '<span style="flex:1;">Доступна новая версия приложения</span><button id="swUpdateBtn" style="background:#fff; color:#1F2A3D; border:none; border-radius:0.5rem; padding:0.375rem 0.75rem; font-weight:600; cursor:pointer;">Обновить</button>';
    document.body.appendChild(banner);
    document.getElementById('swUpdateBtn').onclick = () => {
      worker.postMessage({ type: 'SKIP_WAITING' });
    };
  }
