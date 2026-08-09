let studentThemes = {}; // studentId -> themeId, populated by module script listeners

function applyTutorTheme(){
  const t = THEMES[data.theme || 'classic'] || THEMES.classic;
  document.body.style.backgroundColor = t.bg;
}
function setTutorTheme(themeId){
  data.theme = themeId;
  applyTutorTheme();
  save();
  if(viewMode==='settings') render();
}

let profileContacts = [];
let profilePrimaryId = null;
let profileSubjects = [];
function addProfileSubject(){
  const input = document.getElementById('newSubject');
  const value = input.value.trim();
  if(!value) return;
  if(profileSubjects.includes(value)){ showToast('Такой предмет уже добавлен'); return; }
  profileSubjects.push(value);
  input.value = '';
  renderSettingsView();
}
function removeProfileSubject(value){
  profileSubjects = profileSubjects.filter(s => s !== value);
  renderSettingsView();
}
function setPrimaryContact(id){
  profilePrimaryId = id;
  renderSettingsView();
}
function addProfileContact(type){
  const input = document.getElementById('newcontact-'+type);
  const value = input.value.trim();
  if(!value){ return; }
  const newContact = { id: uid(), type, value };
  profileContacts.push(newContact);
  if(!profilePrimaryId) profilePrimaryId = newContact.id;
  renderSettingsView();
}
function removeProfileContact(id){
  profileContacts = profileContacts.filter(c => c.id !== id);
  if(profilePrimaryId === id) profilePrimaryId = profileContacts[0] ? profileContacts[0].id : null;
  renderSettingsView();
}
function loadProfileIntoForm(p){
  window.__profileData = p;
  profileContacts = p.contacts || [];
  profilePrimaryId = p.primaryContactId || (profileContacts[0] ? profileContacts[0].id : null);
  profileSubjects = Array.isArray(p.subjects) ? p.subjects : (p.subject ? [p.subject] : []);
  if(viewMode==='settings') renderSettingsView();
}
function contactTypeGridHTML(){
  return CONTACT_TYPE_ORDER.map(type => {
    const t = CONTACT_TYPES[type];
    const existing = profileContacts.filter(c => c.type === type);
    return `
      <div style="margin-bottom:0.625rem;">
        <div style="font-size:0.75rem; font-weight:700; color:#5A6472; margin-bottom:0.25rem;">${t.icon} ${t.label}</div>
        ${existing.map(c => `
          <div style="display:flex; align-items:center; gap:0.375rem; margin-bottom:0.25rem;">
            <button onclick="setPrimaryContact('${c.id}')" title="Сделать основным" style="width:1.375rem; height:1.375rem; border-radius:999px; border:1px solid ${profilePrimaryId===c.id?'#F0B429':'#C9D2DB'}; background:${profilePrimaryId===c.id?'#FEF3D6':'#fff'}; color:${profilePrimaryId===c.id?'#B8860B':'#C9D2DB'}; font-size:0.75rem; cursor:pointer; flex-shrink:0;">★</button>
            <span style="flex:1; min-width:0; font-size:0.78125rem; color:#3A4250; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(c.value)}</span>
            <a href="${contactLink(c)}" target="_blank" style="font-size:0.71875rem; color:#2C4A7C; flex-shrink:0;">проверить</a>
            <button onclick="removeProfileContact('${c.id}')" style="width:1.5rem; height:1.5rem; border-radius:0.375rem; border:1px solid #F0DAD6; background:#FBEEEC; color:#C0392B; cursor:pointer; flex-shrink:0;">✕</button>
          </div>`).join('')}
        <div style="display:flex; gap:0.375rem;">
          <input id="newcontact-${type}" type="text" placeholder="${t.placeholder}" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB;">
          <button onclick="addProfileContact('${type}')" style="width:1.875rem; border-radius:0.5rem; border:none; background:#1F2A3D; color:#fff; cursor:pointer; flex-shrink:0;">+</button>
        </div>
      </div>`;
  }).join('');
}
function saveProfile(){
  const profile = {
    name: document.getElementById('profName').value.trim(),
    subjects: profileSubjects,
    showSubject: document.getElementById('profShowSubject').checked,
    showContacts: document.getElementById('profShowContacts').checked,
    contacts: profileContacts,
    primaryContactId: profilePrimaryId,
  };
  if(window.__fbSaveProfile) window.__fbSaveProfile(profile);
  showToast('Профиль сохранён', 'success', 4000);
}

