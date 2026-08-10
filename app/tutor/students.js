function getInitials(fullName){
  return (fullName||'').trim().split(/\s+/).filter(Boolean).map(w=>w[0]).join('').toUpperCase();
}
async function generateInviteCode(studentId){
  const tutorName = window.__profileData && window.__profileData.name;
  if(!tutorName){
    showToast('Сначала впиши своё ФИО в Настройках → «О себе» — без него код не собрать');
    return;
  }
  const initials = getInitials(tutorName);
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let rand = '';
  for(let i=0;i<5;i++) rand += chars[Math.floor(Math.random()*chars.length)];
  const code = `У-${initials}-${rand}`;
  if(!window.__fbCreateLink){ showToast('Нет связи с базой, попробуй позже'); return; }
  const ok = await window.__fbCreateLink(code, studentId);
  if(ok){
    const s = data.students.find(x=>x.id===studentId);
    s.inviteCode = code;
    save();
    if(studentSheetOpen) refreshStudentSheet();
  } else {
    showToast('Не получилось создать код, попробуй ещё раз');
  }
}
async function revokeInviteCode(studentId){
  const s = data.students.find(x=>x.id===studentId);
  if(!s || !s.inviteCode) return;
  if(window.__fbRevokeLink) await window.__fbRevokeLink(s.inviteCode);
  delete s.inviteCode;
  save();
  if(studentSheetOpen) refreshStudentSheet();
}
let confirmResetAccess = false;
function requestResetAccess(){
  confirmResetAccess = true;
  refreshStudentSheet();
}
function cancelResetAccess(){
  confirmResetAccess = false;
  refreshStudentSheet();
}
async function confirmResetAndNewCode(studentId){
  const s = data.students.find(x=>x.id===studentId);
  if(!s) return;
  s.hasAccount = false;
  confirmResetAccess = false;
  save();
  await generateInviteCode(studentId);
  showToast('Старый доступ сброшен, новый код готов', 'success', 4000);
}

// ---- Механика выезжающего экрана: черновик правится локально, пишется в базу только по «Сохранить» ----
let studentSheetOpen = false;
let editingStudentId = null;
let editingStudentDraft = null;
let isNewStudentDraft = false;
let pendingSheetExit = false;
let pendingSaveWarning = null;

function makeBlankStudentDraft(){
  return {
    id: uid(), firstName:'', lastName:'', gradeNumber:'', format:'Онлайн',
    accent: data.students.length % ACCENTS.length,
    callLink:'', boardLink:'',
    childContacts:[], childPrimaryId:null,
    parentContacts:[], parentPrimaryId:null,
    needsPaymentReport:true, subjects:[],
    hasAccount:false, inviteCode:null, completedLessonsCount:0,
  };
}
function cloneStudentForDraft(s){
  const draft = JSON.parse(JSON.stringify(s));
  if(draft.firstName === undefined){
    const parts = (s.name||'').trim().split(/\s+/).filter(Boolean);
    draft.firstName = parts[0] || '';
    draft.lastName = parts.slice(1).join(' ') || '';
  }
  if(draft.gradeNumber === undefined){
    const m = (s.grade||'').match(/\d+/);
    draft.gradeNumber = m ? m[0] : '';
  }
  if(!draft.childContacts) draft.childContacts = [];
  if(!draft.parentContacts) draft.parentContacts = [];
  return draft;
}
function openAddStudentSheet(){
  editingStudentId = null;
  isNewStudentDraft = true;
  editingStudentDraft = makeBlankStudentDraft();
  pendingSheetExit = false;
  pendingSaveWarning = null;
  confirmResetAccess = false;
  studentSheetOpen = true;
  viewMode = 'students';
  closeDrawer();
  render();
}
function openEditStudentSheet(id){
  const s = data.students.find(x=>x.id===id);
  if(!s) return;
  editingStudentId = id;
  isNewStudentDraft = false;
  editingStudentDraft = cloneStudentForDraft(s);
  pendingSheetExit = false;
  pendingSaveWarning = null;
  confirmResetAccess = false;
  studentSheetOpen = true;
  viewMode = 'students';
  closeDrawer();
  render();
}
function draftHasChanges(){
  if(!editingStudentDraft) return false;
  if(isNewStudentDraft){
    const d = editingStudentDraft;
    return !!(d.firstName || d.lastName || d.gradeNumber || d.callLink || d.boardLink
      || (d.childContacts||[]).length || (d.parentContacts||[]).length || (d.subjects||[]).length);
  }
  const s = data.students.find(x=>x.id===editingStudentId);
  if(!s) return false;
  return JSON.stringify(cloneStudentForDraft(s)) !== JSON.stringify(editingStudentDraft);
}
function requestCloseStudentSheet(){
  if(draftHasChanges() && !pendingSheetExit){
    pendingSheetExit = true;
    refreshStudentSheet();
    return;
  }
  closeStudentSheet();
}
function cancelSheetExit(){
  pendingSheetExit = false;
  refreshStudentSheet();
}
function closeStudentSheet(){
  studentSheetOpen = false;
  editingStudentId = null;
  editingStudentDraft = null;
  isNewStudentDraft = false;
  pendingSheetExit = false;
  pendingSaveWarning = null;
  confirmResetAccess = false;
  render();
}
function saveStudentDraft(force){
  const d = editingStudentDraft;
  const name = (d.firstName||'').trim() + ((d.lastName||'').trim() ? ' '+d.lastName.trim() : '');
  if(!name.trim() && !force){
    pendingSaveWarning = 'Имя не указано — сохранить всё равно?';
    refreshStudentSheet();
    return;
  }
  d.name = name.trim() || 'Без имени';
  d.grade = d.gradeNumber ? (d.gradeNumber + ' класс') : '';
  pendingSaveWarning = null;

  if(isNewStudentDraft){
    data.students.push(d);
  } else {
    const idx = data.students.findIndex(x=>x.id===editingStudentId);
    if(idx>=0) data.students[idx] = d;
  }
  save();
  showToast('Сохранено', 'success', 3000);
  closeStudentSheet();
}

