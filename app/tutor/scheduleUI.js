// ---- Расписание — интерфейс у тьютора (движок в calendar.js) ----

// -- Ближайшие занятия на карточке ученика: перенос/отмена обычной даты --
let reschedulingLesson = null; // { studentId, date } когда открыта форма переноса

function statusLabel(l){
  if(l.status === 'pending') return `<span style="color:var(--warning);">уточняется${l.breakLabel?` (${esc(l.breakLabel)})`:''}</span>`;
  if(l.status === 'skipped') return `<span style="color:var(--text-muted);">пропущено</span>`;
  return `<span style="color:var(--success);">подтверждено</span>`;
}

function renderLessonRow(s, l){
  const isReschedForm = reschedulingLesson && reschedulingLesson.studentId===s.id && reschedulingLesson.date===l.date;
  return `
    <div class="filerow" style="flex-wrap:wrap;">
      <span>📅</span>
      <span style="flex:1; font-size:0.8125rem;">${esc(fmtDateRu(l.date))} · ${esc(l.time)} — ${statusLabel(l)}</span>
      ${l.status !== 'skipped' ? `
        <button class="iconbtn" onclick="openRescheduleForm('${s.id}','${l.date}')" title="Перенести" aria-label="Перенести занятие">↪️</button>
        <button class="iconbtn" onclick="cancelLessonDate('${s.id}','${l.date}')" style="border-color:var(--danger-border);background:var(--danger-soft);color:var(--danger);" title="Отменить" aria-label="Отменить занятие">✕</button>
      ` : ''}
    </div>
    ${isReschedForm ? `
      <div style="width:100%; display:flex; gap:0.375rem; margin:0.375rem 0; padding-left:1.5rem;">
        <input type="date" id="reschedDate-${s.id}" value="${esc(l.date)}" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid var(--border);">
        <input type="time" id="reschedTime-${s.id}" value="${esc(l.time)}" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid var(--border);">
        <button class="btn btn-done" onclick="confirmReschedule('${s.id}','${l.date}')">✓</button>
        <button class="btn btn-off" onclick="cancelRescheduleForm()">✕</button>
      </div>
    ` : ''}
  `;
}

