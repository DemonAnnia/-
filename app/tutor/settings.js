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
let profNameValue = '';
let profShowSubjectValue = false;
let profShowContactsValue = false;
let profAcceptsMultiCurrency = false;
const CURRENCIES = { RUB:'₽', USD:'$', EUR:'€', KZT:'₸', BYN:'Br' };
function refreshProfileUI(){
  if(onboardingSheetOpen){ const el = document.getElementById('onboardingSheetInner'); if(el) el.innerHTML = renderProfileFormFields(); return; }
  if(viewMode==='settings') renderSettingsView();
}
function addProfileSubject(){
  const input = document.getElementById('newSubject');
  const value = input.value.trim();
  if(!value) return;
  if(profileSubjects.includes(value)){ showToast('Такой предмет уже добавлен'); return; }
  profileSubjects.push(value);
  input.value = '';
  refreshProfileUI();
}
function removeProfileSubject(value){
  profileSubjects = profileSubjects.filter(s => s !== value);
  refreshProfileUI();
}
function loadProfileIntoForm(p){
  window.__profileData = p;
  profileContacts = p.contacts || [];
  profilePrimaryId = p.primaryContactId || (profileContacts[0] ? profileContacts[0].id : null);
  profileSubjects = Array.isArray(p.subjects) ? p.subjects : (p.subject ? [p.subject] : []);
  profNameValue = p.name || '';
  profShowSubjectValue = !!p.showSubject;
  profShowContactsValue = !!p.showContacts;
  profAcceptsMultiCurrency = !!p.acceptsMultiCurrency;
  if(viewMode==='settings') renderSettingsView();
  if(window.__firstProfileCheckDone === false){
    window.__firstProfileCheckDone = true;
    if(!p || !p.name){ openOnboardingSheet(true); }
  }
}
function renderProfileFormFields(){
  return `
      <div class="filelabel">О себе — видно ученикам</div>
      <input id="profName" type="text" placeholder="ФИО" value="${esc(profNameValue)}" oninput="profNameValue=this.value" style="width:100%; font-size:0.8125rem; padding:0.4375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem;">
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
        <input id="profShowSubject" type="checkbox" ${profShowSubjectValue?'checked':''} onchange="profShowSubjectValue=this.checked"> Показывать предметы ученикам
      </label>
      <div style="font-size:0.71875rem; font-weight:700; color:#8A93A0; text-transform:uppercase; letter-spacing:.4px; margin-bottom:0.5rem;">Контакты</div>
      ${contactTypeGridHTML()}
      <label style="display:flex; align-items:center; gap:0.375rem; font-size:0.75rem; color:#3A4250; margin-bottom:0.5rem; cursor:pointer;">
        <input id="profShowContacts" type="checkbox" ${profShowContactsValue?'checked':''} onchange="profShowContactsValue=this.checked"> Показывать контакты ученикам
      </label>
      <label style="display:flex; align-items:center; gap:0.375rem; font-size:0.75rem; color:#3A4250; margin-bottom:0.75rem; cursor:pointer;">
        <input id="profAcceptsMultiCurrency" type="checkbox" ${profAcceptsMultiCurrency?'checked':''} onchange="profAcceptsMultiCurrency=this.checked"> Принимаю платежи в разных валютах
      </label>
      <button onclick="saveProfile()" style="width:100%; padding:0.4375rem 0; border-radius:0.5rem; border:none; background:#1F2A3D; color:#fff; font-size:0.78125rem; font-weight:600; cursor:pointer;">Сохранить профиль</button>
  `;
}
function contactTypeGridHTML(){
  return compactContactGridHTML('profile');
}
function saveProfile(){
  const nameEl = document.getElementById('profName');
  if(nameEl) profNameValue = nameEl.value.trim();
  const profile = {
    name: profNameValue.trim(),
    subjects: profileSubjects,
    showSubject: profShowSubjectValue,
    showContacts: profShowContactsValue,
    contacts: profileContacts,
    primaryContactId: profilePrimaryId,
    acceptsMultiCurrency: profAcceptsMultiCurrency,
  };
  if(window.__fbSaveProfile) window.__fbSaveProfile(profile);
  showToast('Профиль сохранён', 'success', 4000);
  if(onboardingSheetOpen) closeOnboardingSheet();
}