function renderStudentPreviewHTML(){
  const d = editingStudentDraft;
  const accent = ACCENTS[d.accent] || ACCENTS[0];
  const name = ((d.firstName||'').trim() + ((d.lastName||'').trim() ? ' '+d.lastName.trim() : '')) || 'Новый ученик';
  const grade = d.gradeNumber ? (d.gradeNumber+' класс') : '';
  return `
    <div style="display:flex; align-items:center; gap:0.625rem; padding:0.625rem 0.875rem; background:${accent.soft}; border-radius:0.75rem;">
      <div class="dot" style="background:${accent.ink}; flex-shrink:0;"></div>
      <div style="flex:1; min-width:0;">
        <div style="font-weight:700; font-size:0.9375rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(name)}</div>
        <div style="font-size:0.75rem; color:#5A6472;">${esc(grade)}${grade&&d.format?' · ':''}${esc(d.format||'')}</div>
      </div>
    </div>`;
}
function updateStickyPreview(){
  const el = document.getElementById('studentPreviewSticky');
  if(el) el.innerHTML = renderStudentPreviewHTML();
  const titleEl = document.getElementById('studentSheetTitle');
  if(titleEl){
    const d = editingStudentDraft;
    const name = ((d.firstName||'').trim() + ((d.lastName||'').trim() ? ' '+d.lastName.trim() : '')).trim() || (isNewStudentDraft ? 'Новый ученик' : 'Без имени');
    titleEl.textContent = (isNewStudentDraft ? '➕ ' : '✏️ ') + name;
  }
}
function refreshStudentSheet(){
  if(!studentSheetOpen || !editingStudentDraft) return;
  const el = document.getElementById('studentSheetInner');
  if(el) el.innerHTML = renderStudentSheetInner(editingStudentDraft);
  updateStickyPreview();
}
function renderStudentSheet(){
  if(!studentSheetOpen || !editingStudentDraft) return '';
  const d = editingStudentDraft;
  const name = ((d.firstName||'').trim() + ((d.lastName||'').trim() ? ' '+d.lastName.trim() : '')).trim() || (isNewStudentDraft ? 'Новый ученик' : 'Без имени');
  return `
  <div class="mat-sheet-backdrop" onclick="requestCloseStudentSheet()"></div>
  <div class="mat-sheet">
    <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1rem 0.5rem;">
      <div id="studentSheetTitle" style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:1.0625rem;">${isNewStudentDraft?'➕ ':'✏️ '}${esc(name)}</div>
      <button class="hamburger" onclick="requestCloseStudentSheet()">✕</button>
    </div>
    <div id="studentPreviewSticky" style="position:sticky; top:0; z-index:5; padding:0 1rem 0.75rem; background:#F3F5F1;">${renderStudentPreviewHTML()}</div>
    <div id="studentSheetInner" style="padding:0 1rem 1.5rem;">${renderStudentSheetInner(d)}</div>
  </div>`;
}

// ---- Типизированные контакты ребёнка/родителя (тот же паттерн, что у профиля репетитора) ----
function studentContactGridHTML(group, contacts, primaryId){
  return compactContactGridHTML(group + ':' + editingStudentDraft.id);
}

