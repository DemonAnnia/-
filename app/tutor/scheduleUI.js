// ---- Расписание — интерфейс у тьютора (движок в calendar.js) ----

// -- Ближайшие занятия на карточке ученика: перенос/отмена обычной даты --
let reschedulingLesson = null; // { studentId, date } когда открыта форма переноса

function statusLabel(l){
  if(l.status === 'pending') return `<span style="color:#B5651D;">уточняется${l.breakLabel?` (${esc(l.breakLabel)})`:''}</span>`;
  if(l.status === 'skipped') return `<span style="color:#9BA3AE;">пропущено</span>`;
  return `<span style="color:#2E7D4F;">подтверждено</span>`;
}

function renderLessonRow(s, l){
  const isReschedForm = reschedulingLesson && reschedulingLesson.studentId===s.id && reschedulingLesson.date===l.date;
  return `
    <div class="filerow" style="flex-wrap:wrap;">
      <span>📅</span>
      <span style="flex:1; font-size:0.8125rem;">${esc(l.date)} · ${esc(l.time)} — ${statusLabel(l)}</span>
      ${l.status !== 'skipped' ? `
        <button class="iconbtn" onclick="openRescheduleForm('${s.id}','${l.date}')" title="Перенести">↪️</button>
        <button class="iconbtn" onclick="cancelLessonDate('${s.id}','${l.date}')" style="border-color:#F0DAD6;background:#FBEEEC;color:#C0392B;" title="Отменить">✕</button>
      ` : ''}
    </div>
    ${isReschedForm ? `
      <div style="width:100%; display:flex; gap:0.375rem; margin:0.375rem 0; padding-left:1.5rem;">
        <input type="date" id="reschedDate-${s.id}" value="${esc(l.date)}" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB;">
        <input type="time" id="reschedTime-${s.id}" value="${esc(l.time)}" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB;">
        <button class="btn btn-done" onclick="confirmReschedule('${s.id}','${l.date}')">✓</button>
        <button class="btn btn-off" onclick="cancelRescheduleForm()">✕</button>
      </div>
    ` : ''}
  `;
}

function renderUpcomingLessons(s){
  const today = fmtDate(new Date());
  const toD = new Date(); toD.setDate(toD.getDate() + 14);
  const lessons = getLessons(s.scheduleRules||[], s.scheduleExceptions||[], s.scheduleBreaks||[], today, fmtDate(toD));
  if((s.scheduleRules||[]).length === 0) return '';
  return `
    <div class="filelabel" style="margin-top:0.75rem;">Ближайшие занятия (14 дней)</div>
    ${lessons.length === 0 ? '<div style="font-size:0.78125rem;color:#9BA3AE;margin-bottom:0.5rem;">На этот срок ничего не выпадает</div>' : lessons.map(l => renderLessonRow(s, l)).join('')}
  `;
}

function openRescheduleForm(sid, date){
  reschedulingLesson = { studentId: sid, date };
  render();
}
function cancelRescheduleForm(){
  reschedulingLesson = null;
  render();
}
function confirmReschedule(sid, originalDate){
  const newDate = document.getElementById('reschedDate-'+sid).value;
  const newTime = document.getElementById('reschedTime-'+sid).value;
  if(!newDate || !newTime){ showToast('Укажи новую дату и время'); return; }
  if(window.__fbSaveException) window.__fbSaveException(sid, originalDate, { type:'moved', newDate, newTime });
  reschedulingLesson = null;
  showToast('Перенесено', 'success', 3000);
  render();
}
function cancelLessonDate(sid, date){
  if(window.__fbSaveException) window.__fbSaveException(sid, date, { type:'cancelled' });
  showToast('Занятие отменено', 'success', 3000);
  render();
}

// -- Экран «Календарь»: каникулы (групповой ввод) + нерешённые вопросы --

let breakStudentIds = [];
function toggleBreakStudent(id){
  const i = breakStudentIds.indexOf(id);
  if(i>=0) breakStudentIds.splice(i,1); else breakStudentIds.push(id);
  render();
}

