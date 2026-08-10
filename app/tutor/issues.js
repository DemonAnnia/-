// ---- Нерешённые вопросы: общий хаб «требует внимания» ----
// Собирает: вопросы календаря (каникулы без решения) + учеников без входа.
// Задел на будущее: сюда же со временем могут добраться другие типы проблем.

function showIssuesView(){
  viewMode = 'issues';
  closeDrawer();
  render();
}

function renderIssuesView(){
  const scheduleIssues = getAllUnresolvedQuestions();
  const noAccountStudents = (data.students||[]).filter(s=>!s.hasAccount && !s.archived);

  const scheduleBlock = `
    <div class="filelabel" style="margin-top:0.75rem;">Расписание</div>
    ${scheduleIssues.length === 0 ? '<div style="font-size:0.8125rem;color:#9BA3AE;padding:0.5rem 0;">Тут пусто</div>' : scheduleIssues.map(q => `
      <div class="matcard">
        <div style="font-size:0.8125rem;"><b>${esc(q.studentName)}</b> · ${esc(fmtDateRu(q.date))} ${esc(q.time)}${q.breakLabel?` · ${esc(q.breakLabel)}`:''}</div>
        <div style="display:flex; gap:0.375rem; margin-top:0.5rem;">
          <button class="btn btn-done" style="flex:1;" onclick="resolveBreakQuestion('${q.studentId}','${q.date}',true)">Занятие было</button>
          <button class="btn btn-off" style="flex:1;" onclick="resolveBreakQuestion('${q.studentId}','${q.date}',false)">Не было</button>
        </div>
      </div>
    `).join('')}
  `;

  const accessBlock = `
    <div class="filelabel" style="margin-top:1rem;">Ученики без входа</div>
    ${noAccountStudents.length === 0 ? '<div style="font-size:0.8125rem;color:#9BA3AE;padding:0.5rem 0;">Тут пусто</div>' : noAccountStudents.map(s => `
      <div class="matcard">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span>🔑</span>
          <span style="flex:1; font-size:0.8125rem;">${esc(s.name)}${s.inviteCode ? ' — код уже создан, ждём, когда введёт' : ' — код ещё не создан'}</span>
          <button style="font-size:0.75rem; color:#5A6472; background:none; border:none; cursor:pointer; text-decoration:underline; flex-shrink:0;" onclick="openEditStudentSheet('${s.id}')">открыть</button>
        </div>
      </div>
    `).join('')}
  `;

  const totalCount = scheduleIssues.length + noAccountStudents.length;

  return `
    ${totalCount === 0 ? `
      <div class="matcard" style="text-align:center; padding:1.5rem 1rem; color:#5A6472;">
        <div style="font-size:1.5rem; margin-bottom:0.375rem;">🎉</div>
        <div style="font-size:0.875rem;">Всё решено, вопросов нет</div>
      </div>
    ` : `${scheduleBlock}${accessBlock}`}
  `;
}

// ---- Общий Архив: ученики + материалы, каждый раздел показывается только если непустой ----
function showArchiveView(){
  viewMode = 'archive';
  closeDrawer();
  render();
}
function renderArchiveView(){
  const archivedStudents = (data.students||[]).filter(s=>s.archived);
  const archivedMaterials = (data.materials||[]).filter(m=>m.archived);
  if(archivedStudents.length===0 && archivedMaterials.length===0){
    return '<div class="matcard" style="text-align:center; color:#9BA3AE; padding:1.5rem 1rem;">Архив пуст</div>';
  }
  return `
    ${archivedStudents.length ? `
      <div class="filelabel">Ученики</div>
      ${archivedStudents.map(s=>`
        <div class="matcard" style="margin-bottom:0.5rem;">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span>🗄</span>
            <span style="flex:1; font-size:0.875rem;">${esc(s.name)}</span>
            <button class="btn btn-done" onclick="restoreStudentFromArchive('${s.id}')">↩️ Вернуть</button>
          </div>
        </div>`).join('')}
    ` : ''}
    ${archivedMaterials.length ? `
      <div class="filelabel" style="margin-top:${archivedStudents.length?'1rem':'0'};">Материалы</div>
      ${archivedMaterials.map(m=>`
        <div class="matcard" style="margin-bottom:0.5rem;">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span>${materialIcon(m.url)}</span>
            <a href="${esc(m.url)}" target="_blank" style="flex:1; min-width:0; font-size:0.875rem; color:#2C4A7C; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(m.name||m.url)}</a>
          </div>
          <div style="display:flex; gap:0.375rem; margin-top:0.5rem;">
            <button class="btn btn-done" style="flex:1;" onclick="restoreMaterial('${m.id}')">↩️ Восстановить</button>
            <button class="btn" style="flex:1; background:#C0392B; color:#fff;" onclick="reallyDeleteMaterial('${m.id}')">Удалить навсегда</button>
          </div>
        </div>`).join('')}
    ` : ''}
  `;
}