function addDraftSubject(){
  const labelEl = document.getElementById('draftSubLabel');
  const durationEl = document.getElementById('draftSubDuration');
  const priceEl = document.getElementById('draftSubPrice');
  const currencyEl = document.getElementById('draftSubCurrency');
  const subjectEl = document.getElementById('draftSubjectSelect');
  if(!labelEl.value.trim()){ showToast('Впиши название тарифа'); return; }
  const durationHours = parseFloat((durationEl.value||'').replace(',','.')) || 1;
  const amount = parseFloat((priceEl.value||'').replace(',','.')) || 0;
  const currency = (profAcceptsMultiCurrency && currencyEl) ? currencyEl.value : 'RUB';
  editingStudentDraft.subjects.push({
    id: uid(), label: labelEl.value.trim(), subject: subjectEl ? subjectEl.value : null,
    durationHours, amount, currency,
  });
  refreshStudentSheet();
}
function setDraftSubjectDuration(hours){
  const el = document.getElementById('draftSubDuration');
  if(el) el.value = hours;
}
function tariffLabel(sub){
  if(sub.amount !== undefined){
    const dur = sub.durationHours ? `${sub.durationHours} ч · ` : '';
    const sym = CURRENCIES[sub.currency] || sub.currency || '₽';
    return `${dur}${sub.amount} ${sym}`;
  }
  return esc(sub.price||''); // старые тарифы — просто как было
}
function removeDraftSubject(subId){
  editingStudentDraft.subjects = (editingStudentDraft.subjects||[]).filter(s=>s.id!==subId);
  refreshStudentSheet();
}

// ---- Расписание: панель на карточке ученика (см. calendar-architecture.md, раздел 2) ----
const DAY_NAMES = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб']; // индекс = dayOfWeek, как в JS Date.getDay() (0=Вс)
const DAY_ORDER = [1,2,3,4,5,6,0]; // порядок ПОКАЗА кнопок — с понедельника, как принято у нас
let scheduleAddDays = {}; // studentId -> [dayOfWeek,...]

function toggleScheduleDay(sid, dow){
  const cur = scheduleAddDays[sid] || [];
  scheduleAddDays[sid] = cur.includes(dow) ? cur.filter(d=>d!==dow) : [...cur, dow];
  if(studentSheetOpen) refreshStudentSheet(); else render();
}
function focusTariffInput(sid){
  const el = document.getElementById('draftSubLabel');
  if(el){ el.scrollIntoView({behavior:'smooth', block:'center'}); el.focus(); }
}
function scheduleGroupKey(r){ return `${r.time}|${r.subjectId||''}|${r.startDate}|${r.endDate||''}`; }
function renderScheduleGroups(s){
  const rules = s.scheduleRules || [];
  if(rules.length === 0) return '<div style="font-size:0.78125rem;color:#9BA3AE;margin-bottom:0.5rem;">Пока пусто</div>';
  const groups = {};
  rules.forEach(r => {
    const key = scheduleGroupKey(r);
    if(!groups[key]) groups[key] = { ...r, days: [], ruleIds: [] };
    groups[key].days.push(r.dayOfWeek);
    groups[key].ruleIds.push(r.id);
  });
  return Object.values(groups).map(g => {
    const daysLabel = g.days.slice().sort((a,b)=>DAY_ORDER.indexOf(a)-DAY_ORDER.indexOf(b)).map(d=>DAY_NAMES[d]).join(', ');
    const tariff = g.subjectId ? (s.subjects||[]).find(sub=>sub.id===g.subjectId) : null;
    const rangeLabel = g.endDate ? ` · до ${esc(g.endDate)}` : '';
    return `
      <div class="filerow">
        <span>📅</span>
        <span style="flex:1; font-size:0.8125rem;">${esc(daysLabel)} · ${esc(g.time)}${tariff ? ` · ${esc(tariff.label)}` : ''}${rangeLabel}</span>
        <button class="iconbtn" onclick="deleteScheduleGroup('${s.id}','${g.ruleIds.join(',')}')" style="border-color:#F0DAD6;background:#FBEEEC;color:#C0392B;">✕</button>
      </div>`;
  }).join('');
}
function addScheduleGroup(sid){
  const days = scheduleAddDays[sid] || [];
  if(days.length === 0){ showToast('Выбери хотя бы один день недели'); return; }
  const time = document.getElementById('scheduletime-'+sid).value;
  if(!time){ showToast('Укажи время'); return; }
  const startEl = document.getElementById('schedulestart-'+sid);
  const startDate = startEl.value || fmtDate(new Date());
  const tariffEl = document.getElementById('scheduletariff-'+sid);
  const subjectId = tariffEl ? (tariffEl.value || null) : null;
  days.forEach(dow => {
    if(window.__fbSaveRule) window.__fbSaveRule(sid, { dayOfWeek: dow, time, startDate, endDate: null, subjectId });
  });
  scheduleAddDays[sid] = [];
  showToast('Добавлено в расписание', 'success', 3000);
  if(studentSheetOpen) refreshStudentSheet(); else render();
}
function deleteScheduleGroup(sid, ruleIdsJoined){
  ruleIdsJoined.split(',').forEach(ruleId => {
    if(window.__fbDeleteRule) window.__fbDeleteRule(sid, ruleId);
  });
}

