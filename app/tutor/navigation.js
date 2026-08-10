let viewMode = 'overview'; // 'overview' | 'students' | 'materials' | 'friends' | 'settings'
let focusedStudentId = null;
let materialPicker = { visibleToAll: false, onlyMe: false, studentIds: [] };
let editingAccessFor = null;
function openDrawer(){ document.getElementById('drawer').classList.add('open'); document.getElementById('backdrop').classList.add('open'); }
function closeDrawer(){ document.getElementById('drawer').classList.remove('open'); document.getElementById('backdrop').classList.remove('open'); }
function selectStudentFromDrawer(id){ focusedStudentId = id; viewMode = 'students'; closeDrawer(); render(); }
function showOverviewView(){ viewMode = 'overview'; closeDrawer(); render(); }
function showStudentsView(){ viewMode = 'students'; focusedStudentId = null; closeDrawer(); render(); }
let drawerOpenSection = null; // 'online' | 'inperson' | null
function toggleDrawerSection(section){
  drawerOpenSection = (drawerOpenSection === section) ? null : section;
  renderDrawerLists();
}

function renderDrawerLists(){
  const online = data.students.filter(s => s.format !== 'Очно');
  const inperson = data.students.filter(s => s.format === 'Очно');
  const row = s => {
    const accent = ACCENTS[s.accent] || ACCENTS[0];
    return `<button class="drawer-item ${focusedStudentId===s.id?'active':''}" style="padding-left:1.5rem;" onclick="selectStudentFromDrawer('${s.id}')"><span class="dot" style="background:${accent.ink}"></span>${esc(s.name)}</button>`;
  };
  const onlineEl = document.getElementById('drawerOnline');
  const inpersonEl = document.getElementById('drawerInperson');
  onlineEl.style.display = drawerOpenSection === 'online' ? 'block' : 'none';
  inpersonEl.style.display = drawerOpenSection === 'inperson' ? 'block' : 'none';
  onlineEl.innerHTML = online.length ? online.map(row).join('') : '<div style="font-size:0.78125rem;color:#9BA3AE;padding:0.375rem 0.625rem 0.375rem 1.5rem;">Пока никого</div>';
  inpersonEl.innerHTML = inperson.length ? inperson.map(row).join('') : '<div style="font-size:0.78125rem;color:#9BA3AE;padding:0.375rem 0.625rem 0.375rem 1.5rem;">Пока никого</div>';
  const onlineArrow = document.getElementById('onlineArrow');
  const inpersonArrow = document.getElementById('inpersonArrow');
  if(onlineArrow) onlineArrow.textContent = drawerOpenSection === 'online' ? '▴' : '▾';
  if(inpersonArrow) inpersonArrow.textContent = drawerOpenSection === 'inperson' ? '▴' : '▾';
}

const PAGE_HEADERS = {
  overview: { title: '🏠 Обзор', sub: 'Коротко о твоих учениках и что не забыть сделать.' },
  students: { title: '📘 Все твои ученики', sub: 'Карточка, тарифы и расписание каждого — в одном месте.' },
  materials: { title: '📚 Материалы', sub: 'Файлы и ссылки для твоих уроков — свои, от друзей и общие.' },
  friends: { title: '👥 Друзья', sub: 'Коллеги-репетиторы, с которыми вы делитесь материалами.' },
  settings: { title: '⚙️ Настройки', sub: 'Профиль, тема, пароль и резервные копии.' },
  calendar: { title: '📅 Календарь', sub: 'Каникулы и нерешённые вопросы по расписанию.' },
  issues: { title: '⚠️ Нерешённые вопросы', sub: 'Всё, что сейчас требует твоего решения — в одном месте.' },
  notifications: { title: '🔔 Уведомления', sub: 'Всё, что тебе присылали за последнее время.' },
};
function updatePageHeader(){
  const h = PAGE_HEADERS[viewMode] || PAGE_HEADERS.students;
  const titleEl = document.getElementById('pageTitle');
  const subEl = document.getElementById('pageSub');
  if(titleEl) titleEl.textContent = h.title;
  if(subEl) subEl.textContent = h.sub;
}