function renderBreakForm(){
  return `
    <div class="matcard">
      <div class="filelabel">Добавить каникулы</div>
      <div class="mat-picker" style="margin-bottom:0.5rem;">
        ${data.students.map(s=>`<span class="mat-pill ${breakStudentIds.includes(s.id)?'picked':''}" onclick="toggleBreakStudent('${s.id}')">${esc(s.name)}</span>`).join('')}
      </div>
      <div style="display:flex; gap:0.375rem; margin-bottom:0.375rem;">
        <input type="date" id="breakFrom" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB;">
        <input type="date" id="breakTo" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB;">
      </div>
      <input type="text" id="breakLabelInput" placeholder="подпись (например, Осенние каникулы)" style="width:100%; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem;">
      <button class="btn btn-done" style="width:100%;" onclick="submitBreakForm()">+ Добавить</button>
    </div>
  `;
}

function submitBreakForm(){
  if(breakStudentIds.length===0){ showToast('Выбери хотя бы одного ученика'); return; }
  const from = document.getElementById('breakFrom').value;
  const to = document.getElementById('breakTo').value;
  if(!from || !to){ showToast('Укажи диапазон дат'); return; }
  const label = document.getElementById('breakLabelInput').value.trim();

  const beforeLists = {};
  breakStudentIds.forEach(sid => {
    const s = data.students.find(x=>x.id===sid);
    beforeLists[sid] = getLessons(s.scheduleRules||[], s.scheduleExceptions||[], s.scheduleBreaks||[], from, to);
  });

  breakStudentIds.forEach(sid => {
    if(window.__fbSaveBreak) window.__fbSaveBreak(sid, { from, to, label: label || null });
  });

  setTimeout(() => {
    let totalNew = 0;
    breakStudentIds.forEach(sid => {
      const s = data.students.find(x=>x.id===sid);
      if(!s) return;
      const afterList = getLessons(s.scheduleRules||[], s.scheduleExceptions||[], [...(s.scheduleBreaks||[]), {from, to}], from, to);
      totalNew += countNewPendingQuestions(beforeLists[sid]||[], afterList);
    });
    if(totalNew > 0) showToast(`Появились новые вопросы по расписанию: ${totalNew}`, 'info', 6000);
  }, 1200);

  breakStudentIds = [];
  document.getElementById('breakFrom').value = '';
  document.getElementById('breakTo').value = '';
  document.getElementById('breakLabelInput').value = '';
  showToast('Каникулы добавлены', 'success', 3000);
  render();
}

function getAllUnresolvedQuestions(){
  const today = fmtDate(new Date());
  const toD = new Date(); toD.setDate(toD.getDate()+60);
  const toStr = fmtDate(toD);
  let items = [];
  (data.students||[]).filter(s=>!s.archived).forEach(s => {
    const qs = getUnresolvedQuestions(s.scheduleRules||[], s.scheduleExceptions||[], s.scheduleBreaks||[], today, toStr);
    qs.forEach(q => items.push({ ...q, studentId: s.id, studentName: s.name }));
  });
  items.sort((a,b) => a.date.localeCompare(b.date));
  return items;
}

function resolveBreakQuestion(sid, date, occurs){
  if(window.__fbSaveException) window.__fbSaveException(sid, date, { type:'breakResolution', occurs });
  showToast(occurs ? 'Отмечено: занятие было' : 'Отмечено: занятия не было', 'success', 3000);
}

// ---- Общий календарь: фильтр + сетка на месяц + ближайшее занятие + сетка на неделю ----

let calendarViewDate = new Date();
let calendarFilterValue = 'all'; // 'all' | 'student:{id}' | 'subject:{name}'
function setCalendarFilter(v){ calendarFilterValue = v; render(); }
function shiftCalendarMonth(delta){
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth()+delta, 1);
  render();
}
function mondayIndex(jsDay){ return jsDay===0 ? 6 : jsDay-1; }
function daysInMonth(year, month){ return new Date(year, month+1, 0).getDate(); }

function getFilteredLessonsInRange(dateFromStr, dateToStr){
  const students = (data.students||[]).filter(s=>!s.archived);
  let results = [];
  students.forEach(s => {
    if(calendarFilterValue.startsWith('student:') && calendarFilterValue.slice(8) !== s.id) return;
    const lessons = getLessons(s.scheduleRules||[], s.scheduleExceptions||[], s.scheduleBreaks||[], dateFromStr, dateToStr);
    lessons.forEach(l => {
      if(calendarFilterValue.startsWith('subject:')){
        const subj = calendarFilterValue.slice(8);
        const tariff = (s.subjects||[]).find(sub=>sub.id===l.subjectId);
        if(!tariff || tariff.subject !== subj) return;
      }
      results.push({ ...l, studentId: s.id, studentName: s.name, format: s.format, accent: ACCENTS[s.accent]||ACCENTS[0] });
    });
  });
  results.sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time));
  return results;
}