let studentSubjectFilter = 'all';
function setStudentSubjectFilter(v){ studentSubjectFilter = v; render(); }
let studentGradeFilter = 'all';
function setStudentGradeFilter(v){ studentGradeFilter = v; render(); }
let studentFormatFilter = 'all';
function setStudentFormatFilter(v){ studentFormatFilter = v; render(); }
let studentFiltersExpanded = false;
function toggleStudentFiltersExpanded(){ studentFiltersExpanded = !studentFiltersExpanded; render(); }

let reorderMode = false;
function toggleReorderMode(){ reorderMode = !reorderMode; render(); }
function moveStudent(id, direction){
  const idx = data.students.findIndex(s=>s.id===id);
  const swapWith = idx + direction;
  if(idx<0 || swapWith<0 || swapWith>=data.students.length) return;
  const tmp = data.students[idx];
  data.students[idx] = data.students[swapWith];
  data.students[swapWith] = tmp;
  save();
}

let showArchivedStudents = false;
function toggleShowArchivedStudents(){ showArchivedStudents = !showArchivedStudents; render(); }
function archiveStudent(id){
  const s = data.students.find(x=>x.id===id);
  if(!s) return;
  s.archived = true;
  save();
  showToast('Ученик отправлен в архив — можно будет вернуть в любой момент', 'success', 4000);
  if(studentSheetOpen) closeStudentSheet();
}
function restoreStudentFromArchive(id){
  const s = data.students.find(x=>x.id===id);
  if(!s) return;
  s.archived = false;
  save();
  showToast('Ученик вернулся из архива', 'success', 3000);
}

let otherContactsOpenFor = {};
function toggleOtherContactsFor(sid){
  otherContactsOpenFor[sid] = !otherContactsOpenFor[sid];
  render();
}
let doneMsgFor = {};
function markDone(id){
  if(doneMsgFor[id]){
    delete doneMsgFor[id];
    render();
    return;
  }
  const s = data.students.find(x=>x.id===id);
  s.completedLessonsCount = (s.completedLessonsCount || 0) + 1;
  if(s.needsPaymentReport){
    const d = new Date();
    const dateStr = d.toLocaleDateString('ru-RU', {day:'numeric', month:'long'});
    doneMsgFor[id] = `Здравствуйте! Занятие с ${s.name} ${dateStr} прошло — можно оплачивать 🙂`;
  } else {
    doneMsgFor[id] = `✓ Отмечено. Занятий с ${s.name} теперь: ${s.completedLessonsCount}`;
  }
  save();
  render();
}

function materialsFor(studentId){
  return (data.materials||[]).filter(m => m.visibleToAll || (m.studentIds||[]).includes(studentId));
}
function buildStudentMessage(s){
  const lines = [];
  if(s.callLink) lines.push(`Подключиться к занятию: ${s.callLink}`);
  if(s.boardLink) lines.push(`Доска: ${s.boardLink}`);
  const allFiles = materialsFor(s.id);
  if(allFiles.length){
    lines.push('Материалы к уроку:');
    allFiles.forEach(f=> lines.push(`- ${f.name ? f.name+': ' : ''}${f.url}`));
  }
  if(lines.length===0) return null;
  return `Привет, ${s.name}! Вот что нужно для занятия:\n\n${lines.join('\n')}`;
}

// ---- Прямая отправка сообщения в основной контакт (см. п.7-8 обсуждения) ----
function allStudentContacts(s){
  return [...(s.childContacts||[]), ...(s.parentContacts||[])];
}
function primaryStudentContact(s){
  const contacts = allStudentContacts(s);
  const primaryId = s.childPrimaryId || s.parentPrimaryId;
  return contacts.find(c=>c.id===primaryId) || contacts[0] || null;
}
function sendMessageToStudent(id){
  const s = data.students.find(x=>x.id===id);
  if(!s) return;
  const text = buildStudentMessage(s);
  if(!text){ showToast('Пока нет ни ссылок, ни материалов — добавь их в карточке ученика'); return; }
  const primary = primaryStudentContact(s);
  if(!primary){ showToast('Сначала добавь контакт ребёнка или родителя в карточке'); return; }
  if(primary.type === 'whatsapp'){
    window.open(`https://wa.me/${primary.value}?text=${encodeURIComponent(text)}`, '_blank');
  } else if(primary.type === 'email'){
    window.open(`mailto:${primary.value}?subject=${encodeURIComponent('Материалы к уроку')}&body=${encodeURIComponent(text)}`, '_blank');
  } else {
    try{ navigator.clipboard.writeText(text); }catch(e){}
    window.open(contactLink(primary), '_blank');
    showToast('Текст скопирован — вставь его в открывшийся чат', 'info', 6000);
  }
}
function sendContactChip(id, contactId){
  const s = data.students.find(x=>x.id===id);
  if(!s) return;
  const c = allStudentContacts(s).find(x=>x.id===contactId);
  if(!c) return;
  const text = buildStudentMessage(s);
  if(c.type === 'whatsapp' && text){
    window.open(`https://wa.me/${c.value}?text=${encodeURIComponent(text)}`, '_blank');
  } else {
    if(text){ try{ navigator.clipboard.writeText(text); }catch(e){} showToast('Текст скопирован — вставь его в открывшийся чат', 'info', 6000); }
    window.open(contactLink(c), '_blank');
  }
}