// ---- Экран первого входа: предлагаем заполнить «О себе», та же механика, что у материалов/учеников ----
let onboardingSheetOpen = false;
let onboardingIsFirstTime = false;
function openOnboardingSheet(isFirstTime){
  onboardingSheetOpen = true;
  onboardingIsFirstTime = !!isFirstTime;
  render();
}
function closeOnboardingSheet(){
  onboardingSheetOpen = false;
  render();
}
function renderOnboardingSheet(){
  if(!onboardingSheetOpen) return '';
  return `
  <div class="mat-sheet-backdrop" ${onboardingIsFirstTime ? '' : 'onclick="closeOnboardingSheet()"'}></div>
  <div class="mat-sheet">
    <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1rem 0.5rem;">
      <div style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:1.0625rem;">${onboardingIsFirstTime ? '👋 Расскажи о себе' : '✏️ О себе'}</div>
      ${onboardingIsFirstTime ? '' : '<button class="hamburger" onclick="closeOnboardingSheet()">✕</button>'}
    </div>
    ${onboardingIsFirstTime ? '<div style="font-size:0.8125rem; color:#5A6472; padding:0 1rem; margin-bottom:0.375rem;">Эти данные увидят твои ученики. Можно заполнить сейчас, а можно пропустить и вернуться в Настройках позже.</div>' : ''}
    <div id="onboardingSheetInner" style="padding:0 1rem 1.5rem;">${renderProfileFormFields()}</div>
    ${onboardingIsFirstTime ? `<div style="padding:0 1rem 1.5rem;"><button class="btn btn-off" style="width:100%;" onclick="closeOnboardingSheet()">Пропустить, заполню позже</button></div>` : ''}
  </div>`;
}