function render(){
  renderDrawerLists();
  applyTutorTheme();
  updatePageHeader();
  if(window.updateIssuesBadge) updateIssuesBadge();
  const onboardingEl = document.getElementById('onboardingSheetContainer');
  if(onboardingEl && window.renderOnboardingSheet) onboardingEl.innerHTML = renderOnboardingSheet();
  const wrap = document.getElementById('mainArea');

  if(viewMode === 'overview'){
    wrap.innerHTML = renderOverviewView();
    return;
  }
  if(viewMode === 'issues'){
    wrap.innerHTML = renderIssuesView();
    return;
  }
  if(viewMode === 'notifications'){
    wrap.innerHTML = renderNotificationsView();
    return;
  }
  if(viewMode === 'materials'){
    wrap.innerHTML = renderMaterialsView();
    return;
  }
  if(viewMode === 'friends'){
    wrap.innerHTML = renderFriendsView();
    return;
  }
  if(viewMode === 'settings'){
    renderSettingsView();
    return;
  }
  if(viewMode === 'calendar'){
    wrap.innerHTML = renderCalendarView();
    return;
  }

  let list = data.students;
  let backLink = '';
  let subjectFilterHtml = '';
  let extraFiltersHtml = '';
  let addButtonHtml = '';
  if(focusedStudentId){
    list = data.students.filter(s => s.id === focusedStudentId);
    backLink = `<button class="hamburger" onclick="showStudentsView()" title="Все ученики" style="margin-bottom:0.75rem;">←</button>`;
  } else {
    addButtonHtml = `<div style="display:flex; justify-content:flex-end; margin-bottom:0.75rem;">
      <button class="btn btn-done" onclick="openAddStudentSheet()">+ Добавить ученика</button>
    </div>`;

    if(profileSubjects.length > 1){
      const matches = (s, subj) => (s.subjects||[]).length===0 || (s.subjects||[]).some(sub => sub.subject === subj);
      if(studentSubjectFilter !== 'all'){
        list = list.filter(s => matches(s, studentSubjectFilter));
      }
      subjectFilterHtml = `<div style="display:flex; gap:0.375rem; margin-bottom:0.625rem; flex-wrap:wrap;">
        <span class="mat-pill ${studentSubjectFilter==='all'?'picked':''}" onclick="setStudentSubjectFilter('all')">Все предметы</span>
        ${profileSubjects.map(sub=>`<span class="mat-pill ${studentSubjectFilter===sub?'picked':''}" onclick="setStudentSubjectFilter('${esc(sub)}')">${esc(sub)}</span>`).join('')}
      </div>`;
    }

    if(studentGradeFilter !== 'all'){
      list = list.filter(s => s.grade === studentGradeFilter);
    }
    if(studentFormatFilter !== 'all'){
      list = list.filter(s => s.format === studentFormatFilter);
    }
    const allGrades = [...new Set(data.students.map(s=>s.grade).filter(Boolean))];
    extraFiltersHtml = `
      <div style="margin-bottom:0.75rem;">
        <button onclick="toggleStudentFiltersExpanded()" class="mat-pill">⚙ Фильтры ${studentFiltersExpanded?'▴':'▾'}</button>
        ${studentFiltersExpanded ? `
          <div style="margin-top:0.5rem;">
          ${allGrades.length ? `<div style="display:flex; gap:0.375rem; flex-wrap:wrap; margin-bottom:0.5rem;">
            <span class="mat-pill ${studentGradeFilter==='all'?'picked':''}" onclick="setStudentGradeFilter('all')">Все классы</span>
            ${allGrades.map(g=>`<span class="mat-pill ${studentGradeFilter===g?'picked':''}" onclick="setStudentGradeFilter('${esc(g)}')">${esc(g)}</span>`).join('')}
          </div>` : ''}
          <div style="display:flex; gap:0.375rem; flex-wrap:wrap;">
            <span class="mat-pill ${studentFormatFilter==='all'?'picked':''}" onclick="setStudentFormatFilter('all')">Все форматы</span>
            <span class="mat-pill ${studentFormatFilter==='Онлайн'?'picked':''}" onclick="setStudentFormatFilter('Онлайн')">💻 Онлайн</span>
            <span class="mat-pill ${studentFormatFilter==='Очно'?'picked':''}" onclick="setStudentFormatFilter('Очно')">🤝 Очно</span>
          </div>
          </div>
        ` : ''}
      </div>`;
  }
  wrap.innerHTML = backLink + addButtonHtml + subjectFilterHtml + extraFiltersHtml
    + (list.length ? list.map(cardHTML).join('') : `<div style="font-size:0.8125rem; color:#9BA3AE; padding:0.5rem 0;">Здесь пока никого нет</div>`)
    + renderStudentSheet();
}

// expose picker toggles for the inline onclick handlers in pickerHTML()

render();

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

// custom install button — more reliable than waiting for the browser to surface its own prompt
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