function cardHTML(s, isFirst, isLast){
    const accent = ACCENTS[s.accent] || ACCENTS[0];
    const tags = (s.subjects||[]).map(sub=>`<span class="tag">${sub.subject ? esc(sub.subject)+': ' : ''}${esc(sub.label)} · ${tariffLabel(sub)}</span>`).join('');
    const studentTheme = studentThemes[s.id];
    const themeBadge = (studentTheme && studentTheme !== 'classic' && THEMES[studentTheme])
      ? `<span style="position:absolute; bottom:-0.125rem; right:-0.125rem; width:0.5rem; height:0.5rem; border-radius:999px; background:${THEMES[studentTheme].accent}; border:1.5px solid #fff;"></span>`
      : '';
    const contacts = allStudentContacts(s);
    const primary = primaryStudentContact(s);
    const others = contacts.filter(c => !primary || c.id !== primary.id);
    if(reorderMode){
      return `
    <div class="card">
      <div class="card-head" style="background:${accent.soft};">
        <div style="position:relative; flex-shrink:0;">
          <div class="dot" style="background:${accent.ink}"></div>
        </div>
        <div style="flex:1;min-width:0;">
          <div class="name">${esc(s.name)}</div>
          <div class="meta">${esc(s.grade)} · ${esc(s.format)}</div>
        </div>
        <div style="display:flex; gap:0.25rem;">
          <button class="iconbtn" ${isFirst?'disabled style="opacity:.3;"':''} onclick="moveStudent('${s.id}',-1)">↑</button>
          <button class="iconbtn" ${isLast?'disabled style="opacity:.3;"':''} onclick="moveStudent('${s.id}',1)">↓</button>
        </div>
      </div>
    </div>`;
    }
    return `
    <div class="card">
      <div class="card-head" style="background:${accent.soft}" onclick="openEditStudentSheet('${s.id}')">
        <div style="position:relative; flex-shrink:0;">
          <div class="dot" style="background:${accent.ink}"></div>
          ${themeBadge}
        </div>
        <div style="flex:1;min-width:0;">
          <div class="name">${esc(s.name)}</div>
          <div class="meta">${esc(s.grade)} · ${esc(s.format)}</div>
        </div>
        <button class="chev">✏️</button>
      </div>
      <div class="body">
        <div class="tags">${tags}</div>
        <div class="row">
          <a class="btn ${s.callLink?'':'btn-off'}" href="${s.callLink?esc(s.callLink):'#'}" target="_blank" style="background:${s.callLink?'#1F2A3D':''};color:${s.callLink?'#fff':''}" onclick="${s.callLink?'':'return false;'}">🎥 Звонок</a>
          <a class="btn ${s.boardLink?'':'btn-off'}" href="${s.boardLink?esc(s.boardLink):'#'}" target="_blank" style="background:${s.boardLink?'#C0392B':''};color:${s.boardLink?'#fff':''}" onclick="${s.boardLink?'':'return false;'}">✏️ Доска</a>
          <button class="btn btn-done" onclick="markDone('${s.id}')">✓ Урок прошёл</button>
        </div>
        ${primary ? `
        <div style="display:flex; gap:0.375rem; margin-top:8px;">
          <button class="btn" style="flex:1;background:${accent.soft};color:${accent.ink};border:1px solid ${accent.soft};" onclick="sendMessageToStudent('${s.id}')">📨 Написать ${esc(contactLabel(primary))}</button>
          ${others.length ? `<button class="btn" style="flex:0 0 auto; width:2.5rem; background:${accent.soft};color:${accent.ink};border:1px solid ${accent.soft};" onclick="toggleOtherContactsFor('${s.id}')" title="Другие способы связи">⋯</button>` : ''}
        </div>
        ${(others.length && otherContactsOpenFor[s.id]) ? `<div class="chiprow">${others.map(c=>`<a class="chip" href="#" onclick="sendContactChip('${s.id}','${c.id}');return false;">${contactIcon(c)} ${esc(contactLabel(c))}</a>`).join('')}</div>` : ''}
        ` : `<div style="font-size:0.78125rem;color:#9BA3AE; margin-top:0.5rem;">Контакты не добавлены — открой карточку, чтобы добавить</div>`}
        ${doneMsgFor[s.id]?`<div class="msgbox"><div style="flex:1;">${esc(doneMsgFor[s.id])}</div>${s.needsPaymentReport?`<button class="iconbtn" onclick="copyText('${esc(doneMsgFor[s.id])}', this)">⧉</button>`:''}</div>`:''}
      </div>
    </div>`;
}

