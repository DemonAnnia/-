  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
  import {
    getAuth, onAuthStateChanged, signOut,
    EmailAuthProvider, reauthenticateWithCredential, updatePassword
  } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
  import {
    getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot,
    collection, query, where, arrayUnion, arrayRemove
  } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
  import { firebaseConfig } from "../../assets/firebase-config.js";

  const fbApp = initializeApp(firebaseConfig);
  const auth = getAuth(fbApp);
  const db = getFirestore(fbApp);

  let currentUid = null;
  let unsubStudents = null;
  let unsubMeta = null;
  let saveTimer = null;
  let knownStudentIds = new Set();
  let latestMeta = { openIds: [] };
  let latestStudents = [];

  window.doLogout = async function () { await signOut(auth); window.location.replace('../index.html'); };

  window.toggleAccountPanel = function () {
    const el = document.getElementById('accountPanel');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };

  async function reauth(currentPassword) {
    const cred = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
    await reauthenticateWithCredential(auth.currentUser, cred);
  }

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
      await reauth(curPass);
      await updatePassword(auth.currentUser, newPass);
      showToast('Пароль обновлён!', 'success', 4000);
      document.getElementById('accNewPass').value = '';
      document.getElementById('accCurPass').value = '';
    } catch (e) {
      showToast(friendlyAuthError(e));
    }
  };

  window.__fbCreateLink = async function (code, studentId) {
    if (!currentUid) return false;
    try {
      await setDoc(doc(db, 'studentLinks', code), { tutorUid: currentUid, studentId, claimed: false, createdAt: Date.now() });
      return true;
    } catch (e) { console.error('createLink failed', e); return false; }
  };
  window.__fbRevokeLink = async function (code) {
    try { await deleteDoc(doc(db, 'studentLinks', code)); } catch (e) {}
  };

  window.__fbUpsertMaterial = async function (material) {
    if (!currentUid) return;
    try { await setDoc(doc(db, 'users', currentUid, 'materials', material.id), material); }
    catch (e) { console.error('upsert material failed', e); }
  };
  window.__fbDeleteMaterial = async function (id) {
    if (!currentUid) return;
    try { await deleteDoc(doc(db, 'users', currentUid, 'materials', id)); }
    catch (e) { console.error('delete material failed', e); }
  };

  const TIMEWEB_BASE = 'https://ct030786.tw1.ru';
  window.__fbUploadMaterialFile = async function (file) {
    const token = await auth.currentUser.getIdToken();
    const formData = new FormData();
    formData.append('file', file);
    const resp = await fetch(TIMEWEB_BASE + '/api/upload.php', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData,
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json.success) throw new Error(json.error || 'Сервер отказал в загрузке');
    return json; // { success, materialId, fileName, origName, url }
  };
  window.__fbDeleteMaterialFile = async function (fileName) {
    const token = await auth.currentUser.getIdToken();
    const formData = new FormData();
    formData.append('fileName', fileName);
    const resp = await fetch(TIMEWEB_BASE + '/api/delete.php', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData,
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json.success) throw new Error(json.error || 'Сервер отказал в удалении');
    return json;
  };
  function fileRefId(fileOwnerUid, fileName){ return fileOwnerUid + '_' + fileName; }
  window.__fbRegisterFileRef = async function (fileOwnerUid, fileName) {
    if (!currentUid || !fileName) return;
    try {
      await setDoc(doc(db, 'fileRefs', fileRefId(fileOwnerUid, fileName)), {
        fileOwnerUid, fileName, referencedBy: arrayUnion(currentUid)
      }, { merge: true });
    } catch (e) { console.error('register file ref failed', e); }
  };
  window.__fbUnregisterFileRef = async function (fileOwnerUid, fileName) {
    if (!currentUid || !fileName) return;
    try {
      await updateDoc(doc(db, 'fileRefs', fileRefId(fileOwnerUid, fileName)), {
        referencedBy: arrayRemove(currentUid)
      });
    } catch (e) { /* doc может уже не существовать — не критично */ }
  };
  // физическая уборка на Timeweb — только у ВЛАДЕЛЬЦА файла, только когда счётчик дошёл до нуля,
  // проверяется раз при каждом входе в кабинет, никогда в момент чьего-либо удаления записи
  async function cleanupOrphanedFiles(uid){
    try {
      const snap = await getDocs(query(collection(db, 'fileRefs'), where('fileOwnerUid', '==', uid)));
      for (const d of snap.docs) {
        const refData = d.data();
        if (!refData.referencedBy || refData.referencedBy.length === 0) {
          try { await window.__fbDeleteMaterialFile(refData.fileName); }
          catch (e) { console.error('physical cleanup failed', e); }
          deleteDoc(d.ref).catch(() => {});
        }
      }
    } catch (e) { console.error('cleanup query failed', e); }
  }
  window.__fbSaveProfile = async function (profile) {
    if (!currentUid) return;
    try { await setDoc(doc(db, 'users', currentUid, 'appdata', 'profile'), profile); }
    catch (e) { console.error('save profile failed', e); }
  };

  function friendPairId(a, b) { return a < b ? a + '_' + b : b + '_' + a; }
  function makeFriendCode() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return 'К-' + c;
  }

  window.__fbEnsureFriendCode = async function () {
    if (!currentUid) return;
    if (friendCode) return; // already loaded from meta snapshot
    const code = makeFriendCode();
    try {
      await setDoc(doc(db, 'tutorLinks', code), { tutorUid: currentUid });
      friendCode = code;
      setDoc(doc(db, 'users', currentUid, 'appdata', 'meta'), { friendCode: code }, { merge: true }).catch(() => {});
      if (viewMode === 'friends') { document.getElementById('mainArea').innerHTML = renderFriendsView(); }
    } catch (e) { console.error('friend code creation failed', e); }
  };

  window.__fbAddFriend = async function (rawCode) {
    const code = rawCode.startsWith('К-') || rawCode.startsWith('K-') ? 'К-' + rawCode.slice(2) : rawCode;
    const linkSnap = await getDoc(doc(db, 'tutorLinks', code));
    if (!linkSnap.exists()) throw new Error('Такого кода не существует — проверь, что скопировал правильно');
    const ownerUid = linkSnap.data().tutorUid;
    if (ownerUid === currentUid) throw new Error('Это твой собственный код');
    const pairId = friendPairId(currentUid, ownerUid);
    await setDoc(doc(db, 'friendships', pairId), {
      uidA: currentUid, uidB: ownerUid, viaCode: code, createdAt: Date.now()
    });
    try {
      const profSnap = await getDoc(doc(db, 'users', ownerUid, 'appdata', 'profile'));
      return profSnap.exists() ? profSnap.data().name : null;
    } catch (e) { return null; }
  };

  window.__fbRemoveFriend = async function (friendUid) {
    if (!currentUid) return;
    try { await deleteDoc(doc(db, 'friendships', friendPairId(currentUid, friendUid))); }
    catch (e) { console.error('remove friend failed', e); }
  };

  window.__fbCopyFriendMaterial = async function (friendUid, materialId) {
    const snap = await getDoc(doc(db, 'users', friendUid, 'materials', materialId));
    if (!snap.exists()) throw new Error('Материал уже недоступен');
    const src = snap.data();
    const copy = {
      id: uid(), name: src.name, url: src.url, category: src.category || 'discuss',
      storage: src.storage, fileName: src.fileName || null, fileOwnerUid: src.storage === 'timeweb' ? friendUid : null,
      visibleToAll: false, studentIds: [], visibleToFriends: false, archived: false,
      copiedFrom: friendUid,
    };
    data.materials = [...(data.materials || []), copy];
    if (window.__fbUpsertMaterial) window.__fbUpsertMaterial(copy);
    if (src.storage === 'timeweb' && window.__fbRegisterFileRef) window.__fbRegisterFileRef(friendUid, src.fileName);
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    render();
  };

  let friendUids = [];
  const unsubFriendMaterials = {};
  function startFriendsSync(myUid) {
    onSnapshot(query(collection(db, 'friendships'), where('uidA', '==', myUid)), (snap) => {
      handleFriendshipDocs(myUid, snap.docs.map(d => d.data()));
    }, (err) => console.error('friendships(A) sync error', err));
    onSnapshot(query(collection(db, 'friendships'), where('uidB', '==', myUid)), (snap) => {
      handleFriendshipDocs(myUid, snap.docs.map(d => d.data()));
    }, (err) => console.error('friendships(B) sync error', err));
  }
  let knownFriendships = {}; // pairKey -> otherUid, merged from both listeners
  async function handleFriendshipDocs(myUid, docsBatch) {
    docsBatch.forEach(f => {
      const otherUid = f.uidA === myUid ? f.uidB : f.uidA;
      knownFriendships[otherUid] = true;
    });
    const uids = Object.keys(knownFriendships);
    friendUids = uids;
    const list = [];
    for (const fUid of uids) {
      let name = null;
      try {
        const p = await getDoc(doc(db, 'users', fUid, 'appdata', 'profile'));
        if (p.exists()) name = p.data().name;
      } catch (e) {}
      list.push({ uid: fUid, name });
      if (!unsubFriendMaterials[fUid]) {
        unsubFriendMaterials[fUid] = onSnapshot(
          query(collection(db, 'users', fUid, 'materials'), where('visibleToFriends', '==', true)),
          (snap) => {
            const theirs = snap.docs.map(d => ({ ...d.data(), __friendUid: fUid, __friendName: name || 'коллеги' }));
            friendMaterials = friendMaterials.filter(m => m.__friendUid !== fUid).concat(theirs);
            if (viewMode === 'materials') render();
          },
          (err) => console.error('friend materials sync error', err)
        );
      }
    }
    friendsList = list;
    if (viewMode === 'friends') render();
  }

  function pushSaveToFirestore() {
    if (!currentUid) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const currentIds = new Set((data.students || []).map(s => s.id));
      for (const id of knownStudentIds) {
        if (!currentIds.has(id)) deleteDoc(doc(db, 'users', currentUid, 'students', id)).catch(() => {});
      }
      knownStudentIds = currentIds;
      (data.students || []).forEach(s => {
        setDoc(doc(db, 'users', currentUid, 'students', s.id), s).catch((e) => console.error('save student failed', e));
      });
      setDoc(doc(db, 'users', currentUid, 'appdata', 'meta'), {
        openIds: data.openIds || [], theme: data.theme || 'classic'
      }, { merge: true }).catch((e) => console.error('save meta failed', e));
    }, 400);
  }
  window.__firestoreSave = pushSaveToFirestore;

  function migrateStudent(s){
    if(!Array.isArray(s.messengers)){ s.messengers = s.messenger ? [{id:'m1', label:'', url:s.messenger}] : []; }
    delete s.messenger;
    if(!Array.isArray(s.subjects)) s.subjects = [];
    s.subjects = s.subjects.map(sub => sub.id ? sub : { ...sub, id: uid() });
    return s;
  }

  async function migrateLegacyIfNeeded(uid) {
    try {
      const legacyRef = doc(db, 'users', uid, 'appdata', 'main');
      const legacySnap = await getDoc(legacyRef);
      if (!legacySnap.exists()) return;
      const legacy = migrate(legacySnap.data());
      for (const s of (legacy.students || [])) {
        await setDoc(doc(db, 'users', uid, 'students', s.id), s);
      }
      await setDoc(doc(db, 'users', uid, 'appdata', 'meta'), { openIds: legacy.openIds || [] });
      // migrate old shared/per-student files into the new unified materials catalog
      for (const f of (legacy.sharedFiles || [])) {
        await setDoc(doc(db, 'users', uid, 'materials', f.id || cryptoRandomId()), {
          id: f.id, name: f.name || '', url: f.url, visibleToAll: true, studentIds: []
        });
      }
      for (const s of (legacy.students || [])) {
        for (const f of (s.files || [])) {
          await setDoc(doc(db, 'users', uid, 'materials', f.id || cryptoRandomId()), {
            id: f.id, name: f.name || '', url: f.url, visibleToAll: false, studentIds: [s.id]
          });
        }
      }
      await deleteDoc(legacyRef);
    } catch (e) { console.error('legacy migration failed', e); }
  }
  function cryptoRandomId(){ return Math.random().toString(36).slice(2,9); }

  let subscribedThemeIds = new Set();
  function subscribeStudentThemes(uid, students){
    students.forEach(s => {
      if (subscribedThemeIds.has(s.id)) return;
      subscribedThemeIds.add(s.id);
      onSnapshot(doc(db, 'users', uid, 'students', s.id, 'prefs', 'theme'), (snap) => {
        studentThemes[s.id] = snap.exists() ? (snap.data().theme || 'classic') : 'classic';
        render();
      }, () => {});
    });
  }

  let watchedCodes = new Set();
  function watchPendingInviteCodes(uid, students){
    students.forEach(s => {
      if (!s.inviteCode || watchedCodes.has(s.inviteCode)) return;
      watchedCodes.add(s.inviteCode);
      onSnapshot(doc(db, 'studentLinks', s.inviteCode), (snap) => {
        if (snap.exists() && snap.data().claimed) {
          setDoc(doc(db, 'users', uid, 'students', s.id), { hasAccount: true, inviteCode: null }, { merge: true })
            .catch((e) => console.error('mark hasAccount failed', e));
        }
      }, () => {});
    });
  }

  function startTutorSync(uid) {
    let studentsLoaded = false, metaLoaded = false, materialsLoaded = false;
    let latestMaterials = [];
    const tryRender = () => {
      if (!studentsLoaded || !metaLoaded || !materialsLoaded) return;
      data = { students: latestStudents, materials: latestMaterials, openIds: latestMeta.openIds, theme: latestMeta.theme, sharedFiles: [] };
      knownStudentIds = new Set(latestStudents.map(s => s.id));
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
      document.getElementById('loadingScreen').style.display = 'none';
      document.getElementById('appRoot').style.display = 'block';
      subscribeStudentThemes(uid, latestStudents);
      watchPendingInviteCodes(uid, latestStudents);
      render();
    };
    unsubStudents = onSnapshot(collection(db, 'users', uid, 'students'), (snap) => {
      latestStudents = snap.docs.map(d => migrateStudent(d.data()));
      studentsLoaded = true;
      tryRender();
    }, (err) => console.error('students sync error', err));
    unsubMeta = onSnapshot(doc(db, 'users', uid, 'appdata', 'meta'), (snap) => {
      latestMeta = snap.exists() ? snap.data() : { openIds: [] };
      if (latestMeta.friendCode) friendCode = latestMeta.friendCode;
      metaLoaded = true;
      tryRender();
    }, (err) => console.error('meta sync error', err));
    onSnapshot(collection(db, 'users', uid, 'materials'), (snap) => {
      latestMaterials = snap.docs.map(d => d.data());
      materialsLoaded = true;
      tryRender();
    }, (err) => console.error('materials sync error', err));
    onSnapshot(doc(db, 'users', uid, 'appdata', 'profile'), (snap) => {
      if (snap.exists() && window.loadProfileIntoForm) window.loadProfileIntoForm(snap.data());
    }, (err) => console.error('profile sync error', err));
    startFriendsSync(uid);
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.replace('../index.html'); return; }
    currentUid = user.uid;
    window.__currentUid = user.uid;
    const accessSnap = await getDoc(doc(db, 'studentAccess', user.uid));
    if (accessSnap.exists()) { window.location.replace('student.html'); return; }
    await migrateLegacyIfNeeded(user.uid);
    startTutorSync(user.uid);
    cleanupOrphanedFiles(user.uid); // не блокирует загрузку кабинета, идёт в фоне
  });
