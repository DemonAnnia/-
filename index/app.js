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
    await runTransaction(db, async (tx) => {
      const linkSnap = await tx.get(linkRef);
      if (!linkSnap.exists() || linkSnap.data().claimed) {
        throw new Error('код недействителен или уже использован');
      }
      const { tutorUid, studentId } = linkSnap.data();
      tx.update(linkRef, { claimed: true, claimedBy: uid });
      tx.set(doc(db, 'studentAccess', uid), { isStudent: true }, { merge: true });
      tx.set(doc(db, 'studentAccess', uid, 'links', tutorUid), { studentId });
    });
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
      }).catch(() => {});
    });
  }