function renderUpcomingLessons(s){
  const today = fmtDate(new Date());
  const toD = new Date(); toD.setDate(toD.getDate() + 14);
  const lessons = getLessons(s.scheduleRules||[], s.scheduleExceptions||[], s.scheduleBreaks||[], today, fmtDate(toD)).filter(l => !isDayOff(l.date));
  if((s.scheduleRules||[]).length === 0) return '';
  return `
    <div class="filelabel" style="margin-top:0.75rem;">Ближайшие занятия (14 дней)</div>
    ${lessons.length === 0 ? '<div style="font-size:0.78125rem;color:var(--text-muted);margin-bottom:0.5rem;">На этот срок ничего не выпадает</div>' : lessons.map(l => renderLessonRow(s, l)).join('')}
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

// -- Экран «Календарь»: каникулы (групповой ввод, выезжающий экран) + нерешённые вопросы --

let breakSheetOpen = false;
let breakStudentIds = [];
function openBreakSheet(){
  breakSheetOpen = true;
  breakStudentIds = [];
  render();
}
function closeBreakSheet(){
  breakSheetOpen = false;
  render();
}
function refreshBreakSheet(){
  if(!breakSheetOpen) return;
  const el = document.getElementById('breakSheetInner');
  if(el) el.innerHTML = renderBreakFormInner();
}
function toggleBreakStudent(id){
  const i = breakStudentIds.indexOf(id);
  if(i>=0) breakStudentIds.splice(i,1); else breakStudentIds.push(id);
  refreshBreakSheet();
}

function renderBreakFormInner(){
  return `
      <div class="mat-picker" style="margin-bottom:0.5rem;">
        ${data.students.filter(s=>!s.archived).map(s=>`<span class="mat-pill ${breakStudentIds.includes(s.id)?'picked':''}" onclick="toggleBreakStudent('${s.id}')">${esc(s.name)}</span>`).join('')}
      </div>
      <div style="display:flex; gap:0.375rem; margin-bottom:0.375rem;">
        <input type="date" id="breakFrom" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid var(--border);">
        <input type="date" id="breakTo" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid var(--border);">
      </div>
      <input type="text" id="breakLabelInput" placeholder="подпись (например, Осенние каникулы)" style="width:100%; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid var(--border); margin-bottom:0.375rem;">
      <button class="btn btn-done" style="width:100%;" onclick="submitBreakForm()">+ Добавить</button>
  `;
}
function renderBreakSheet(){
  if(!breakSheetOpen) return '';
  return `
  <div class="mat-sheet-backdrop" onclick="closeBreakSheet()"></div>
  <div class="mat-sheet">
    <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1rem 0.5rem;">
      <div style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:1.0625rem;">🏖 Добавить каникулы</div>
      <button class="hamburger" onclick="closeBreakSheet()" aria-label="Закрыть">✕</button>
    </div>
    <div id="breakSheetInner" style="padding:0 1rem 1.5rem;">${renderBreakFormInner()}</div>
  </div>`;
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

  showToast('Каникулы добавлены', 'success', 3000);
  closeBreakSheet();
}

// -- «Мои выходные»: недоступность на диапазон дат, касается всех сразу, без уточнений --
let dayOffSheetOpen = false;
function openDayOffSheet(){
  dayOffSheetOpen = true;
  render();
}
function closeDayOffSheet(){
  dayOffSheetOpen = false;
  render();
}
function submitDayOffForm(){
  const from = document.getElementById('dayOffFrom').value;
  const to = document.getElementById('dayOffTo').value;
  if(!from || !to){ showToast('Укажи диапазон дат'); return; }
  const label = document.getElementById('dayOffLabelInput').value.trim();
  if(window.__fbSaveDayOff) window.__fbSaveDayOff({ from, to, label: label || null });
  showToast('Отмечено — занятия в эти дни у всех учеников отменены', 'success', 4000);
  closeDayOffSheet();
}
function renderDayOffSheet(){
  if(!dayOffSheetOpen) return '';
  return `
  <div class="mat-sheet-backdrop" onclick="closeDayOffSheet()"></div>
  <div class="mat-sheet">
    <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1rem 0.5rem;">
      <div style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:1.0625rem;">🚫 Отметить недоступность</div>
      <button class="hamburger" onclick="closeDayOffSheet()" aria-label="Закрыть">✕</button>
    </div>
    <div style="padding:0 1rem 1.5rem;">
      <div style="font-size:0.78125rem; color:var(--text-muted); margin-bottom:0.5rem;">Занятия у всех учеников в этот диапазон сразу считаются отменёнными — без «уточняется», решать нечего.</div>
      <div style="display:flex; gap:0.375rem; margin-bottom:0.375rem;">
        <input type="date" id="dayOffFrom" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid var(--border);">
        <input type="date" id="dayOffTo" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid var(--border);">
      </div>
      <input type="text" id="dayOffLabelInput" placeholder="подпись (необязательно, например Отпуск)" style="width:100%; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid var(--border); margin-bottom:0.5rem;">
      <button class="btn btn-done" style="width:100%;" onclick="submitDayOffForm()">+ Отметить</button>
      ${(window.__daysOff||[]).length ? `
        <div class="filelabel" style="margin-top:0.75rem;">Уже отмечено</div>
        ${window.__daysOff.map(d=>`
          <div class="filerow">
            <span>🚫</span>
            <span style="flex:1; font-size:0.8125rem;">${esc(fmtDateRu(d.from))} — ${esc(fmtDateRu(d.to))}${d.label?` · ${esc(d.label)}`:''}</span>
            <button class="iconbtn" onclick="window.__fbDeleteDayOff('${d.id}')" aria-label="Убрать выходной" style="border-color:var(--danger-border);background:var(--danger-soft);color:var(--danger);">✕</button>
          </div>`).join('')}
      ` : ''}
    </div>
  </div>`;
}

function getAllUnresolvedQuestions(){
  const today = fmtDate(new Date());
  const toD = new Date(); toD.setDate(toD.getDate()+60);
  const toStr = fmtDate(toD);
  let items = [];
  (data.students||[]).filter(s=>!s.archived).forEach(s => {
    const qs = getUnresolvedQuestions(s.scheduleRules||[], s.scheduleExceptions||[], s.scheduleBreaks||[], today, toStr).filter(q => !isDayOff(q.date));
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

function isDayOff(dateStr){
  return (window.__daysOff||[]).some(d => dateStr >= d.from && dateStr <= d.to);
}

function getFilteredLessonsInRange(dateFromStr, dateToStr){
  const students = (data.students||[]).filter(s=>!s.archived);
  let results = [];
  students.forEach(s => {
    if(calendarFilterValue.startsWith('student:') && calendarFilterValue.slice(8) !== s.id) return;
    const lessons = getLessons(s.scheduleRules||[], s.scheduleExceptions||[], s.scheduleBreaks||[], dateFromStr, dateToStr);
    lessons.forEach(l => {
      if(isDayOff(l.date)) return;
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
  return `<select onchange="setCalendarFilter(this.value)" style="width:100%; font-size:0.8125rem; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid var(--border); margin-bottom:0.75rem;">
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
    const dayOff = isDayOff(dateStr);
    cells.push(`
      <div class="cal-cell ${isToday?'cal-cell-today':''} ${dayOff?'cal-cell-dayoff':''}" style="cursor:${dayOff?'default':'pointer'};" ${dayOff?'':`onclick="${dayLessons.length?`showDayLessons('${dateStr}')`:`openAddLessonSheet('${dateStr}')`}"`}>
        <div class="cal-daynum">${day}${dayOff?' 🚫':''}</div>
        <div class="cal-chips">
          ${dayLessons.slice(0,4).map(l=>`<span class="cal-chip" style="background:${l.accent.ink};" title="${esc(l.studentName)} · ${esc(l.time)}">${esc((l.studentName||'?').trim().charAt(0).toUpperCase())}</span>`).join('')}
          ${dayLessons.length>4 ? `<span style="font-size:0.5rem;color:var(--text-muted);">+${dayLessons.length-4}</span>` : ''}
        </div>
      </div>`);
  }
  const trailingBlanks = (7 - (cells.length % 7)) % 7;
  for(let i=0;i<trailingBlanks;i++) cells.push('<div class="cal-cell cal-cell-empty"></div>');

  return `
    <div class="matcard">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.5rem;">
        <button class="iconbtn" onclick="shiftCalendarMonth(-1)" aria-label="Предыдущий месяц">←</button>
        <div style="font-weight:700; text-transform:capitalize; font-size:0.9375rem;">${calendarViewDate.toLocaleDateString('ru-RU',{month:'long', year:'numeric'})}</div>
        <button class="iconbtn" onclick="shiftCalendarMonth(1)" aria-label="Следующий месяц">→</button>
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
    return `<div class="matcard" style="text-align:center; color:var(--text-muted); font-size:0.8125rem; margin-top:0.75rem;">Занятий не запланировано</div>`;
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
    <div style="flex:1; font-size:0.875rem;"><b>${esc(whenLabel)}</b> — ${esc(upcoming.studentName)}, ${esc(upcoming.format||'')}, ${esc(upcoming.time)}${upcoming.status==='pending'?' <span style="color:var(--warning);">(уточняется)</span>':''}</div>
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
        const dayOff = isDayOff(dateStr);
        return `<div class="matcard" style="min-width:8rem; flex-shrink:0; ${dayOff?'background:var(--charcoal); color:#fff;':''} ${isToday && !dayOff?'border:1.5px solid var(--ink);':''}">
          <div style="font-size:0.71875rem; color:${dayOff?'var(--border)':'var(--text-muted)'}; margin-bottom:0.375rem;">${DAY_NAMES[DAY_ORDER[i]]}, ${d.getDate()}</div>
          ${dayOff ? '<div style="font-size:0.75rem;">🚫 Выходной</div>' : (dayLessons.length===0 ? '<div style="font-size:0.75rem;color:var(--border);">—</div>' : dayLessons.map(l=>`
            <div onclick="showDayLessons('${dateStr}')" style="display:flex; align-items:center; gap:0.375rem; padding:0.1875rem 0; cursor:pointer;">
              <span style="width:0.4375rem;height:0.4375rem;border-radius:999px;background:${l.accent.ink};flex-shrink:0;"></span>
              <span style="font-size:0.75rem;">${esc(l.time)} ${esc(l.studentName)}</span>
            </div>`).join(''))}
        </div>`;
      }).join('')}
    </div>
  `;
}

