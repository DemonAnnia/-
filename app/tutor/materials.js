let matMode = 'link';
let friendMaterials = []; // populated by module script listener
let matCategory = 'discuss';
function setMatCategory(cat){ matCategory = cat; render(); }
let matSubject = null;
function setMatSubject(sub){ matSubject = sub; render(); }
let matSubjectFilter = 'all';
function setMatSubjectFilter(sub){ matSubjectFilter = sub; render(); }
let matGrade = null;
function setMatGrade(g){ matGrade = g; render(); }
let matGradeFilter = 'all';
function setMatGradeFilter(g){ matGradeFilter = g; render(); }
let matSourceFilter = 'all'; // 'all' | 'mine' | 'friends' | 'shared'
function setMatSourceFilter(v){ matSourceFilter = v; render(); }
let selectedMatFile = null;
function setMatMode(mode){
  matMode = mode;
  selectedMatFile = null;
  render();
}

function onMatFileSelected(){
  const input = document.getElementById('matFile');
  const infoEl = document.getElementById('matFileInfo');
  const file = input.files[0];
  if(!file){ selectedMatFile = null; if(infoEl) infoEl.textContent = 'Файл не выбран'; return; }
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if(VIDEO_EXT.includes(ext)){
    showToast('Видео сюда не грузим — переключись на «Ссылка» и вставь ссылку на YouTube/облако');
    input.value = ''; selectedMatFile = null; if(infoEl) infoEl.textContent = 'Файл не выбран';
    return;
  }
  if(!ALLOWED_EXT.includes(ext)){
    showToast('Такой тип файла нельзя загрузить: .' + ext);
    input.value = ''; selectedMatFile = null; if(infoEl) infoEl.textContent = 'Файл не выбран';
    return;
  }
  if(file.size > MAX_FILE_SIZE){
    showToast('Файл слишком большой — максимум 20 МБ');
    input.value = ''; selectedMatFile = null; if(infoEl) infoEl.textContent = 'Файл не выбран';
    return;
  }
  selectedMatFile = file;
  if(infoEl) infoEl.textContent = `${file.name} · ${(file.size/1024/1024).toFixed(1)} МБ`;
  const nameEl = document.getElementById('matName');
  if(nameEl && !nameEl.value.trim()){
    nameEl.value = file.name.replace(/\.[^.]+$/, '');
  }
}

