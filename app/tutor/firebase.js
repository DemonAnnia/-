  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
  import {
    getAuth, onAuthStateChanged, signOut,
    EmailAuthProvider, reauthenticateWithCredential, updatePassword
  } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
  import {
    getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot,
    collection, query, where, arrayUnion, arrayRemove, orderBy, limit
  } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
  import { firebaseConfig, vapidKey } from "../../assets/firebase-config.js";
  import { getMessaging, getToken as getFcmToken } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

  let latestNotifications = [];
  function subscribeNotifications(uid){
    onSnapshot(query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(50)), (snap) => {
      latestNotifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      window.__notifications = latestNotifications;
      if(window.updateNotifBadge) updateNotifBadge();
      if(viewMode === 'notifications') render();
    }, (err) => console.error('notifications sync error', err));
  }
  window.__fbMarkNotificationRead = async function(id){
    try{ await setDoc(doc(db, 'users', currentUid, 'notifications', id), { read: true }, { merge: true }); }
    catch(e){ console.error('mark notification read failed', e); }
  };
  window.__fbMarkAllNotificationsRead = async function(){
    const unread = (latestNotifications||[]).filter(n=>!n.read);
    for(const n of unread){
      try{ await setDoc(doc(db, 'users', currentUid, 'notifications', n.id), { read: true }, { merge: true }); }
      catch(e){}
    }
  };

  const fbApp = initializeApp(firebaseConfig);
  const auth = getAuth(fbApp);
  const db = getFirestore(fbApp);

  // ---- push-уведомления (минимальный первый шаг, см. push-notifications.md) ----
  function isIOS(){
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }
  function isStandalone(){
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  function pushSupported(){
    return ('Notification' in window) && ('serviceWorker' in navigator) && ('PushManager' in window);
  }
  window.__pushStatus = function(){
    if(!pushSupported()) return 'unsupported';
    if(isIOS() && !isStandalone()) return 'ios-needs-install';
    if(Notification.permission === 'granted') return 'granted';
    if(Notification.permission === 'denied') return 'denied';
    return 'default';
  };

  async function registerPushTokenSilently(){
    if(!pushSupported()) return { ok:false, error:'браузер не поддерживает push' };
    if(!currentUid) return { ok:false, error:'нет активного входа' };
    if(Notification.permission !== 'granted') return { ok:false, error:'разрешение не выдано (' + Notification.permission + ')' };
    try{
      const reg = await navigator.serviceWorker.ready;
      const messaging = getMessaging(fbApp);
      const token = await getFcmToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
      if(!token) return { ok:false, error:'getToken вернул пусто' };
      const safeId = token.replace(/[\/]/g, '_');
      await setDoc(doc(db, 'users', currentUid, 'pushTokens', safeId), { token, updatedAt: Date.now() });
      return { ok:true };
    }catch(e){
      console.error('silent push token registration failed', e);
      return { ok:false, error: (e && (e.code || e.message)) || 'неизвестная ошибка' };
    }
  }
  window.__fbRegisterPushTokenSilently = registerPushTokenSilently;

  window.__fbEnablePush = async function(){
    if(!pushSupported()){ showToast('Этот браузер не поддерживает уведомления'); return; }
    if(isIOS() && !isStandalone()){
      showToast('Сначала установи приложение на экран (⚙️ → значок «Поделиться» → «На экран Домой»), потом включай уведомления оттуда', 'info', 8000);
      return;
    }
    try{
      const permission = await Notification.requestPermission();
      if(permission !== 'granted'){ showToast('Уведомления не разрешены — можно включить позже в настройках браузера'); return; }
      const result = await registerPushTokenSilently();
      if(!result.ok){ showToast('Не получилось получить токен: ' + result.error, 'error', 10000); return; }
      showToast('Уведомления включены на этом устройстве!', 'success', 4000);
      if(window.refreshSettingsPushStatus) window.refreshSettingsPushStatus();
    }catch(e){
      console.error('enable push failed', e);
      showToast('Не получилось включить уведомления: ' + (e.message||'ошибка'));
    }
  };

  window.__reRegisterPushDevice = async function(){
    showToast('Обновляю…', 'info', 4000);
    const result = await registerPushTokenSilently();
    showToast(result.ok ? 'Готово, это устройство обновлено' : ('Не получилось: ' + result.error), result.ok ? 'success' : 'error', 12000);
  };

  window.__fbSendSelfTestPush = async function(){
    if(!currentUid){ showToast('Не залогинена'); return; }
    showToast('Отправляю тестовое уведомление…', 'info', 6000);
    try{
      const token = await auth.currentUser.getIdToken();
      const resp = await fetch('https://ct030786.tw1.ru/api/send-push.php', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'self_test', targetTutorUid: currentUid }),
      });
      const json = await resp.json().catch(() => ({}));
      if(resp.ok && json.success){
        showToast(`Сервер отправил на ${json.sentTo||0} из ${json.totalDevices||0} устройств. Если конкретное устройство не получило — дело в его настройках, не в коде.`, 'success', 10000);
      } else if(resp.ok && json.success === false){
        showToast('Сервер ответил: ' + (json.note || 'токен не найден — сначала нажми «Включить» выше'), 'error', 10000);
      } else {
        showToast('Ошибка сервера: ' + (json.error || 'неизвестно') + (json.debug ? (' | ' + json.debug) : ''), 'error', 15000);
      }
    }catch(e){
      showToast('Не получилось достучаться до сервера: ' + (e.message||'ошибка сети'), 'error', 10000);
    }
  };

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

  async function sendSimplePush(type, targetTutorUid, extra){
    try {
      const token = await auth.currentUser.getIdToken();
      await fetch(TIMEWEB_BASE + '/api/send-push.php', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, targetTutorUid, ...(extra||{}) }),
      });
    } catch (e) { console.error('push notify failed (' + type + ')', e); }
  }
  window.__fbNotifyFriendsShared = function(){
    (friendUids||[]).forEach(fUid => sendSimplePush('friend_shared', fUid));
  };
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
    sendSimplePush('new_friend', ownerUid);
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

  function sniffContactType(url){
    if(/t\.me\//i.test(url) || /telegram/i.test(url)) return 'telegram';
    if(/wa\.me\//i.test(url) || /whatsapp/i.test(url)) return 'whatsapp';
    if(/vk\.com/i.test(url)) return 'vk';
    if(/^tel:/i.test(url)) return 'phone';
    if(/^mailto:/i.test(url)) return 'email';
    return null;
  }
  function extractContactValue(type, url){
    try{
      if(type==='telegram') return url.split('t.me/')[1] || url;
      if(type==='whatsapp') return url.split('wa.me/')[1] || url;
      if(type==='vk'){ const m = url.match(/sel=(\d+)/); return m ? m[1] : url; }
      if(type==='phone') return url.replace(/^tel:/,'');
      if(type==='email') return url.replace(/^mailto:/,'');
    }catch(e){}
    return url;
  }
  function migrateStudent(s){
    if(!Array.isArray(s.messengers)){ s.messengers = s.messenger ? [{id:'m1', label:'', url:s.messenger}] : []; }
    delete s.messenger;
    if(!Array.isArray(s.subjects)) s.subjects = [];
    s.subjects = s.subjects.map(sub => sub.id ? sub : { ...sub, id: uid() });

    if(s.firstName === undefined){
      const parts = (s.name||'').trim().split(/\s+/).filter(Boolean);
      s.firstName = parts[0] || '';
      s.lastName = parts.slice(1).join(' ') || '';
    }
    if(s.gradeNumber === undefined){
      const m = (s.grade||'').match(/\d+/);
      s.gradeNumber = m ? m[0] : '';
    }
    if(!s.childContacts && !s.parentContacts){
      s.childContacts = []; s.parentContacts = [];
      (s.messengers||[]).forEach(m => {
        const type = sniffContactType(m.url||'');
        if(!type) return; // не смогли распознать тип — старая запись остаётся только в messengers, не переносим
        const value = extractContactValue(type, m.url);
        const contact = { id: uid(), type, value };
        if(m.for === 'parent') s.parentContacts.push(contact); else s.childContacts.push(contact);
      });
      if(s.childContacts.length && !s.childPrimaryId) s.childPrimaryId = s.childContacts[0].id;
      if(s.parentContacts.length && !s.parentPrimaryId) s.parentPrimaryId = s.parentContacts[0].id;
    }
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

  // ---- Календарь: подписки на правило/каникулы/исключения каждого ученика ----
  let subscribedScheduleIds = new Set();
  function subscribeStudentSchedules(uid, students){
    students.forEach(s => {
      if (subscribedScheduleIds.has(s.id)) return;
      subscribedScheduleIds.add(s.id);
      onSnapshot(collection(db, 'users', uid, 'students', s.id, 'scheduleRules'), (snap) => {
        const st = data.students.find(x => x.id === s.id);
        if (st) st.scheduleRules = snap.docs.map(d => d.data());
        render();
      }, () => {});
      onSnapshot(collection(db, 'users', uid, 'students', s.id, 'scheduleBreaks'), (snap) => {
        const st = data.students.find(x => x.id === s.id);
        if (st) st.scheduleBreaks = snap.docs.map(d => d.data());
        render();
      }, () => {});
      onSnapshot(collection(db, 'users', uid, 'students', s.id, 'scheduleExceptions'), (snap) => {
        const st = data.students.find(x => x.id === s.id);
        if (st) st.scheduleExceptions = snap.docs.map(d => d.data());
        render();
      }, () => {});
    });
  }

  window.__fbSaveRule = async function(studentId, rule){
    if (!currentUid) return;
    const id = rule.id || uid();
    try { await setDoc(doc(db, 'users', currentUid, 'students', studentId, 'scheduleRules', id), { ...rule, id }); }
    catch (e) { console.error('save rule failed', e); }
  };
  window.__fbDeleteRule = async function(studentId, ruleId){
    if (!currentUid) return;
    try { await deleteDoc(doc(db, 'users', currentUid, 'students', studentId, 'scheduleRules', ruleId)); }
    catch (e) { console.error('delete rule failed', e); }
  };
  window.__fbSaveBreak = async function(studentId, brk){
    if (!currentUid) return;
    const id = brk.id || uid();
    try { await setDoc(doc(db, 'users', currentUid, 'students', studentId, 'scheduleBreaks', id), { ...brk, id }); }
    catch (e) { console.error('save break failed', e); }
  };
  window.__fbDeleteBreak = async function(studentId, breakId){
    if (!currentUid) return;
    try { await deleteDoc(doc(db, 'users', currentUid, 'students', studentId, 'scheduleBreaks', breakId)); }
    catch (e) { console.error('delete break failed', e); }
  };
  window.__fbSaveException = async function(studentId, dateStr, exception){
    if (!currentUid) return;
    try { await setDoc(doc(db, 'users', currentUid, 'students', studentId, 'scheduleExceptions', dateStr), { ...exception, date: dateStr }); }
    catch (e) { console.error('save exception failed', e); }
  };
  window.__fbDeleteException = async function(studentId, dateStr){
    if (!currentUid) return;
    try { await deleteDoc(doc(db, 'users', currentUid, 'students', studentId, 'scheduleExceptions', dateStr)); }
    catch (e) { console.error('delete exception failed', e); }
  };

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
      subscribeStudentSchedules(uid, latestStudents);
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
      if (!latestMeta.timezone) {
        try {
          const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (detected) setDoc(doc(db, 'users', uid, 'appdata', 'meta'), { timezone: detected }, { merge: true }).catch(() => {});
        } catch (e) {}
      }
      metaLoaded = true;
      tryRender();
    }, (err) => console.error('meta sync error', err));
    onSnapshot(collection(db, 'users', uid, 'materials'), (snap) => {
      latestMaterials = snap.docs.map(d => d.data());
      materialsLoaded = true;
      tryRender();
    }, (err) => console.error('materials sync error', err));
    onSnapshot(doc(db, 'users', uid, 'appdata', 'profile'), (snap) => {
      if (snap.exists() && window.loadProfileIntoForm) {
        window.loadProfileIntoForm(snap.data());
      } else if (!snap.exists() && window.__firstProfileCheckDone === false) {
        window.__firstProfileCheckDone = true;
        if (window.openOnboardingSheet) window.openOnboardingSheet();
      }
    }, (err) => console.error('profile sync error', err));
    startFriendsSync(uid);
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.replace('../index.html'); return; }
    currentUid = user.uid;
    window.__currentUid = user.uid;
    window.__firstProfileCheckDone = false;
    const accessSnap = await getDoc(doc(db, 'studentAccess', user.uid));
    if (accessSnap.exists()) { window.location.replace('student.html'); return; }
    await migrateLegacyIfNeeded(user.uid);
    startTutorSync(user.uid);
    cleanupOrphanedFiles(user.uid); // не блокирует загрузку кабинета, идёт в фоне
    registerPushTokenSilently(); // если разрешение уже было дано раньше — освежаем токен без диалога
    subscribeNotifications(user.uid);
  });