// ---- Подробности по занятию: клик по чипу/строке в календаре ----
let daySheetOpen = false;
let daySheetDate = null;
let daySheetStudentId = null; // null = список занятий этого дня; иначе — карточка конкретного занятия
let lessonNotesDraft = null;
let showRescheduleInDaySheet = false;

function showDayLessons(dateStr){
  const lessons = getFilteredLessonsInRange(dateStr, dateStr);
  if(lessons.length === 0) return;
  daySheetDate = dateStr;
  daySheetOpen = true;
  showRescheduleInDaySheet = false;
  confirmEndRecurrence = false;
  lessonNotesDraft = { topic:'', description:'', homework:'', lessonMaterialIds:[], homeworkMaterialIds:[] };
  daySheetStudentId = lessons.length === 1 ? lessons[0].studentId : null;
  render(); // создаёт обёртку — единственный раз, при первом открытии
  if(daySheetStudentId) loadLessonNotesInto(daySheetStudentId);
}
function openSpecificLessonDetail(dateStr, studentId){
  daySheetDate = dateStr;
  daySheetOpen = true;
  showRescheduleInDaySheet = false;
  confirmEndRecurrence = false;
  lessonNotesDraft = { topic:'', description:'', homework:'', lessonMaterialIds:[], homeworkMaterialIds:[] };
  daySheetStudentId = studentId;
  render();
  loadLessonNotesInto(studentId);
}
function closeDaySheet(){
  daySheetOpen = false;
  daySheetDate = null;
  daySheetStudentId = null;
  lessonNotesDraft = null;
  showRescheduleInDaySheet = false;
  confirmEndRecurrence = false;
  render();
}
function backToDayList(){
  daySheetStudentId = null;
  lessonNotesDraft = null;
  showRescheduleInDaySheet = false;
  confirmEndRecurrence = false;
  refreshDaySheet();
}
function openLessonDetail(studentId){
  // вызывается из уже открытой панели (список занятий этого дня) — обёртка уже существует, полный render() не нужен
  daySheetStudentId = studentId;
  showRescheduleInDaySheet = false;
  confirmEndRecurrence = false;
  lessonNotesDraft = { topic:'', description:'', homework:'', lessonMaterialIds:[], homeworkMaterialIds:[] };
  refreshDaySheet();
  loadLessonNotesInto(studentId);
}
async function loadLessonNotesInto(studentId){
  if(window.__fbLoadLessonNotes){
    const existing = await window.__fbLoadLessonNotes(studentId, daySheetDate);
    if(existing && daySheetStudentId === studentId){
      lessonNotesDraft = {
        topic: existing.topic||'', description: existing.description||'', homework: existing.homework||'',
        lessonMaterialIds: existing.lessonMaterialIds || existing.materialIds || [],
        homeworkMaterialIds: existing.homeworkMaterialIds || [],
      };
      refreshDaySheet();
    }
  }
}
function refreshDaySheet(){
  if(!daySheetOpen) return;
  const el = document.getElementById('daySheetInner');
  if(el) el.innerHTML = renderDaySheetInner();
}
function toggleLessonMaterial(kind, materialId, checked){
  const key = kind === 'homework' ? 'homeworkMaterialIds' : 'lessonMaterialIds';
  if(checked){ if(!lessonNotesDraft[key].includes(materialId)) lessonNotesDraft[key].push(materialId); }
  else { lessonNotesDraft[key] = lessonNotesDraft[key].filter(id=>id!==materialId); }
}
async function saveLessonNotes(){
  const topicEl = document.getElementById('lessonTopicInput');
  const descEl = document.getElementById('lessonDescInput');
  const hwEl = document.getElementById('lessonHomeworkInput');
  if(topicEl) lessonNotesDraft.topic = topicEl.value;
  if(descEl) lessonNotesDraft.description = descEl.value;
  if(hwEl) lessonNotesDraft.homework = hwEl.value;
  if(window.__fbSaveLessonNotes) await window.__fbSaveLessonNotes(daySheetStudentId, daySheetDate, lessonNotesDraft);
  showToast('Сохранено', 'success', 3000);
}
function openRescheduleFromDaySheet(){
  showRescheduleInDaySheet = true;
  refreshDaySheet();
}
function cancelRescheduleFromDaySheet(){
  showRescheduleInDaySheet = false;
  confirmEndRecurrence = false;
  refreshDaySheet();
}
function confirmRescheduleFromDaySheet(){
  const newDate = document.getElementById('daySheetReschedDate').value;
  const newTime = document.getElementById('daySheetReschedTime').value;
  if(!newDate || !newTime){ showToast('Укажи новую дату и время'); return; }
  if(window.__fbSaveException) window.__fbSaveException(daySheetStudentId, daySheetDate, { type:'moved', newDate, newTime });
  showToast('Перенесено', 'success', 3000);
  closeDaySheet();
}
function cancelLessonFromDaySheet(){
  if(window.__fbSaveException) window.__fbSaveException(daySheetStudentId, daySheetDate, { type:'cancelled' });
  showToast('Занятие отменено', 'success', 3000);
  closeDaySheet();
}
let confirmEndRecurrence = false;
function requestEndRecurrence(){
  confirmEndRecurrence = true;
  refreshDaySheet();
}
function cancelEndRecurrence(){
  confirmEndRecurrence = false;
  refreshDaySheet();
}
function confirmEndRecurrenceHere(){
  const student = data.students.find(s=>s.id===daySheetStudentId);
  const lesson = getFilteredLessonsInRange(daySheetDate, daySheetDate).find(l=>l.studentId===daySheetStudentId);
  if(!student || !lesson || lesson.source !== 'rule' || !lesson.ruleId){
    showToast('Это занятие не из регулярного правила — закончить серию тут не получится');
    return;
  }
  const rule = (student.scheduleRules||[]).find(r=>r.id===lesson.ruleId);
  if(!rule){ showToast('Не нашла правило'); return; }
  if(window.__fbSaveRule) window.__fbSaveRule(daySheetStudentId, { ...rule, endDate: daySheetDate });
  showToast('Готово — это занятие последнее в серии, дальше по этому правилу больше не будет', 'success', 5000);
  closeDaySheet();
}