function renderCalendarFilterHTML(){
  const students = (data.students||[]).filter(s=>!s.archived);
  return `<select onchange="setCalendarFilter(this.value)" style="width:100%; font-size:0.8125rem; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.75rem;">
    <option value="all" ${calendarFilterValue==='all'?'selected':''}>📅 Мой общий календарь</option>
    <optgroup label="По ученику">
      ${students.map(s=>`<option value="student:${s.id}" ${calendarFilterValue==='student:'+s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
    </optgroup>
    ${profileSubjects.length > 1 ? `<optgroup label="По предмету">
      ${profileSubjects.map(subj=>`<option value="subject:${esc(subj)}" ${calendarFilterValue==='subject:'+subj?'selected':''}>${esc(subj)}</option>`).join('')}
    </optgroup>` : ''}
  </select>`;
}

function renderMonthGrid(){
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  const totalDays = daysInMonth(year, month);
  const leadingBlanks = mondayIndex(new Date(year, month, 1).getDay());
  const rangeFrom = fmtDate(new Date(year, month, 1));
  const rangeTo = fmtDate(new Date(year, month, totalDays));
  const lessons = getFilteredLessonsInRange(rangeFrom, rangeTo);
  const byDate = {};
  lessons.forEach(l => { (byDate[l.date] = byDate[l.date]||[]).push(l); });
  const todayStr = fmtDate(new Date());

  let cells = [];
  for(let i=0;i<leadingBlanks;i++) cells.push('<div class="cal-cell cal-cell-empty"></div>');
  for(let day=1; day<=totalDays; day++){
    const dateStr = fmtDate(new Date(year, month, day));
    const dayLessons = byDate[dateStr] || [];
    const isToday = dateStr === todayStr;
    cells.push(`
      <div class="cal-cell ${isToday?'cal-cell-today':''}" ${dayLessons.length?`onclick="showDayLessons('${dateStr}')"`:''}>
        <div class="cal-daynum">${day}</div>
        <div class="cal-chips">
          ${dayLessons.slice(0,4).map(l=>`<span class="cal-chip" style="background:${l.accent.ink};" title="${esc(l.studentName)} · ${esc(l.time)}">${esc((l.studentName||'?').trim().charAt(0).toUpperCase())}</span>`).join('')}
          ${dayLessons.length>4 ? `<span style="font-size:0.5rem;color:#9BA3AE;">+${dayLessons.length-4}</span>` : ''}
        </div>
      </div>`);
  }
  const trailingBlanks = (7 - (cells.length % 7)) % 7;
  for(let i=0;i<trailingBlanks;i++) cells.push('<div class="cal-cell cal-cell-empty"></div>');

  return `
    <div class="matcard">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.5rem;">
        <button class="iconbtn" onclick="shiftCalendarMonth(-1)">←</button>
        <div style="font-weight:700; text-transform:capitalize; font-size:0.9375rem;">${calendarViewDate.toLocaleDateString('ru-RU',{month:'long', year:'numeric'})}</div>
        <button class="iconbtn" onclick="shiftCalendarMonth(1)">→</button>
      </div>
      <div class="cal-grid cal-grid-header">
        ${DAY_ORDER.map(dow=>`<div class="cal-cell-label">${DAY_NAMES[dow]}</div>`).join('')}
      </div>
      <div class="cal-grid">${cells.join('')}</div>
    </div>
  `;
}

function renderNextLessonLine(){
  const now = new Date();
  const todayStr = fmtDate(now);
  const farStr = fmtDate(new Date(now.getTime() + 60*86400000));
  const lessons = getFilteredLessonsInRange(todayStr, farStr).filter(l => l.status !== 'skipped');
  const upcoming = lessons.find(l => {
    const dt = new Date(l.date + 'T' + (l.time||'00:00'));
    return dt.getTime() >= now.getTime() - 30*60000;
  });
  if(!upcoming){
    return `<div class="matcard" style="text-align:center; color:#9BA3AE; font-size:0.8125rem; margin-top:0.75rem;">Занятий не запланировано</div>`;
  }
  const dt = new Date(upcoming.date + 'T' + (upcoming.time||'00:00'));
  const diffMs = dt.getTime() - now.getTime();
  const diffHrs = diffMs/3600000;
  let whenLabel;
  if(diffHrs < 0) whenLabel = 'сейчас идёт';
  else if(diffHrs < 1) whenLabel = `через ${Math.max(1,Math.round(diffMs/60000))} мин`;
  else if(diffHrs < 24) whenLabel = `через ${Math.round(diffHrs)} ч`;
  else whenLabel = `через ${Math.round(diffHrs/24)} дн`;
  return `<div class="matcard" style="display:flex; align-items:center; gap:0.625rem; margin-top:0.75rem;">
    <span style="font-size:1.375rem;">⏰</span>
    <div style="flex:1; font-size:0.875rem;"><b>${esc(whenLabel)}</b> — ${esc(upcoming.studentName)}, ${esc(upcoming.format||'')}, ${esc(upcoming.time)}${upcoming.status==='pending'?' <span style="color:#B5651D;">(уточняется)</span>':''}</div>
  </div>`;
}

function renderWeekGrid(){
  const now = new Date();
  const monday = new Date(now); monday.setDate(now.getDate() - mondayIndex(now.getDay()));
  const days = [];
  for(let i=0;i<7;i++){ const d = new Date(monday); d.setDate(monday.getDate()+i); days.push(d); }
  const fromStr = fmtDate(days[0]);
  const toStr = fmtDate(days[6]);
  const lessons = getFilteredLessonsInRange(fromStr, toStr);
  const byDate = {};
  lessons.forEach(l => { (byDate[l.date] = byDate[l.date]||[]).push(l); });
  const todayStr = fmtDate(now);

  return `
    <div class="filelabel" style="margin-top:1rem;">Эта неделя</div>
    <div class="hide-scrollbar" style="display:flex; gap:0.5rem; overflow-x:auto; padding-bottom:0.25rem;">
      ${days.map((d,i) => {
        const dateStr = fmtDate(d);
        const dayLessons = (byDate[dateStr]||[]).sort((a,b)=>a.time.localeCompare(b.time));
        const isToday = dateStr === todayStr;
        return `<div class="matcard" style="min-width:8rem; flex-shrink:0; ${isToday?'border:1.5px solid #1F2A3D;':''}">
          <div style="font-size:0.71875rem; color:#9BA3AE; margin-bottom:0.375rem;">${DAY_NAMES[DAY_ORDER[i]]}, ${d.getDate()}</div>
          ${dayLessons.length===0 ? '<div style="font-size:0.75rem;color:#C9D2DB;">—</div>' : dayLessons.map(l=>`
            <div onclick="showDayLessons('${dateStr}')" style="display:flex; align-items:center; gap:0.375rem; padding:0.1875rem 0; cursor:pointer;">
              <span style="width:0.4375rem;height:0.4375rem;border-radius:999px;background:${l.accent.ink};flex-shrink:0;"></span>
              <span style="font-size:0.75rem;">${esc(l.time)} ${esc(l.studentName)}</span>
            </div>`).join('')}
        </div>`;
      }).join('')}
    </div>
  `;
}

function showDayLessons(dateStr){
  showToast('Подробности по дню (материалы/тема/домашка) — в следующем шаге', 'info', 4000);
}

// ---- «Добавить занятие»: отдельный экран, начинается с выбора ученика ----
let addLessonSheetOpen = false;
let addLessonStudentId = null;
let addLessonDays = [];
function openAddLessonSheet(){
  addLessonSheetOpen = true;
  addLessonStudentId = null;
  addLessonDays = [];
  render();
}
function closeAddLessonSheet(){
  addLessonSheetOpen = false;
  render();
}
function refreshAddLessonSheet(){
  if(!addLessonSheetOpen) return;
  const el = document.getElementById('addLessonSheetInner');
  if(el) el.innerHTML = renderAddLessonSheetInner();
}
function setAddLessonStudent(id){
  addLessonStudentId = id || null;
  addLessonDays = [];
  refreshAddLessonSheet();
}
function toggleAddLessonDay(dow){
  const i = addLessonDays.indexOf(dow);
  if(i>=0) addLessonDays.splice(i,1); else addLessonDays.push(dow);
  refreshAddLessonSheet();
}
async function confirmAddLesson(){
  if(!addLessonStudentId){ showToast('Выбери ученика'); return; }
  if(addLessonDays.length===0){ showToast('Выбери хотя бы один день недели'); return; }
  const time = document.getElementById('addLessonTime').value;
  if(!time){ showToast('Укажи время'); return; }
  const startEl = document.getElementById('addLessonStart');
  const startDate = startEl.value || fmtDate(new Date());
  const tariffEl = document.getElementById('addLessonTariff');
  const subjectId = tariffEl ? (tariffEl.value || null) : null;
  addLessonDays.forEach(dow => {
    if(window.__fbSaveRule) window.__fbSaveRule(addLessonStudentId, { dayOfWeek: dow, time, startDate, endDate: null, subjectId });
  });
  showToast('Добавлено в расписание', 'success', 3000);
  closeAddLessonSheet();
}
function renderAddLessonSheetInner(){
  const student = data.students.find(s=>s.id===addLessonStudentId);
  return `
      <div class="filelabel">Ученик</div>
      <select onchange="setAddLessonStudent(this.value)" style="width:100%; font-size:0.8125rem; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.75rem;">
        <option value="">— выбери —</option>
        ${(data.students||[]).filter(s=>!s.archived).map(s=>`<option value="${s.id}" ${addLessonStudentId===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
      </select>
      ${student ? `
        <div class="filelabel">Дни недели</div>
        <div style="display:flex; gap:0.25rem; margin-bottom:0.375rem;">
          ${DAY_ORDER.map(dow=>`<span class="mat-pill ${addLessonDays.includes(dow)?'picked':''}" style="flex:1; justify-content:center; padding:0.3rem 0.25rem;" onclick="toggleAddLessonDay(${dow})">${DAY_NAMES[dow]}</span>`).join('')}
        </div>
        <div style="display:flex; gap:0.375rem; margin-bottom:0.375rem;">
          <input type="time" id="addLessonTime" value="16:00" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB;">
          <input type="date" id="addLessonStart" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB;">
        </div>
        ${(student.subjects||[]).length===0 ? `
          <div style="font-size:0.78125rem; color:#9BA3AE; margin-bottom:0.5rem;">У этого ученика пока нет тарифов — можно добавить занятие без привязки к тарифу</div>
        ` : `
          <select id="addLessonTariff" style="width:100%; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.5rem;">
            <option value="">без привязки к тарифу</option>
            ${student.subjects.map(sub=>`<option value="${sub.id}">${esc(sub.label)} · ${tariffLabel(sub)}</option>`).join('')}
          </select>
        `}
        <button class="btn btn-done" style="width:100%;" onclick="confirmAddLesson()">+ Добавить в расписание</button>
      ` : ''}
  `;
}
function renderAddLessonSheet(){
  if(!addLessonSheetOpen) return '';
  return `
  <div class="mat-sheet-backdrop" onclick="closeAddLessonSheet()"></div>
  <div class="mat-sheet">
    <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1rem 0.5rem;">
      <div style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:1.0625rem;">➕ Добавить занятие</div>
      <button class="hamburger" onclick="closeAddLessonSheet()">✕</button>
    </div>
    <div id="addLessonSheetInner" style="padding:0 1rem 1.5rem;">${renderAddLessonSheetInner()}</div>
  </div>`;
}

function showCalendarView(){
  viewMode = 'calendar';
  calendarViewDate = new Date();
  closeDrawer();
  render();
}
function renderCalendarView(){
  return `
    ${renderCalendarFilterHTML()}
    ${renderNextLessonLine()}
    ${renderMonthGrid()}
    ${renderWeekGrid()}
    <div class="filelabel" style="margin-top:1rem;">Действия</div>
    <button class="btn btn-done" style="width:100%; margin-bottom:0.5rem;" onclick="openAddLessonSheet()">+ Добавить занятие</button>
    ${renderBreakForm()}
    ${renderAddLessonSheet()}
  `;
}
function updateIssuesBadge(){
  const el = document.getElementById('issuesBadge');
  if(!el) return;
  const count = getAllUnresolvedQuestions().length + (data.students||[]).filter(s=>!s.hasAccount && !s.archived).length;
  el.textContent = count > 0 ? count : '';
  el.style.display = count > 0 ? 'inline-block' : 'none';
}