let dataPanelOpen = false;
function renderPushSettingsInner(){
  const status = window.__pushStatus ? window.__pushStatus() : 'unsupported';
  if(status === 'unsupported'){
    return `<div class="filelabel" style="margin:0;">Уведомления</div>
      <div style="font-size:0.71875rem; color:#9BA3AE; margin-top:0.25rem;">Этот браузер не поддерживает уведомления.</div>`;
  }
  if(status === 'ios-needs-install'){
    return `<div class="filelabel" style="margin:0;">Уведомления</div>
      <div style="font-size:0.78125rem; color:#5A6472; margin-top:0.375rem;">На iPhone уведомления работают только из установленного приложения. Сначала установи его на экран (значок «Поделиться» → «На экран Домой»), затем возвращайся сюда.</div>`;
  }
  if(status === 'granted'){
    return `<div style="display:flex; align-items:center; justify-content:space-between;">
        <div class="filelabel" style="margin:0;">Уведомления</div>
        <span style="font-size:0.78125rem; color:#2E7D4F;">✓ Включены</span>
      </div>
      <div style="font-size:0.71875rem; color:#9BA3AE; margin-top:0.25rem;">Новый ученик, коллега поделился материалом и другие события.</div>
      <a href="#" onclick="window.__fbSendSelfTestPush();return false;" style="font-size:0.71875rem; color:#5A6472; display:inline-block; margin-top:0.375rem;">Отправить тестовое уведомление самой себе</a>`;
  }
  if(status === 'denied'){
    return `<div class="filelabel" style="margin:0;">Уведомления</div>
      <div style="font-size:0.78125rem; color:#5A6472; margin-top:0.375rem;">Заблокированы в браузере — включить можно только через настройки сайта в самом браузере.</div>`;
  }
  return `<div style="display:flex; align-items:center; justify-content:space-between;">
      <div class="filelabel" style="margin:0;">Уведомления</div>
      <a href="#" onclick="window.__fbEnablePush();return false;" style="font-size:0.78125rem; color:#5A6472;">Включить</a>
    </div>
    <div style="font-size:0.71875rem; color:#9BA3AE; margin-top:0.25rem;">Узнавай сразу, когда подключился новый ученик или коллега поделился материалом.</div>`;
}
window.refreshSettingsPushStatus = function(){
  const el = document.getElementById('pushSettingsCard');
  if(el) el.innerHTML = renderPushSettingsInner();
};
function toggleDataPanel(){
  dataPanelOpen = !dataPanelOpen;
  renderSettingsView();
}
function showSettingsView(){
  viewMode = 'settings';
  closeDrawer();
  render();
}
function renderSettingsView(){
  const wrap = document.getElementById('mainArea');
  if(!wrap) return;
  const p = window.__profileData || {};
  wrap.innerHTML = `
    <div class="matcard">
      <div class="filelabel">Моя тема</div>
      ${themePickerHTML(data.theme || 'classic', 'setTutorTheme')}
    </div>

    <div class="matcard" style="margin-top:0.75rem;">
      <div class="filelabel">О себе — видно ученикам</div>
      <input id="profName" type="text" placeholder="ФИО" value="${esc(p.name)}" style="width:100%; font-size:0.8125rem; padding:0.4375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem;">
      <div style="font-size:0.71875rem; font-weight:700; color:#8A93A0; text-transform:uppercase; letter-spacing:.4px; margin-bottom:0.375rem;">Предметы</div>
      <div id="profSubjects" style="display:flex; flex-wrap:wrap; gap:0.375rem; margin-bottom:0.375rem;">
        ${(profileSubjects.length===0) ? '<div style="font-size:0.75rem;color:#9BA3AE;">Пока пусто</div>' : profileSubjects.map(s => `
          <span style="display:inline-flex; align-items:center; gap:0.3rem; padding:0.3rem 0.5rem 0.3rem 0.625rem; border-radius:999px; font-size:0.75rem; font-weight:600; background:#EAF0F6; color:#2C4A7C;">
            ${esc(s)}
            <button onclick="removeProfileSubject('${esc(s)}')" style="width:1.125rem; height:1.125rem; border-radius:999px; border:none; background:#fff; color:#C0392B; font-size:0.75rem; line-height:1; cursor:pointer;">✕</button>
          </span>`).join('')}
      </div>
      <div style="display:flex; gap:0.375rem; margin-bottom:0.5rem;">
        <input id="newSubject" type="text" placeholder="например, Информатика" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB;">
        <button onclick="addProfileSubject()" style="width:1.875rem; border-radius:0.5rem; border:none; background:#1F2A3D; color:#fff; cursor:pointer;">+</button>
      </div>
      <label style="display:flex; align-items:center; gap:0.375rem; font-size:0.75rem; color:#3A4250; margin-bottom:0.75rem; cursor:pointer;">
        <input id="profShowSubject" type="checkbox" ${p.showSubject?'checked':''}> Показывать предметы ученикам
      </label>
      <div style="font-size:0.71875rem; font-weight:700; color:#8A93A0; text-transform:uppercase; letter-spacing:.4px; margin-bottom:0.5rem;">Контакты</div>
      ${contactTypeGridHTML()}
      <label style="display:flex; align-items:center; gap:0.375rem; font-size:0.75rem; color:#3A4250; margin-bottom:0.5rem; cursor:pointer;">
        <input id="profShowContacts" type="checkbox" ${p.showContacts?'checked':''}> Показывать контакты ученикам
      </label>
      <button onclick="saveProfile()" style="width:100%; padding:0.4375rem 0; border-radius:0.5rem; border:none; background:#1F2A3D; color:#fff; font-size:0.78125rem; font-weight:600; cursor:pointer;">Сохранить профиль</button>
    </div>

    <div class="matcard" style="margin-top:0.75rem;">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div class="filelabel" style="margin:0;">Пароль</div>
        <a href="#" onclick="toggleAccountPanel();return false;" style="font-size:0.78125rem; color:#5A6472;">Сменить</a>
      </div>
      <div style="font-size:0.71875rem; color:#9BA3AE; margin-top:0.25rem;">Смена пароля для входа в этот кабинет.</div>
      <div id="accountPanel" style="display:none; margin-top:0.5rem;">
        <div style="font-size:0.75rem; color:#5A6472; margin-bottom:0.5rem;">Чтобы сменить пароль, подтверди текущим</div>
        <input id="accCurPass" type="password" placeholder="текущий пароль" style="width:100%; font-size:0.8125rem; padding:0.4375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem;">
        <input id="accNewPass" type="password" placeholder="новый пароль (мин. 6 символов)" style="width:100%; font-size:0.8125rem; padding:0.4375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem;">
        <button onclick="changePassword()" style="width:100%; padding:0.4375rem 0; border-radius:0.5rem; border:none; background:#1F2A3D; color:#fff; font-size:0.78125rem; font-weight:600; cursor:pointer;">Сменить пароль</button>
      </div>
    </div>

    <div class="matcard" style="margin-top:0.75rem;" id="pushSettingsCard">
      ${renderPushSettingsInner()}
    </div>

    <div class="matcard" style="margin-top:0.75rem;">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div class="filelabel" style="margin:0;">Данные</div>
        <a href="#" onclick="toggleDataPanel();return false;" style="font-size:0.78125rem; color:#5A6472;">${dataPanelOpen?'Скрыть':'Показать'}</a>
      </div>
      <div style="font-size:0.71875rem; color:#9BA3AE; margin-top:0.25rem;">Резервная копия и восстановление — на случай смены логина или переноса на новое устройство.</div>
      <div id="dataPanel" style="display:${dataPanelOpen?'block':'none'}; margin-top:0.625rem;">
        <button class="drawer-item" style="padding-left:0;" onclick="syncBaseLinks()">🔄 Обновить базовые ссылки из файла</button>
        <button class="drawer-item" style="padding-left:0;" onclick="downloadBackup()">💾 Скачать резервную копию</button>
        <button class="drawer-item" style="padding-left:0;" onclick="document.getElementById('restoreFile').click()">📂 Загрузить из копии</button>
      </div>
    </div>
  `;
}