function renderDaySheetInner(){
  if(!daySheetDate) return '';
  const dayLessons = getFilteredLessonsInRange(daySheetDate, daySheetDate);

  if(!daySheetStudentId){
    return `
      <div class="filelabel">Занятия ${esc(fmtDateRu(daySheetDate))}</div>
      ${dayLessons.map(l => `
        <button class="btn" style="width:100%; background:var(--surface); color:var(--text); margin-bottom:0.375rem; justify-content:flex-start;" onclick="openLessonDetail('${l.studentId}')">
          <span style="width:0.5rem;height:0.5rem;border-radius:999px;background:${l.accent.ink};margin-right:0.5rem; flex-shrink:0;"></span>
          ${esc(l.studentName)} · ${esc(l.time)}
        </button>`).join('')}
    `;
  }

  const student = data.students.find(s=>s.id===daySheetStudentId);
  const lesson = dayLessons.find(l=>l.studentId===daySheetStudentId);
  const d = lessonNotesDraft || { topic:'', description:'', homework:'', lessonMaterialIds:[], homeworkMaterialIds:[] };
  const materials = student ? materialsFor(student.id) : [];

  return `
    ${dayLessons.length > 1 ? `<button class="hamburger" onclick="backToDayList()" style="margin-bottom:0.5rem;" title="Все занятия этого дня">←</button>` : ''}
    <div style="font-weight:700; font-size:0.9375rem; margin-bottom:0.75rem;">${esc(student?student.name:'')} · ${esc(lesson?lesson.time:'')}${lesson&&lesson.status==='pending'?' <span style="color:var(--warning); font-weight:400; font-size:0.8125rem;">(уточняется)</span>':''}</div>

    <div class="filelabel">Тема занятия</div>
    <input id="lessonTopicInput" type="text" value="${esc(d.topic)}" placeholder="например, Квадратные уравнения" style="width:100%; font-size:0.8125rem; padding:0.4375rem 0.625rem; border-radius:0.5rem; border:1px solid var(--border); margin-bottom:0.5rem;">

    <div class="filelabel">Описание</div>
    <textarea id="lessonDescInput" placeholder="что разбирали, как прошло" style="width:100%; min-height:3.5rem; font-size:0.8125rem; padding:0.4375rem 0.625rem; border-radius:0.5rem; border:1px solid var(--border); margin-bottom:0.5rem; font-family:inherit; resize:vertical;">${esc(d.description)}</textarea>

    <div class="filelabel">Домашнее задание</div>
    <textarea id="lessonHomeworkInput" placeholder="что задано на дом" style="width:100%; min-height:3.5rem; font-size:0.8125rem; padding:0.4375rem 0.625rem; border-radius:0.5rem; border:1px solid var(--border); margin-bottom:0.5rem; font-family:inherit; resize:vertical;">${esc(d.homework)}</textarea>

    <div class="filelabel">Материалы к уроку</div>
    ${materials.length===0 ? '<div style="font-size:0.78125rem;color:var(--text-muted);margin-bottom:0.5rem;">У ученика пока нет материалов — добавь в разделе «Материалы»</div>' : `
      <div style="display:flex; flex-direction:column; gap:0.25rem; margin-bottom:0.5rem;">
        ${materials.map(m => `
          <label style="display:flex; align-items:center; gap:0.375rem; font-size:0.78125rem; cursor:pointer;">
            <input type="checkbox" ${d.lessonMaterialIds.includes(m.id)?'checked':''} onchange="toggleLessonMaterial('lesson','${m.id}', this.checked)">
            <span>${materialIcon(m.url)}</span> ${esc(m.name||m.url)}
          </label>`).join('')}
      </div>
    `}

    <div class="filelabel">Материалы к домашке</div>
    ${materials.length===0 ? '' : `
      <div style="display:flex; flex-direction:column; gap:0.25rem; margin-bottom:0.5rem;">
        ${materials.map(m => `
          <label style="display:flex; align-items:center; gap:0.375rem; font-size:0.78125rem; cursor:pointer;">
            <input type="checkbox" ${d.homeworkMaterialIds.includes(m.id)?'checked':''} onchange="toggleLessonMaterial('homework','${m.id}', this.checked)">
            <span>${materialIcon(m.url)}</span> ${esc(m.name||m.url)}
          </label>`).join('')}
      </div>
    `}

    <button class="btn btn-done" style="width:100%; margin-bottom:0.75rem;" onclick="saveLessonNotes()">💾 Сохранить</button>

    ${lesson && lesson.status !== 'skipped' ? `
      <div class="filelabel">Это занятие</div>
      ${confirmEndRecurrence ? `
        <div style="padding:0.625rem; background:var(--danger-soft); border-radius:0.625rem; margin-bottom:0.375rem;">
          <div style="font-size:0.78125rem; color:var(--warning-text); margin-bottom:0.5rem;">Это занятие останется последним — дальше по этому правилу занятия перестанут появляться (прошлые не трогаем). Точно?</div>
          <div style="display:flex; gap:0.375rem;">
            <button class="btn" style="flex:1; background:var(--danger); color:#fff;" onclick="confirmEndRecurrenceHere()">Да, закончить здесь</button>
            <button class="btn btn-off" style="flex:1;" onclick="cancelEndRecurrence()">Отмена</button>
          </div>
        </div>
      ` : showRescheduleInDaySheet ? `
        <div style="display:flex; gap:0.375rem; margin-bottom:0.375rem;">
          <input type="date" id="daySheetReschedDate" value="${esc(daySheetDate)}" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid var(--border);">
          <input type="time" id="daySheetReschedTime" value="${esc(lesson.time)}" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid var(--border);">
        </div>
        <div style="display:flex; gap:0.375rem;">
          <button class="btn btn-done" style="flex:1;" onclick="confirmRescheduleFromDaySheet()">✓ Перенести</button>
          <button class="btn btn-off" style="flex:1;" onclick="cancelRescheduleFromDaySheet()">Отмена</button>
        </div>
      ` : `
        <div style="display:flex; gap:0.375rem; margin-bottom:0.375rem;">
          <button class="btn" style="flex:1; background:var(--surface); color:var(--text);" onclick="openRescheduleFromDaySheet()">↪️ Перенести</button>
          <button class="btn" style="flex:1; background:var(--danger-soft); color:var(--danger);" onclick="cancelLessonFromDaySheet()">✕ Отменить</button>
        </div>
        ${lesson.source === 'rule' ? `
          <button class="btn" style="width:100%; background:var(--bg-alt); color:var(--text-secondary);" onclick="requestEndRecurrence()">🛑 Закончить серию здесь — дальше не повторять</button>
        ` : ''}
      `}
    ` : ''}
  `;
}
function renderDaySheet(){
  if(!daySheetOpen) return '';
  return `
  <div class="mat-sheet-backdrop" onclick="closeDaySheet()"></div>
  <div class="mat-sheet">
    <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1rem 0.5rem;">
      <div style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:1.0625rem;">📅 ${esc(fmtDateRu(daySheetDate)||'')}</div>
      <button class="hamburger" onclick="closeDaySheet()" aria-label="Закрыть">✕</button>
    </div>
    <div id="daySheetInner" style="padding:0 1rem 1.5rem;">${renderDaySheetInner()}</div>
  </div>`;
}