async function addMaterial(){
  const name = document.getElementById('matName').value.trim();
  if(!materialPicker.visibleToAll && materialPicker.studentIds.length===0){
    showToast('Выбери, кому виден материал — «Все ученики» или хотя бы одного конкретного');
    return;
  }
  const allGrades = [...new Set(data.students.map(s=>s.grade).filter(Boolean))];
  if(allGrades.length > 1 && !matGrade){
    showToast('Выбери, для какого класса материал');
    return;
  }
  const grade = allGrades.length > 1 ? matGrade : null;
  if(profileSubjects.length > 1 && !matSubject){
    showToast('Выбери, к какому предмету относится материал');
    return;
  }
  const subject = profileSubjects.length > 1 ? matSubject : null;
  const visibleToFriends = document.getElementById('matVisibleToFriends').checked;

  if(matMode === 'upload'){
    if(!selectedMatFile){ showToast('Выбери файл для загрузки'); return; }
    if(!window.__fbUploadMaterialFile){ showToast('Загрузка сейчас недоступна, попробуй позже'); return; }
    showToast('Загружаю файл…', 'info', 15000);
    try{
      const result = await window.__fbUploadMaterialFile(selectedMatFile);
      const material = {
        id: uid(), name: name || selectedMatFile.name, url: result.url,
        storage: 'timeweb', fileName: result.fileName, fileOwnerUid: window.__currentUid, category: matCategory, subject, grade,
        visibleToAll: materialPicker.visibleToAll, studentIds: materialPicker.visibleToAll ? [] : [...materialPicker.studentIds],
        visibleToFriends
      };
      data.materials = [...(data.materials||[]), material];
      if(window.__fbUpsertMaterial) window.__fbUpsertMaterial(material);
      document.getElementById('matName').value = '';
      selectedMatFile = null;
      materialPicker = { visibleToAll:false, studentIds:[] };
      try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch(e){}
      showToast('Файл загружен и добавлен!', 'success', 3000);
      render();
    }catch(e){
      showToast('Не получилось загрузить: ' + (e.message || 'ошибка сервера'));
    }
    return;
  }

  const url = document.getElementById('matUrl').value.trim();
  if(!url){ return; }
  const material = {
    id: uid(), name, url, storage:'external', fileName:null, fileOwnerUid:null, category: matCategory, subject, grade,
    visibleToAll: materialPicker.visibleToAll, studentIds: materialPicker.visibleToAll ? [] : [...materialPicker.studentIds],
    visibleToFriends
  };
  data.materials = [...(data.materials||[]), material];
  if(window.__fbUpsertMaterial) window.__fbUpsertMaterial(material);
  document.getElementById('matName').value = '';
  document.getElementById('matUrl').value = '';
  materialPicker = { visibleToAll:false, studentIds:[] };
  try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch(e){}
  render();
}
async function deleteMaterial(id){
  const m = (data.materials||[]).find(x=>x.id===id);
  data.materials = (data.materials||[]).filter(x=>x.id!==id);
  if(window.__fbDeleteMaterial) window.__fbDeleteMaterial(id);
  try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch(e){}
  render();
  // физический файл на Timeweb трогаем только если ЭТОТ репетитор — владелец файла.
  // Для скопированных у друга материалов fileOwnerUid принадлежит другу — тут ничего не удаляем,
  // мы только убираем свою запись, оригинал у владельца не трогаем.
  if(m && m.storage === 'timeweb' && m.fileOwnerUid === window.__currentUid && window.__fbDeleteMaterialFile){
    window.__fbDeleteMaterialFile(m.fileName).catch(() => {});
  }
}
async function addFriendMaterialToMine(friendUid, materialId){
  if(!window.__fbCopyFriendMaterial){ showToast('Сейчас недоступно, попробуй позже'); return; }
  try{
    await window.__fbCopyFriendMaterial(friendUid, materialId);
    showToast('Добавлено себе — загляни в «Личные», настрой доступ ученикам', 'success', 5000);
  }catch(e){
    showToast(e.message || 'Не получилось добавить');
  }
}
function startEditAccess(id){
  const m = (data.materials||[]).find(x=>x.id===id);
  editingAccessFor = id;
  materialPicker = { visibleToAll: !!m.visibleToAll, studentIds: [...(m.studentIds||[])] };
  render();
}
function saveEditAccess(id){
  const m = (data.materials||[]).find(x=>x.id===id);
  if(!m) return;
  m.visibleToAll = materialPicker.visibleToAll;
  m.studentIds = materialPicker.visibleToAll ? [] : [...materialPicker.studentIds];
  if(window.__fbUpsertMaterial) window.__fbUpsertMaterial(m);
  editingAccessFor = null;
  try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch(e){}
  render();
}
function cancelEditAccess(){ editingAccessFor = null; render(); }

function accessLabel(m){
  if(m.visibleToAll) return '<span class="mat-access-chip">Все ученики</span>';
  const names = (m.studentIds||[]).map(id => { const s = data.students.find(x=>x.id===id); return s ? s.name : '?'; });
  return names.length ? names.map(n=>`<span class="mat-access-chip">${esc(n)}</span>`).join('') : '<span class="mat-access-chip" style="background:#F6E4E1;color:#C0392B;">Никому не видно</span>';
}

