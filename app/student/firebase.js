  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
  import {
    getAuth, onAuthStateChanged, signOut,
    EmailAuthProvider, reauthenticateWithCredential, updatePassword
  } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
  import {
    getFirestore, doc, getDoc, getDocs, setDoc, onSnapshot, collection, query, where, runTransaction
  } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
  import { firebaseConfig } from "../../assets/firebase-config.js";

  const fbApp = initializeApp(firebaseConfig);
  const auth = getAuth(fbApp);
  const db = getFirestore(fbApp);

  window.doLogout = async function () { await signOut(auth); window.location.replace('../index.html'); };

  function friendlyAuthError(e){
    const map = {
      'auth/invalid-credential': 'Неверный текущий пароль.',
      'auth/wrong-password': 'Неверный текущий пароль.',
      'auth/weak-password': 'Новый пароль слишком простой — сделай его длиннее.',
      'auth/too-many-requests': 'Слишком много попыток — подожди немного и попробуй снова.',
      'auth/network-request-failed': 'Нет связи с интернетом — проверь подключение.',
    };
    return map[e && e.code] || 'Что-то пошло не так — попробуй ещё раз.';
  }

  window.changePassword = async function () {
    const curPass = document.getElementById('accCurPass').value;
    const newPass = document.getElementById('accNewPass').value;
    if (!curPass || !newPass) { showToast('Заполни текущий и новый пароль'); return; }
    if (newPass.length < 6) { showToast('Новый пароль слишком короткий (мин. 6 символов)'); return; }
    try {
      const cred = EmailAuthProvider.credential(auth.currentUser.email, curPass);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, newPass);
      showToast('Пароль обновлён!', 'success', 4000);
      document.getElementById('accNewPass').value = '';
      document.getElementById('accCurPass').value = '';
    } catch (e) {
      showToast(friendlyAuthError(e));
    }
  };

  function migrateStudent(s){
    if(!Array.isArray(s.messengers)){ s.messengers = s.messenger ? [{id:'m1', label:'', url:s.messenger}] : []; }
    delete s.messenger;
    return s;
  }

  let unsubActive = []; // holds unsubscribe fns for the currently subscribed tutor's data
  function subscribeToTutor(tutorUid, studentId){
    unsubActive.forEach(fn => { try{ fn(); }catch(e){} });
    unsubActive = [];

    const studentRef = doc(db, 'users', tutorUid, 'students', studentId);
    const themeRef = doc(db, 'users', tutorUid, 'students', studentId, 'prefs', 'theme');
    const profileRef = doc(db, 'users', tutorUid, 'appdata', 'profile');
    let studentData = null;
    let materialsAll = [], materialsMine = [];
    let tutorProfile = null;

    window.__fbSetTheme = async function (themeId) {
      try { await setDoc(themeRef, { theme: themeId }); }
      catch (e) { console.error('save theme failed', e); }
    };

    function renderMerged(){
      const byId = {};
      [...materialsAll, ...materialsMine].forEach(m => { byId[m.id] = m; });
      renderStudentView(studentData, Object.values(byId), tutorProfile);
    }

    unsubActive.push(onSnapshot(studentRef, (snap) => {
      studentData = snap.exists() ? migrateStudent(snap.data()) : null;
      renderMerged();
    }, () => renderStudentView(null, [])));

    unsubActive.push(onSnapshot(themeRef, (snap) => {
      currentTheme = snap.exists() ? (snap.data().theme || 'classic') : 'classic';
      applyTheme();
      const picker = document.getElementById('themePicker');
      if (picker) picker.innerHTML = themePickerHTML();
    }, () => {}));

    unsubActive.push(onSnapshot(profileRef, (snap) => {
      tutorProfile = snap.exists() ? snap.data() : null;
      renderMerged();
    }, (err) => console.error('profile sync error', err)));

    const materialsCol = collection(db, 'users', tutorUid, 'materials');
    unsubActive.push(onSnapshot(query(materialsCol, where('visibleToAll', '==', true)), (snap) => {
      materialsAll = snap.docs.map(d => d.data());
      renderMerged();
    }, (err) => console.error('materials(all) sync error', err)));
    unsubActive.push(onSnapshot(query(materialsCol, where('studentIds', 'array-contains', studentId)), (snap) => {
      materialsMine = snap.docs.map(d => d.data());
      renderMerged();
    }, (err) => console.error('materials(mine) sync error', err)));
  }

  window.__fbSwitchTutor = function (link) {
    subscribeToTutor(link.tutorUid, link.studentId);
  };

  window.__fbAddTutorByCode = async function (code) {
    const linkRef = doc(db, 'studentLinks', code);
    const myUid = auth.currentUser.uid;
    await runTransaction(db, async (tx) => {
      const linkSnap = await tx.get(linkRef);
      if (!linkSnap.exists() || linkSnap.data().claimed) {
        throw new Error('Такого кода не существует или он уже использован');
      }
      const { tutorUid, studentId } = linkSnap.data();
      tx.update(linkRef, { claimed: true, claimedBy: myUid });
      tx.set(doc(db, 'studentAccess', myUid), { isStudent: true }, { merge: true });
      tx.set(doc(db, 'studentAccess', myUid, 'links', tutorUid), { studentId });
    });
    await loadAllTutorLinks(myUid);
  };

  async function loadAllTutorLinks(uid){
    const linksSnap = await getDocs(collection(db, 'studentAccess', uid, 'links'));
    const expanded = [];
    for (const d of linksSnap.docs) {
      const tutorUid = d.id;
      const { studentId } = d.data();
      let tutorName = null;
      try {
        const p = await getDoc(doc(db, 'users', tutorUid, 'appdata', 'profile'));
        if (p.exists()) tutorName = p.data().name;
      } catch (e) {}
      const shortName = tutorName ? (tutorName.split(' ')[1] || tutorName) : null;

      let subjects = [];
      try {
        const sSnap = await getDoc(doc(db, 'users', tutorUid, 'students', studentId));
        if (sSnap.exists()) {
          const subs = (sSnap.data().subjects || []).map(x => x.subject).filter(Boolean);
          subjects = [...new Set(subs)];
        }
      } catch (e) {}

      if (subjects.length > 1) {
        subjects.forEach(subj => {
          expanded.push({ tutorUid, studentId, tutorName: shortName, subjectFilter: subj,
            label: `${shortName || 'репетитора'} · ${subj}` });
        });
      } else {
        expanded.push({ tutorUid, studentId, tutorName: shortName, subjectFilter: null,
          label: shortName || 'репетитора' });
      }
    }
    allTutorLinks = expanded;
    return expanded;
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.replace('../index.html'); return; }

    const accessSnap = await getDoc(doc(db, 'studentAccess', user.uid));
    if (!accessSnap.exists()) { window.location.replace('tutor.html'); return; }

    const links = await loadAllTutorLinks(user.uid);
    if (links.length === 0) { renderStudentView(null, []); return; }

    activeLinkIndex = 0;
    activeSubjectFilter = links[0].subjectFilter;
    subscribeToTutor(links[0].tutorUid, links[0].studentId);
  });

  if ("serviceWorker" in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("../../sw.js").then((reg) => {
        reg.update();
        setInterval(() => reg.update(), 60000);
      }).catch(() => {});
    });
  }

  let deferredInstallPrompt = null;
  const installBtn = document.getElementById('installBtnDrawer');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (!isStandalone) installBtn.style.display = 'flex';
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBtn.style.display = 'none';
    closeDrawer();
  });
  window.addEventListener('appinstalled', () => { installBtn.style.display = 'none'; });