function renderStudentSheetInner(d){
    const accent = ACCENTS[d.accent] || ACCENTS[0];
    const savedStudent = !isNewStudentDraft ? data.students.find(x=>x.id===editingStudentId) : null;
    return `
        ${pendingSheetExit ? `
          <div style="padding:0.75rem; background:#FBEEEC; border-radius:0.625rem; margin:0.75rem 0;">
            <div style="font-size:0.8125rem; color:#7A2E1E; margin-bottom:0.5rem;">Есть несохранённые изменения. Точно выйти без сохранения?</div>
            <div style="display:flex; gap:0.375rem;">
              <button class="btn" style="flex:1; background:#C0392B; color:#fff;" onclick="closeStudentSheet()">Выйти без сохранения</button>
              <button class="btn btn-off" style="flex:1;" onclick="cancelSheetExit()">Остаться</button>
            </div>
          </div>
        ` : ''}
        ${pendingSaveWarning ? `
          <div style="padding:0.75rem; background:#FBEEEC; border-radius:0.625rem; margin:0.75rem 0;">
            <div style="font-size:0.8125rem; color:#7A2E1E; margin-bottom:0.5rem;">${esc(pendingSaveWarning)}</div>
            <div style="display:flex; gap:0.375rem;">
              <button class="btn btn-done" style="flex:1;" onclick="saveStudentDraft(true)">Сохранить всё равно</button>
              <button class="btn btn-off" style="flex:1;" onclick="pendingSaveWarning=null; refreshStudentSheet();">Отмена</button>
            </div>
          </div>
        ` : ''}
        <div class="filelabel" style="margin-top:0.75rem;">Имя</div>
        <input type="text" placeholder="Имя" value="${esc(d.firstName)}" oninput="editingStudentDraft.firstName=this.value; updateStickyPreview();" style="width:100%; font-size:0.9375rem; font-weight:600; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem;">
        <div class="filelabel">Фамилия (необязательно)</div>
        <input type="text" placeholder="Фамилия" value="${esc(d.lastName)}" oninput="editingStudentDraft.lastName=this.value; updateStickyPreview();" style="width:100%; font-size:0.8125rem; padding:0.4375rem 0.625rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.75rem;">
        <div class="filelabel">Класс</div>
        <input type="number" min="1" max="11" placeholder="например, 9" value="${esc(d.gradeNumber)}" oninput="editingStudentDraft.gradeNumber=this.value; updateStickyPreview();" style="width:100%; font-size:0.8125rem; padding:0.4375rem 0.625rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.75rem;">
        <div class="filelabel">Цвет карточки</div>
        <div style="display:flex; gap:0.375rem; flex-wrap:wrap; margin-bottom:0.625rem;">
          ${ACCENTS.map((a, i) => `<button title="${ACCENT_NAMES[i]}" onclick="editingStudentDraft.accent=${i}; refreshStudentSheet();" style="width:1.75rem; height:1.75rem; border-radius:999px; border:2px solid ${d.accent===i?'#1F2A3D':'transparent'}; background:${a.ink}; cursor:pointer; flex-shrink:0;">${d.accent===i?'<span style="color:#fff;font-size:0.75rem;">✓</span>':''}</button>`).join('')}
        </div>
        <div class="filelabel">Формат</div>
        <div style="display:flex; gap:0.375rem; margin-bottom:0.625rem;">
          <button onclick="editingStudentDraft.format='Онлайн'; refreshStudentSheet();" style="flex:1; padding:0.4375rem 0; border-radius:0.5rem; font-size:0.78125rem; font-weight:600; border:1px solid ${d.format!=='Очно'?accent.ink:'#C9D2DB'}; background:${d.format!=='Очно'?accent.soft:'#fff'}; color:${d.format!=='Очно'?accent.ink:'#8A93A0'}; cursor:pointer;">💻 Онлайн</button>
          <button onclick="editingStudentDraft.format='Очно'; refreshStudentSheet();" style="flex:1; padding:0.4375rem 0; border-radius:0.5rem; font-size:0.78125rem; font-weight:600; border:1px solid ${d.format==='Очно'?accent.ink:'#C9D2DB'}; background:${d.format==='Очно'?accent.soft:'#fff'}; color:${d.format==='Очно'?accent.ink:'#8A93A0'}; cursor:pointer;">🤝 Очно</button>
        </div>
        <div style="font-size:0.71875rem; color:#9BA3AE; margin-bottom:0.625rem;">Ссылки на звонок/доску видны всегда — если этот ученик обычно очный, но разово занимались онлайн, ссылка всё равно под рукой.</div>
        <div class="field"><span>🎥</span><input type="text" placeholder="ссылка на звонок (Зум / Телемост)" value="${esc(d.callLink)}" oninput="editingStudentDraft.callLink=this.value;"><button class="iconbtn" onclick="copyText(editingStudentDraft.callLink, this)">⧉</button></div>
        <div class="field"><span>✏️</span><input type="text" placeholder="ссылка на доску" value="${esc(d.boardLink)}" oninput="editingStudentDraft.boardLink=this.value;"><button class="iconbtn" onclick="copyText(editingStudentDraft.boardLink, this)">⧉</button></div>

        <div class="filelabel" style="margin-top:0.75rem;">Контакты ребёнка</div>
        ${studentContactGridHTML('child', d.childContacts, d.childPrimaryId)}
        <div class="filelabel" style="margin-top:0.75rem;">Контакты родителя</div>
        ${studentContactGridHTML('parent', d.parentContacts, d.parentPrimaryId)}

        <label class="checklabel"><input type="checkbox" ${d.needsPaymentReport?'checked':''} onchange="editingStudentDraft.needsPaymentReport=this.checked;"> Родителю нужно писать про оплату после урока</label>

        <div class="filelabel" style="margin-top:0.75rem;">Тарифы</div>
        ${(d.subjects||[]).length===0 ? '<div style="font-size:0.78125rem;color:#9BA3AE;margin-bottom:0.5rem;">Пока пусто</div>' : d.subjects.map(sub=>`
          <div class="filerow">
            <span>💳</span>
            <span style="flex:1; font-size:0.8125rem;">${sub.subject ? `<b>${esc(sub.subject)}:</b> ` : ''}${esc(sub.label)} · ${tariffLabel(sub)}</span>
            <button class="iconbtn" onclick="removeDraftSubject('${sub.id}')" style="border-color:#F0DAD6;background:#FBEEEC;color:#C0392B;">✕</button>
          </div>`).join('')}
        ${profileSubjects.length > 1 ? `
          <select id="draftSubjectSelect" style="width:100%; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem;">
            ${profileSubjects.map(sub=>`<option value="${esc(sub)}">${esc(sub)}</option>`).join('')}
          </select>` : ''}
        <input type="text" id="draftSubLabel" placeholder="название (напр. ОГЭ)" style="width:100%; font-size:0.78125rem; padding:0.4375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem;">
        <div style="font-size:0.71875rem; color:#8A93A0; margin-bottom:0.25rem;">Длительность, часы</div>
        <div style="display:flex; gap:0.375rem; margin-bottom:0.375rem;">
          <input type="number" step="0.5" min="0.5" id="draftSubDuration" value="1" style="width:4rem; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB;">
          <button class="mat-pill" onclick="setDraftSubjectDuration(1)">1</button>
          <button class="mat-pill" onclick="setDraftSubjectDuration(1.5)">1,5</button>
          <button class="mat-pill" onclick="setDraftSubjectDuration(2)">2</button>
        </div>
        <div style="display:flex; gap:0.375rem; margin-bottom:0.375rem;">
          <input type="number" step="1" min="0" id="draftSubPrice" placeholder="цена" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB;">
          ${profAcceptsMultiCurrency ? `
            <select id="draftSubCurrency" style="font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB;">
              ${Object.keys(CURRENCIES).map(code=>`<option value="${code}">${code} (${CURRENCIES[code]})</option>`).join('')}
            </select>
          ` : ''}
        </div>
        <button class="btn btn-done" style="width:100%;" onclick="addDraftSubject()">+ Добавить тариф</button>

        ${isNewStudentDraft ? `
          <div style="font-size:0.78125rem; color:#9BA3AE; margin:0.75rem 0; text-align:center;">Расписание, код входа и материалы откроются после первого сохранения</div>
        ` : `
          <div class="filelabel" style="margin-top:0.75rem;">Расписание</div>
          ${renderScheduleGroups(savedStudent)}
          ${renderUpcomingLessons(savedStudent)}
          <button class="btn" style="width:100%; background:#F1F3F5; color:#3A4250; margin-top:0.5rem; margin-bottom:0.75rem;" onclick="showCalendarView()">📅 Открыть общий календарь — там же можно добавить занятие</button>

          <div class="filelabel">Вход для ученика</div>
          ${confirmResetAccess ? `
            <div style="padding:0.75rem; background:#FBEEEC; border-radius:0.625rem; margin-bottom:0.5rem;">
              <div style="font-size:0.78125rem; color:#7A2E1E; margin-bottom:0.5rem;">Старый вход перестанет действовать (если ученик его найдёт — попроси не пользоваться), и создастся новый код. Точно?</div>
              <div style="display:flex; gap:0.375rem;">
                <button class="btn" style="flex:1; background:#C0392B; color:#fff;" onclick="confirmResetAndNewCode('${savedStudent.id}')">Сбросить и создать новый</button>
                <button class="btn btn-off" style="flex:1;" onclick="cancelResetAccess()">Отмена</button>
              </div>
            </div>
          ` : savedStudent.hasAccount ? `
            <div class="msgbox" style="align-items:center; background:#E2EFE6;">
              <div style="flex:1; font-size:0.8125rem; color:#1F5C3A;">✅ Уже подключён — для нового предмета этому же ученику новый код не нужен, просто добавь тариф с нужным предметом выше</div>
            </div>
            <button style="font-size:0.75rem; color:#5A6472; background:none; border:none; padding:0.25rem 0; margin-top:0.25rem; cursor:pointer; text-decoration:underline;" onclick="requestResetAccess()">Ребёнок потерял доступ — сбросить и выдать новый код</button>
          ` : savedStudent.inviteCode ? `
            <div class="msgbox" style="align-items:center;">
              <div style="flex:1;">Код: <b style="font-family:'IBM Plex Mono',monospace; font-size:1rem;">${esc(savedStudent.inviteCode)}</b><br><span style="font-size:0.71875rem; color:#8A93A0;">Пришли этот код ученику — он вводит его один раз при создании своего аккаунта</span></div>
              <button class="iconbtn" onclick="copyText('${esc(savedStudent.inviteCode)}', this)">⧉</button>
              <button class="iconbtn" onclick="revokeInviteCode('${savedStudent.id}')" style="border-color:#F0DAD6;background:#FBEEEC;color:#C0392B;">✕</button>
            </div>` : `
            <button class="btn" style="width:100%; background:#EAF0F6; color:#2C4A7C; margin-bottom:0.625rem;" onclick="generateInviteCode('${savedStudent.id}')">🔑 Создать код для входа</button>`}

          <button class="btn" style="width:100%; background:#F1F3F5; color:#3A4250; margin-top:0.375rem;" onclick="showMaterialsView('${savedStudent.id}')">📚 Материалы для ${esc(savedStudent.name)}</button>
        `}

        <div style="display:flex; gap:0.375rem; margin-top:1rem;">
          <button class="btn btn-done" style="flex:1;" onclick="saveStudentDraft(false)">💾 Сохранить</button>
          <button class="btn btn-off" style="flex:1;" onclick="requestCloseStudentSheet()">Выйти</button>
        </div>
        ${!isNewStudentDraft ? `
          <button class="btn" style="width:100%; background:#F1F3F5; color:#3A4250; margin-top:0.5rem;" onclick="archiveStudent('${editingStudentId}')">🗄 Отправить в архив (не занимаемся сейчас)</button>
          <button class="delbtn" onclick="deleteStudent('${editingStudentId}')">🗑 Удалить ученика совсем</button>
        ` : ''}
    `;
}

