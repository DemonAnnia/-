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
  (data.students||[]).forEach(s => {
    const qs = getUnresolvedQuestions(s.scheduleRules||[], s.scheduleExceptions||[], s.scheduleBreaks||[], today, toStr);
    qs.forEach(q => items.push({ ...q, studentId: s.id, studentName: s.name }));
  });
  items.sort((a,b) => a.date.localeCompare(b.date));
  return items;
}

function renderUnresolvedQuestions(){
  const items = getAllUnresolvedQuestions();
  return `
    <div class="filelabel" style="margin-top:1rem;">Нерешённые вопросы</div>
    ${items.length === 0 ? '<div style="font-size:0.8125rem;color:#9BA3AE;padding:0.5rem 0;">Нерешённых вопросов нет</div>' : items.map(q => `
      <div class="matcard">
        <div style="font-size:0.8125rem;"><b>${esc(q.studentName)}</b> · ${esc(q.date)} ${esc(q.time)}${q.breakLabel?` · ${esc(q.breakLabel)}`:''}</div>
        <div style="display:flex; gap:0.375rem; margin-top:0.5rem;">
          <button class="btn btn-done" style="flex:1;" onclick="resolveBreakQuestion('${q.studentId}','${q.date}',true)">Занятие было</button>
          <button class="btn btn-off" style="flex:1;" onclick="resolveBreakQuestion('${q.studentId}','${q.date}',false)">Не было</button>
        </div>
      </div>
    `).join('')}
  `;
}
function resolveBreakQuestion(sid, date, occurs){
  if(window.__fbSaveException) window.__fbSaveException(sid, date, { type:'breakResolution', occurs });
  showToast(occurs ? 'Отмечено: занятие было' : 'Отмечено: занятия не было', 'success', 3000);
}

function showCalendarView(){
  viewMode = 'calendar';
  closeDrawer();
  render();
}
function renderCalendarView(){
  return `
    ${renderBreakForm()}
    ${renderUnresolvedQuestions()}
  `;
}
function updateCalendarBadge(){
  const el = document.getElementById('calendarBadge');
  if(!el) return;
  const count = getAllUnresolvedQuestions().length;
  el.textContent = count > 0 ? count : '';
  el.style.display = count > 0 ? 'inline-block' : 'none';
}