function materialCardHTML(m){
  return `
      <div class="matcard">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span>${materialIcon(m.url)}</span>
          <a href="${esc(m.url)}" target="_blank" style="flex:1; min-width:0; font-size:0.875rem; color:#2C4A7C; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(m.name||m.url)}</a>
          <button class="iconbtn" onclick="copyText('${esc(m.url)}', this)">⧉</button>
          <button class="iconbtn" onclick="deleteMaterial('${m.id}')" style="border-color:#F0DAD6;background:#FBEEEC;color:#C0392B;">✕</button>
        </div>
        <div style="margin-top:0.5rem;">
          ${editingAccessFor===m.id ? `
            ${pickerHTML(materialPicker, 'window.')}
            <div style="display:flex; gap:0.375rem; margin-top:0.375rem;">
              <button class="btn btn-done" style="flex:1;" onclick="saveEditAccess('${m.id}')">✓ Сохранить</button>
              <button class="btn btn-off" style="flex:1;" onclick="cancelEditAccess()">Отмена</button>
            </div>
          ` : `
            <div>${accessLabel(m)}</div>
            <button style="font-size:0.75rem; color:#5A6472; background:none; border:none; padding:0.25rem 0; margin-top:0.25rem; cursor:pointer; text-decoration:underline;" onclick="startEditAccess('${m.id}')">✏️ Изменить доступ</button>
          `}
        </div>
      </div>`;
}
function renderMaterialsView(){
  const list = data.materials || [];
  const addPicker = pickerHTML(materialPicker, 'window.');
  const allGrades = [...new Set(data.students.map(s=>s.grade).filter(Boolean))];
  const filteredList = list
    .filter(m => matSubjectFilter==='all' || m.subject === matSubjectFilter)
    .filter(m => matGradeFilter==='all' || m.grade === matGradeFilter);
  const discussList = filteredList.filter(m => (m.category||'discuss') === 'discuss');
  const practiceList = filteredList.filter(m => m.category === 'practice');
  const groupHtml = (title, icon, items) => `
    <div class="filelabel" style="margin-top:0.75rem;">${icon} ${title}</div>
    ${items.length===0 ? '<div style="font-size:0.8125rem;color:#9BA3AE;padding:0.375rem 0;">Пока пусто</div>' : items.map(materialCardHTML).join('')}
  `;
  const subjectFilterHtml = profileSubjects.length > 1 ? `
    <div style="display:flex; gap:0.375rem; margin-bottom:0.5rem; flex-wrap:wrap;">
      <span class="mat-pill ${matSubjectFilter==='all'?'picked':''}" onclick="setMatSubjectFilter('all')">Все предметы</span>
      ${profileSubjects.map(sub=>`<span class="mat-pill ${matSubjectFilter===sub?'picked':''}" onclick="setMatSubjectFilter('${esc(sub)}')">${esc(sub)}</span>`).join('')}
    </div>` : '';
  const gradeFilterHtml = allGrades.length > 1 ? `
    <div style="display:flex; gap:0.375rem; margin-bottom:0.75rem; flex-wrap:wrap;">
      <span class="mat-pill ${matGradeFilter==='all'?'picked':''}" onclick="setMatGradeFilter('all')">Все классы</span>
      ${allGrades.map(g=>`<span class="mat-pill ${matGradeFilter===g?'picked':''}" onclick="setMatGradeFilter('${esc(g)}')">${esc(g)}</span>`).join('')}
    </div>` : '';

  return `
    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:1rem;">
      <button class="hamburger" onclick="showStudentsView()" title="Назад к ученикам">←</button>
      <div style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:1.0625rem;">📚 Материалы</div>
    </div>
    <div class="matcard">
      <div class="filelabel">Добавить новый материал</div>
      <input id="matName" type="text" placeholder="название" style="width:100%; font-size:0.84375rem; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem;">
      <div style="display:flex; gap:0.375rem; margin-bottom:0.375rem;">
        <button onclick="setMatMode('link')" class="mat-pill ${matMode==='link'?'picked':''}" style="flex:1; justify-content:center;">🔗 Ссылка</button>
        <button onclick="setMatMode('upload')" class="mat-pill ${matMode==='upload'?'picked':''}" style="flex:1; justify-content:center;">📁 Загрузить файл</button>
      </div>
      ${matMode==='upload' ? `
        <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
          <button type="button" onclick="document.getElementById('matFile').click()" style="padding:0.5rem 0.75rem; border-radius:0.5rem; border:1px solid #C9D2DB; background:#fff; color:#3A4250; font-size:0.78125rem; font-weight:600; cursor:pointer; white-space:nowrap;">📁 Выбрать файл</button>
          <span id="matFileInfo" style="font-size:0.78125rem; color:#9BA3AE; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Файл не выбран</span>
        </div>
        <input type="file" id="matFile" onchange="onMatFileSelected()" style="display:none;">
        <div style="font-size:0.71875rem; color:#9BA3AE; margin-bottom:0.375rem;">До 20 МБ. Видео сюда не грузим — для видео используй ссылку.</div>
      ` : `
        <input id="matUrl" type="text" placeholder="ссылка на файл" style="width:100%; font-size:0.84375rem; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem;">
      `}
      ${allGrades.length > 1 ? `
        <div class="filelabel" style="margin-top:0.375rem;">Класс</div>
        <div style="display:flex; gap:0.375rem; margin-bottom:0.375rem; flex-wrap:wrap;">
          ${allGrades.map(g=>`<button onclick="setMatGrade('${esc(g)}')" class="mat-pill ${matGrade===g?'picked':''}" style="flex:1; justify-content:center;">${esc(g)}</button>`).join('')}
        </div>
      ` : ''}
      ${profileSubjects.length > 1 ? `
        <div class="filelabel" style="margin-top:0.375rem;">Предмет</div>
        <div style="display:flex; gap:0.375rem; margin-bottom:0.375rem; flex-wrap:wrap;">
          ${profileSubjects.map(sub=>`<button onclick="setMatSubject('${esc(sub)}')" class="mat-pill ${matSubject===sub?'picked':''}" style="flex:1; justify-content:center;">${esc(sub)}</button>`).join('')}
        </div>
      ` : ''}
      <div class="filelabel" style="margin-top:0.375rem;">Категория</div>
      <div style="display:flex; gap:0.375rem; margin-bottom:0.375rem;">
        <button onclick="setMatCategory('discuss')" class="mat-pill ${matCategory==='discuss'?'picked':''}" style="flex:1; justify-content:center;">📖 Разбираем</button>
        <button onclick="setMatCategory('practice')" class="mat-pill ${matCategory==='practice'?'picked':''}" style="flex:1; justify-content:center;">🏋️ Тренируемся</button>
      </div>
      <div class="filelabel" style="margin-top:0.375rem;">Кому видно</div>
      ${addPicker}
      <label style="display:flex; align-items:center; gap:0.375rem; font-size:0.75rem; color:#3A4250; margin:0.5rem 0;">
        <input type="checkbox" id="matVisibleToFriends"> Показывать друзьям-репетиторам
      </label>
      <button class="btn btn-done" style="width:100%; margin-top:0.375rem;" onclick="addMaterial()">+ Добавить</button>
    </div>
    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem;">
      <span style="font-size:0.75rem; color:#5A6472; white-space:nowrap;">Показать:</span>
      <select onchange="setMatSourceFilter(this.value)" style="flex:1; font-size:0.8125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB;">
        <option value="all" ${matSourceFilter==='all'?'selected':''}>Все</option>
        <option value="mine" ${matSourceFilter==='mine'?'selected':''}>Личное</option>
        <option value="friends" ${matSourceFilter==='friends'?'selected':''}>Друзья</option>
        <option value="shared" ${matSourceFilter==='shared'?'selected':''}>Общее</option>
      </select>
    </div>
    ${gradeFilterHtml}
    ${subjectFilterHtml}
    ${(matSourceFilter==='all' || matSourceFilter==='mine') ? `
    <div class="filelabel" style="margin-top:1rem;">Личные</div>
    ${groupHtml('Разбираем', '📖', discussList)}
    ${groupHtml('Тренируемся', '🏋️', practiceList)}
    ` : ''}
    ${(matSourceFilter==='all' || matSourceFilter==='friends') ? `
    <div class="filelabel" style="margin-top:1rem;">От друзей</div>
    ${(() => {
      const fm = (friendMaterials||[])
        .filter(m => matSubjectFilter==='all' || m.subject===matSubjectFilter)
        .filter(m => matGradeFilter==='all' || m.grade===matGradeFilter);
      return fm.length===0 ? '<div style="font-size:0.8125rem;color:#9BA3AE;padding:0.375rem 0 0.75rem;">Пока никто ничем не поделился</div>' : fm.map(m => `
      <div class="matcard">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span>${materialIcon(m.url)}</span>
          <a href="${esc(m.url)}" target="_blank" style="flex:1; min-width:0; font-size:0.875rem; color:#2C4A7C; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(m.name||m.url)}</a>
        </div>
        <div style="font-size:0.71875rem; color:#9BA3AE; margin-top:0.25rem;">от ${esc(m.__friendName||'коллеги')}</div>
        <button class="btn btn-done" style="width:100%; margin-top:0.5rem;" onclick="addFriendMaterialToMine('${m.__friendUid}','${m.id}')">+ Добавить себе</button>
      </div>`).join(''); })()}
    ` : ''}
    ${(matSourceFilter==='all' || matSourceFilter==='shared') ? `
    <div style="display:flex; align-items:center; gap:0.5rem; padding:0.5rem 0.625rem; border-radius:0.625rem; background:#F1F3F5; color:#B7BEC7; font-size:0.8125rem; margin:0.75rem 0;">🌐 Открытая библиотека материалов<span style="margin-left:auto; font-size:0.6875rem; background:#fff; color:#8A93A0; padding:0.1rem 0.4rem; border-radius:999px;">скоро</span></div>
    ` : ''}
  `;
}