function renderOverviewView(){
  const students = (data.students || []).filter(s=>!s.archived);
  const online = students.filter(s=>s.format!=='Очно').length;
  const inperson = students.filter(s=>s.format==='Очно').length;
  const noAccount = students.filter(s=>!s.hasAccount);
  const grades = {};
  students.forEach(s=>{ if(s.grade) grades[s.grade] = (grades[s.grade]||0)+1; });
  const gradesLine = Object.entries(grades).map(([g,c])=>`${g} (${c})`).join(', ');
  const subjectsLine = profileSubjects.length ? profileSubjects.join(' · ') : '';

  return `
    <div class="matcard">
      <div class="filelabel">Сводка</div>
      <div style="font-size:0.9375rem; font-weight:600; margin-bottom:0.25rem;">👥 ${students.length} учеников</div>
      <div style="font-size:0.8125rem; color:#5A6472;">💻 ${online} онлайн · 🤝 ${inperson} очно</div>
      ${gradesLine ? `<div style="font-size:0.8125rem; color:#5A6472; margin-top:0.25rem;">🏷 По классам: ${esc(gradesLine)}</div>` : ''}
      ${subjectsLine ? `<div style="font-size:0.8125rem; color:#5A6472; margin-top:0.25rem;">📖 Предметы: ${esc(subjectsLine)}</div>` : ''}
    </div>

    ${(noAccount.length || (typeof getAllUnresolvedQuestions==='function' && getAllUnresolvedQuestions().length)) ? `
    <div class="matcard" style="margin-top:0.75rem;">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div class="filelabel" style="margin:0;">⚠️ Требует внимания</div>
        <button style="font-size:0.75rem; color:#5A6472; background:none; border:none; cursor:pointer; text-decoration:underline;" onclick="showIssuesView()">Открыть всё</button>
      </div>
    </div>` : ''}

    <div class="matcard" style="margin-top:0.75rem;">
      <div class="filelabel">Быстрые ссылки</div>
      <div style="display:flex; flex-direction:column; gap:0.5rem;">
        <button class="btn" style="width:100%; background:#F1F3F5; color:#3A4250; justify-content:flex-start;" onclick="showStudentsView()">👥 Все ученики</button>
        <button class="btn" style="width:100%; background:#F1F3F5; color:#3A4250; justify-content:flex-start;" onclick="showMaterialsView()">📚 Материалы</button>
        <button class="btn" style="width:100%; background:#F1F3F5; color:#3A4250; justify-content:flex-start;" onclick="showFriendsView()">🤝 Друзья</button>
        <button class="btn" style="width:100%; background:#F1F3F5; color:#3A4250; justify-content:flex-start;" onclick="showSettingsView()">⚙️ Настройки</button>
      </div>
    </div>
  `;
}
