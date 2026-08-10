let viewMode = 'overview'; // 'overview' | 'students' | 'materials' | 'friends' | 'settings'
let focusedStudentId = null;
let materialPicker = { visibleToAll: false, onlyMe: false, studentIds: [] };
let editingAccessFor = null;
function openDrawer(){ document.getElementById('drawer').classList.add('open'); document.getElementById('backdrop').classList.add('open'); }
function closeDrawer(){ document.getElementById('drawer').classList.remove('open'); document.getElementById('backdrop').classList.remove('open'); }
function selectStudentFromDrawer(id){ focusedStudentId = id; viewMode = 'students'; closeDrawer(); render(); }
function showOverviewView(){ viewMode = 'overview'; closeDrawer(); render(); }
function showStudentsView(){ viewMode = 'students'; focusedStudentId = null; closeDrawer(); render(); }

function renderDrawerLists(){
  const archiveEl = document.getElementById('archiveMenuItem');
  if(archiveEl){
    const hasArchivedStudents = (data.students||[]).some(s=>s.archived);
    const hasArchivedMaterials = (data.materials||[]).some(m=>m.archived);
    archiveEl.style.display = (hasArchivedStudents || hasArchivedMaterials) ? 'flex' : 'none';
  }
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
  archive: { title: '🗄 Архив', sub: 'Ученики и материалы, которые сейчас не активны.' },
};
function updatePageHeader(){
  const h = PAGE_HEADERS[viewMode] || PAGE_HEADERS.students;
  const titleEl = document.getElementById('pageTitle');
  const subEl = document.getElementById('pageSub');
  if(titleEl) titleEl.textContent = h.title;
  if(subEl) subEl.textContent = h.sub;
}

function render(){
  if(viewMode !== 'students' && typeof studentSheetOpen !== 'undefined' && studentSheetOpen){
    // ушли с экрана "ученики" без явного сохранения/выхода — закрываем черновик без сохранения
    studentSheetOpen = false;
    editingStudentId = null;
    editingStudentDraft = null;
    isNewStudentDraft = false;
  }
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
  if(viewMode === 'archive'){
    wrap.innerHTML = renderArchiveView();
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
  let searchHtml = '';
  if(focusedStudentId){
    list = data.students.filter(s => s.id === focusedStudentId);
    backLink = `<button class="hamburger" onclick="showStudentsView()" title="Все ученики" style="margin-bottom:0.75rem;">←</button>`;
  } else {
    list = list.filter(s => !s.archived);

    const smartSort = data.studentSortMode === 'smart';
    addButtonHtml = `<div style="display:flex; justify-content:flex-end; gap:0.375rem; margin-bottom:0.75rem; flex-wrap:wrap;">
      ${smartSort ? '' : `<button class="mat-pill ${reorderMode?'picked':''}" onclick="toggleReorderMode()">↕️ Переставить</button>`}
      <button class="btn btn-done" onclick="openAddStudentSheet()">+ Добавить ученика</button>
    </div>`;

    searchHtml = `<input type="text" placeholder="🔍 найти по имени…" value="${esc(studentSearchQuery)}" oninput="setStudentSearchQuery(this.value)" style="width:100%; font-size:0.875rem; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.625rem;">`;
    if(studentSearchQuery.trim()){
      const q = studentSearchQuery.trim().toLowerCase();
      list = list.filter(s => (s.name||'').toLowerCase().includes(q));
    }

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

    if(smartSort && window.getNextLesson){
      const todayStr = fmtDate(new Date());
      const sortKey = s => {
        const next = getNextLesson(s.scheduleRules||[], s.scheduleExceptions||[], s.scheduleBreaks||[], todayStr, 60);
        return next ? new Date(next.date+'T'+(next.time||'00:00')).getTime() : Infinity;
      };
      list = list.slice().sort((a,b) => sortKey(a)-sortKey(b));
    }
  }
  const focusedDetailHtml = (focusedStudentId && window.renderStudentFocusedDetail) ? renderStudentFocusedDetail(data.students.find(s=>s.id===focusedStudentId)) : '';
  const rowsHtml = focusedStudentId
    ? list.map((s,i)=>cardHTML(s, i===0, i===list.length-1)).join('')
    : list.map((s,i)=>compactStudentRow(s, i===0, i===list.length-1)).join('');
  wrap.innerHTML = backLink + addButtonHtml + searchHtml + subjectFilterHtml + extraFiltersHtml
    + (list.length ? rowsHtml : `<div style="font-size:0.8125rem; color:#9BA3AE; padding:0.5rem 0;">Здесь пока никого нет</div>`)
    + focusedDetailHtml
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