function togglePickerAll(){
  materialPicker.visibleToAll = !materialPicker.visibleToAll;
  render();
}
function togglePickerStudent(id){
  const i = materialPicker.studentIds.indexOf(id);
  if(i>=0) materialPicker.studentIds.splice(i,1); else materialPicker.studentIds.push(id);
  render();
}
function togglePickerGrade(grade){
  const idsForGrade = data.students.filter(s=>s.grade===grade).map(s=>s.id);
  const allSelected = idsForGrade.length>0 && idsForGrade.every(id=>materialPicker.studentIds.includes(id));
  if(allSelected){
    materialPicker.studentIds = materialPicker.studentIds.filter(id=>!idsForGrade.includes(id));
  } else {
    idsForGrade.forEach(id=>{ if(!materialPicker.studentIds.includes(id)) materialPicker.studentIds.push(id); });
  }
  render();
}
function pickerHTML(picker, prefix){
  const allPicked = picker.visibleToAll;
  const grades = [...new Set(data.students.map(s=>s.grade).filter(Boolean))];
  const gradeButtons = grades.map(g => {
    const idsForGrade = data.students.filter(s=>s.grade===g).map(s=>s.id);
    const allSelected = !allPicked && idsForGrade.length>0 && idsForGrade.every(id=>picker.studentIds.includes(id));
    return `<span class="mat-pill ${allSelected?'picked':''}" style="${allPicked?'opacity:.4;pointer-events:none;':''}" onclick="${prefix}TogglePickerGrade('${esc(g)}')">🏷 Все ${esc(g)}</span>`;
  }).join('');
  return `<div class="mat-picker">
    <span class="mat-pill ${allPicked?'picked':''}" onclick="${prefix}TogglePickerAll()">👥 Все ученики</span>
    ${gradeButtons}
    ${data.students.map(s=>`<span class="mat-pill ${!allPicked && picker.studentIds.includes(s.id)?'picked':''}" style="${allPicked?'opacity:.4;pointer-events:none;':''}" onclick="${prefix}TogglePickerStudent('${s.id}')">${esc(s.name)}</span>`).join('')}
  </div>`;
}

function showMaterialsView(studentId){
  viewMode = 'materials';
  editingAccessFor = null;
  materialPicker = studentId ? { visibleToAll:false, studentIds:[studentId] } : { visibleToAll:false, studentIds:[] };
  closeDrawer();
  render();
}

// expose picker toggles for the inline onclick handlers in pickerHTML()
window.TogglePickerAll = togglePickerAll;
window.TogglePickerStudent = togglePickerStudent;
window.TogglePickerGrade = togglePickerGrade;