// ---- «Добавить занятие»: отдельный экран, начинается с выбора ученика ----
let addLessonSheetOpen = false;
let addLessonStudentId = null;
let addLessonRepeat = 'none'; // 'none' | 'weekly' | 'custom'
let addLessonDays = []; // используется только при repeat='custom'
let addLessonPrefilledDate = null;
function openAddLessonSheet(prefilledDate){
  addLessonSheetOpen = true;
  addLessonStudentId = null;
  addLessonRepeat = 'none';
  addLessonDays = [];
  addLessonPrefilledDate = prefilledDate || null;
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
function setAddLessonRepeat(v){
  addLessonRepeat = v;
  refreshAddLessonSheet();
}
function toggleAddLessonDay(dow){
  const i = addLessonDays.indexOf(dow);
  if(i>=0) addLessonDays.splice(i,1); else addLessonDays.push(dow);
  refreshAddLessonSheet();
}
async function confirmAddLesson(){
  if(!addLessonStudentId){ showToast('Выбери ученика'); return; }
  const time = document.getElementById('addLessonTime').value;
  if(!time){ showToast('Укажи время'); return; }
  const tariffEl = document.getElementById('addLessonTariff');
  const subjectId = tariffEl ? (tariffEl.value || null) : null;

  if(addLessonRepeat === 'custom'){
    if(addLessonDays.length===0){ showToast('Выбери хотя бы один день недели'); return; }
    const startEl = document.getElementById('addLessonStart');
    const startDate = startEl.value || fmtDate(new Date());
    addLessonDays.forEach(dow => {
      if(window.__fbSaveRule) window.__fbSaveRule(addLessonStudentId, { dayOfWeek: dow, time, startDate, endDate: null, subjectId });
    });
    showToast('Добавлено в расписание', 'success', 3000);
  } else {
    const dateEl = document.getElementById('addLessonDate');
    const dateStr = dateEl.value;
    if(!dateStr){ showToast('Укажи дату'); return; }
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    const endDate = addLessonRepeat === 'none' ? dateStr : null; // 'none' — ровно один день, 'weekly' — без конца
    if(window.__fbSaveRule) window.__fbSaveRule(addLessonStudentId, { dayOfWeek: dow, time, startDate: dateStr, endDate, subjectId });
    showToast(addLessonRepeat === 'none' ? 'Занятие добавлено' : 'Добавлено в расписание (каждую неделю)', 'success', 3000);
  }
  closeAddLessonSheet();
}
function renderAddLessonSheetInner(){
  const student = data.students.find(s=>s.id===addLessonStudentId);
  const todayStr = addLessonPrefilledDate || fmtDate(new Date());
  return `
      <div class="filelabel">Ученик</div>
      <select onchange="setAddLessonStudent(this.value)" style="width:100%; font-size:0.8125rem; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid var(--border); margin-bottom:0.75rem;">
        <option value="">— выбери —</option>
        ${(data.students||[]).filter(s=>!s.archived).map(s=>`<option value="${s.id}" ${addLessonStudentId===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
      </select>
      ${student ? `
        <div class="filelabel">Дата и время</div>
        <div style="display:flex; gap:0.375rem; margin-bottom:0.5rem;">
          ${addLessonRepeat === 'custom'
            ? `<input type="date" id="addLessonStart" value="${todayStr}" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid var(--border);">`
            : `<input type="date" id="addLessonDate" value="${todayStr}" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid var(--border);">`}
          <input type="time" id="addLessonTime" value="16:00" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid var(--border);">
        </div>

        <div class="filelabel">Повторение</div>
        <select onchange="setAddLessonRepeat(this.value)" style="width:100%; font-size:0.8125rem; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid var(--border); margin-bottom:0.5rem;">
          <option value="none" ${addLessonRepeat==='none'?'selected':''}>Не повторяется — только эта дата</option>
          <option value="weekly" ${addLessonRepeat==='weekly'?'selected':''}>Каждую неделю, в этот же день</option>
          <option value="custom" ${addLessonRepeat==='custom'?'selected':''}>Каждую неделю, выбрать дни</option>
        </select>

        ${addLessonRepeat === 'custom' ? `
          <div style="display:flex; gap:0.25rem; margin-bottom:0.5rem;">
            ${DAY_ORDER.map(dow=>`<span class="mat-pill ${addLessonDays.includes(dow)?'picked':''}" style="flex:1; justify-content:center; padding:0.3rem 0.25rem;" onclick="toggleAddLessonDay(${dow})">${DAY_NAMES[dow]}</span>`).join('')}
          </div>
        ` : ''}

        ${(student.subjects||[]).length===0 ? `
          <div style="font-size:0.78125rem; color:var(--text-muted); margin-bottom:0.5rem;">У этого ученика пока нет тарифов — можно добавить занятие без привязки к тарифу</div>
        ` : `
          <select id="addLessonTariff" style="width:100%; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid var(--border); margin-bottom:0.5rem;">
            <option value="">без привязки к тарифу</option>
            ${student.subjects.map(sub=>`<option value="${sub.id}">${esc(sub.label)} · ${tariffLabel(sub)}</option>`).join('')}
          </select>
        `}
        <button class="btn btn-done" style="width:100%;" onclick="confirmAddLesson()">+ Добавить</button>
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
      <button class="hamburger" onclick="closeAddLessonSheet()" aria-label="Закрыть">✕</button>
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
    <button class="btn" style="width:100%; background:var(--surface); color:var(--text); margin-bottom:0.5rem;" onclick="openBreakSheet()">🏖 Добавить каникулы</button>
    <button class="btn" style="width:100%; background:var(--charcoal); color:#fff;" onclick="openDayOffSheet()">🚫 Отметить недоступность</button>
    ${renderAddLessonSheet()}
    ${renderBreakSheet()}
    ${renderDayOffSheet()}
    ${renderDaySheet()}
  `;
}
function updateIssuesBadge(){
  const el = document.getElementById('issuesBadge');
  if(!el) return;
  const count = getAllUnresolvedQuestions().length + (data.students||[]).filter(s=>!s.hasAccount && !s.archived).length;
  el.textContent = count > 0 ? count : '';
  el.style.display = count > 0 ? 'inline-block' : 'none';
}