let dataPanelOpen = false;
let notifHelpOpen = false;
function toggleNotifHelp(){
  notifHelpOpen = !notifHelpOpen;
  if(window.refreshSettingsPushStatus) window.refreshSettingsPushStatus();
}
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
      <a href="#" onclick="window.__fbSendSelfTestPush();return false;" style="font-size:0.71875rem; color:#5A6472; display:inline-block; margin-top:0.375rem;">Отправить тестовое уведомление самой себе</a>
      <br>
      <a href="#" onclick="window.__reRegisterPushDevice();return false;" style="font-size:0.71875rem; color:#5A6472; display:inline-block; margin-top:0.375rem;">Обновить это устройство</a>
      <br>
      <a href="#" onclick="toggleNotifHelp();return false;" style="font-size:0.71875rem; color:#5A6472; display:inline-block; margin-top:0.375rem;">Уведомления приходят тихо, без звука? ${notifHelpOpen?'▴':'▾'}</a>
      <div id="notifHelpPanel" style="display:${notifHelpOpen?'block':'none'}; margin-top:0.5rem; padding:0.625rem; background:#F6F7F5; border-radius:0.5rem; font-size:0.75rem; color:#3A4250; line-height:1.5;">
        Это не баг приложения — телефон сам решает, показывать ли уведомление громко или тихо, отдельно для каждого сайта. Обычно помогает:
        <div style="margin-top:0.5rem;"><b>На любом Android:</b><br>
        Настройки телефона → Приложения → Chrome → Уведомления → найди в списке этот сайт (или раздел «Сайты») → включи «Всплывающее уведомление», «Звук» и «Вибрация».</div>
        <div style="margin-top:0.5rem;"><b>Если это Xiaomi/MIUI:</b><br>
        Там же у Chrome обычно есть свои переключатели «Показывать во всплывающем окне» и «На заблокированном экране» — включи оба. Ещё стоит проверить: Настройки → Батарея → Приложения с ограничениями — Chrome не должен быть в этом списке.</div>
        <div style="margin-top:0.5rem;">После изменения настройки нажми «Отправить тестовое уведомление самой себе» выше ещё раз, чтобы проверить.</div>
      </div>`;
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
let accountPanelOpen = false;
function toggleAccountPanel(){
  accountPanelOpen = !accountPanelOpen;
  renderSettingsView();
}
function toggleDataPanel(){
  dataPanelOpen = !dataPanelOpen;
  renderSettingsView();
}
function setStudentSortMode(mode){
  data.studentSortMode = mode;
  save();
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
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div class="filelabel" style="margin:0;">О себе — видно ученикам</div>
        <a href="#" onclick="openOnboardingSheet();return false;" style="font-size:0.78125rem; color:#5A6472;">✏️ Редактировать</a>
      </div>
      <div style="font-size:0.8125rem; color:#3A4250; margin-top:0.375rem;">${profNameValue ? esc(profNameValue) : 'Имя не заполнено'}</div>
      ${profileSubjects.length ? `<div style="font-size:0.78125rem; color:#5A6472; margin-top:0.125rem;">${esc(profileSubjects.join(' · '))}</div>` : ''}
      <div style="font-size:0.71875rem; color:#9BA3AE; margin-top:0.25rem;">${profileContacts.length} контакт${profileContacts.length===1?'':profileContacts.length>=2&&profileContacts.length<=4?'а':'ов'}</div>
    </div>

    <div class="matcard" style="margin-top:0.75rem;">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div class="filelabel" style="margin:0;">Пароль</div>
        <a href="#" onclick="toggleAccountPanel();return false;" style="font-size:0.78125rem; color:#5A6472;">Сменить</a>
      </div>
      <div style="font-size:0.71875rem; color:#9BA3AE; margin-top:0.25rem;">Смена пароля для входа в этот кабинет.</div>
      <div id="accountPanel" style="display:${accountPanelOpen?'block':'none'}; margin-top:0.5rem;">
        <div style="font-size:0.75rem; color:#5A6472; margin-bottom:0.5rem;">Чтобы сменить пароль, подтверди текущим</div>
        <input id="accCurPass" type="password" placeholder="текущий пароль" style="width:100%; font-size:0.8125rem; padding:0.4375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem;">
        <input id="accNewPass" type="password" placeholder="новый пароль (мин. 6 символов)" style="width:100%; font-size:0.8125rem; padding:0.4375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem;">
        <button onclick="changePassword()" style="width:100%; padding:0.4375rem 0; border-radius:0.5rem; border:none; background:#1F2A3D; color:#fff; font-size:0.78125rem; font-weight:600; cursor:pointer;">Сменить пароль</button>
      </div>
    </div>

    <div class="matcard" style="margin-top:0.75rem;">
      <div class="filelabel">Порядок учеников в списке</div>
      <div style="display:flex; gap:0.375rem;">
        <button onclick="setStudentSortMode('manual')" style="flex:1; padding:0.4375rem 0; border-radius:0.5rem; font-size:0.78125rem; font-weight:600; border:1px solid ${(data.studentSortMode||'manual')!=='smart'?'#1F2A3D':'#C9D2DB'}; background:${(data.studentSortMode||'manual')!=='smart'?'#EAF0F6':'#fff'}; color:${(data.studentSortMode||'manual')!=='smart'?'#2C4A7C':'#8A93A0'}; cursor:pointer;">✋ Ручной</button>
        <button onclick="setStudentSortMode('smart')" style="flex:1; padding:0.4375rem 0; border-radius:0.5rem; font-size:0.78125rem; font-weight:600; border:1px solid ${data.studentSortMode==='smart'?'#1F2A3D':'#C9D2DB'}; background:${data.studentSortMode==='smart'?'#EAF0F6':'#fff'}; color:${data.studentSortMode==='smart'?'#2C4A7C':'#8A93A0'}; cursor:pointer;">🧠 Умный</button>
      </div>
      <div style="font-size:0.71875rem; color:#9BA3AE; margin-top:0.375rem;">Умный — сортирует по времени до следующего занятия автоматически, без ручной перестановки.</div>
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
        <button class="drawer-item" style="padding-left:0;" onclick="downloadBackup()">💾 Скачать резервную копию</button>
        <button class="drawer-item" style="padding-left:0;" onclick="document.getElementById('restoreFile').click()">📂 Загрузить из копии</button>
      </div>
    </div>
  `;
}

