// ---- state: tabs, filters, archive ----
let matTab = 'mine'; // 'search' | 'mine' | 'friends' | 'shared'
function setMatTab(t){ matTab = t; render(); }
let matViewMode = 'list'; // 'list' | 'grid'
function setMatViewMode(mode){ matViewMode = mode; render(); }
let matSearchQuery = '';
function setMatSearchQuery(v){ matSearchQuery = v; render(); }
let matSubjectFilter = 'all';
function setMatSubjectFilter(sub){ matSubjectFilter = sub; render(); }
let matGradeFilter = 'all';
function setMatGradeFilter(g){ matGradeFilter = g; render(); }
let friendMaterials = []; // populated by module script listener

const TYPE_OPTIONS = ['ОГЭ','ЕГЭ','Методичка','Задание','ДЗ'];

// ---- state: add/edit sheet ----
let addFormOpen = false;
let editingMaterialId = null; // null = добавляем новый; иначе — id того, что редактируем
let matMode = 'link';
let matNameValue = '';
let matUrlValue = '';
let matNotesValue = '';
let matCategory = 'discuss';
let matSubject = null;
let matGrades = [];
let matTypes = [];
let matVisibleToFriendsChecked = false;
let selectedMatFile = null;

function normalizeGrades(m){ return m.grades || (m.grade ? [m.grade] : []); }

function openAddForm(){
  editingMaterialId = null;
  matMode = 'link';
  matNameValue = '';
  matUrlValue = '';
  matNotesValue = '';
  matCategory = 'discuss';
  matSubject = profileSubjects.length===1 ? profileSubjects[0] : null;
  matGrades = [];
  matTypes = [];
  selectedMatFile = null;
  materialPicker = { visibleToAll:false, onlyMe:false, studentIds:[] };
  matVisibleToFriendsChecked = (matTab === 'friends');
  addFormOpen = true;
  render();
}
function openEditForm(id){
  const m = (data.materials||[]).find(x=>x.id===id);
  if(!m) return;
  editingMaterialId = id;
  matMode = 'link';
  matNameValue = m.name || '';
  matUrlValue = m.url || '';
  matNotesValue = m.notes || '';
  matCategory = m.category || 'discuss';
  matSubject = m.subject || (profileSubjects.length===1 ? profileSubjects[0] : null);
  matGrades = normalizeGrades(m);
  matTypes = m.types || [];
  const studentIds = [...(m.studentIds||[])];
  materialPicker = { visibleToAll: !!m.visibleToAll, onlyMe: !m.visibleToAll && studentIds.length===0, studentIds };
  matVisibleToFriendsChecked = !!m.visibleToFriends;
  addFormOpen = true;
  render();
}
function closeAddForm(){ addFormOpen = false; editingMaterialId = null; render(); }

function toggleMatGrade(g){
  const i = matGrades.indexOf(g);
  if(i>=0) matGrades.splice(i,1); else matGrades.push(g);
  refreshSheet();
}
function setMatSubject(sub){ matSubject = sub; refreshSheet(); }
function setMatCategory(cat){ matCategory = cat; refreshSheet(); }
function toggleMatType(t){
  const i = matTypes.indexOf(t);
  if(i>=0) matTypes.splice(i,1); else matTypes.push(t);
  refreshSheet();
}
function setMatMode(mode){
  matMode = mode;
  selectedMatFile = null;
  refreshSheet();
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
  if(!matNameValue.trim()){
    matNameValue = file.name.replace(/\.[^.]+$/, '');
    const nameEl = document.getElementById('matNameInput');
    if(nameEl) nameEl.value = matNameValue;
  }
}

async function submitMaterialForm(){
  const name = matNameValue.trim();
  if(!materialPicker.visibleToAll && !materialPicker.onlyMe && materialPicker.studentIds.length===0){
    showToast('Выбери, кому виден материал — «Все ученики», «Только мне» или хотя бы одного конкретного');
    return;
  }
  if(profileSubjects.length > 1 && !matSubject){
    showToast('Выбери, к какому предмету относится материал');
    return;
  }
  const subject = profileSubjects.length > 1 ? matSubject : (profileSubjects[0] || null);
  const visibleToFriends = matVisibleToFriendsChecked;
  const notes = matNotesValue.trim();
  const grades = [...matGrades];
  const types = [...matTypes];
  const visibleToAll = materialPicker.visibleToAll;
  const studentIds = visibleToAll ? [] : [...materialPicker.studentIds];

  if(editingMaterialId){
    const m = (data.materials||[]).find(x=>x.id===editingMaterialId);
    if(!m){ closeAddForm(); return; }
    m.name = name || m.name;
    if(m.storage === 'external'){ m.url = matUrlValue.trim() || m.url; }
    m.category = matCategory;
    m.notes = notes;
    m.subject = subject;
    m.grades = grades;
    delete m.grade;
    m.types = types;
    m.visibleToAll = visibleToAll;
    m.studentIds = studentIds;
    m.visibleToFriends = visibleToFriends;
    if(window.__fbUpsertMaterial) window.__fbUpsertMaterial(m);
    try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch(e){}
    showToast('Сохранено', 'success', 3000);
    closeAddForm();
    return;
  }

  if(matMode === 'upload'){
    if(!selectedMatFile){ showToast('Выбери файл для загрузки'); return; }
    if(!window.__fbUploadMaterialFile){ showToast('Загрузка сейчас недоступна, попробуй позже'); return; }
    showToast('Загружаю файл…', 'info', 15000);
    try{
      const result = await window.__fbUploadMaterialFile(selectedMatFile);
      const material = {
        id: uid(), name: name || selectedMatFile.name, url: result.url,
        storage: 'timeweb', fileName: result.fileName, fileOwnerUid: window.__currentUid,
        category: matCategory, subject, grades, types, notes,
        visibleToAll, studentIds, visibleToFriends, archived: false
      };
      data.materials = [...(data.materials||[]), material];
      if(window.__fbUpsertMaterial) window.__fbUpsertMaterial(material);
      if(window.__fbRegisterFileRef) window.__fbRegisterFileRef(window.__currentUid, result.fileName);
      if(visibleToFriends && window.__fbNotifyFriendsShared) window.__fbNotifyFriendsShared();
      try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch(e){}
      showToast('Файл загружен и добавлен!', 'success', 3000);
      closeAddForm();
    }catch(e){
      showToast('Не получилось загрузить: ' + (e.message || 'ошибка сервера'));
    }
    return;
  }

  const url = matUrlValue.trim();
  if(!url){ showToast('Вставь ссылку на файл'); return; }
  const material = {
    id: uid(), name, url, storage:'external', fileName:null, fileOwnerUid:null,
    category: matCategory, subject, grades, types, notes,
    visibleToAll, studentIds, visibleToFriends, archived: false
  };
  data.materials = [...(data.materials||[]), material];
  if(window.__fbUpsertMaterial) window.__fbUpsertMaterial(material);
  if(visibleToFriends && window.__fbNotifyFriendsShared) window.__fbNotifyFriendsShared();
  try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch(e){}
  closeAddForm();
}

// ---- delete / archive ----
let confirmDeleteFor = null;

function isUsedElsewhere(m){
  return !!(m.visibleToAll || (m.studentIds||[]).length>0 || m.visibleToFriends || m.copiedFrom);
}
function requestDeleteMaterial(id){
  const m = (data.materials||[]).find(x=>x.id===id);
  if(!m) return;
  if(isUsedElsewhere(m)){
    confirmDeleteFor = id;
    render();
  } else {
    reallyDeleteMaterial(id);
  }
}
function cancelDeleteMaterial(){ confirmDeleteFor = null; render(); }

function archiveMaterial(id){
  const m = (data.materials||[]).find(x=>x.id===id);
  if(!m) return;
  m.archived = true;
  if(window.__fbUpsertMaterial) window.__fbUpsertMaterial(m);
  confirmDeleteFor = null;
  try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch(e){}
  render();
}
function restoreMaterial(id){
  const m = (data.materials||[]).find(x=>x.id===id);
  if(!m) return;
  m.archived = false;
  if(window.__fbUpsertMaterial) window.__fbUpsertMaterial(m);
  try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch(e){}
  render();
}
async function reallyDeleteMaterial(id){
  const m = (data.materials||[]).find(x=>x.id===id);
  data.materials = (data.materials||[]).filter(x=>x.id!==id);
  confirmDeleteFor = null;
  if(window.__fbDeleteMaterial) window.__fbDeleteMaterial(id);
  try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch(e){}
  render();
  // Своя запись удаляется сразу и безопасно — это не трогает физический файл.
  // Физическая уборка на Timeweb происходит отдельно, позже, когда владелец файла
  // сам зайдёт в кабинет и увидит, что счётчик ссылок дошёл до нуля (см. firebase.js).
  if(m && m.storage === 'timeweb' && window.__fbUnregisterFileRef){
    window.__fbUnregisterFileRef(m.fileOwnerUid, m.fileName);
  }
}
async function addFriendMaterialToMine(friendUid, materialId){
  if(!window.__fbCopyFriendMaterial){ showToast('Сейчас недоступно, попробуй позже'); return; }
  try{
    await window.__fbCopyFriendMaterial(friendUid, materialId);
    showToast('Добавлено себе — загляни в «Личное», настрой доступ ученикам', 'success', 5000);
  }catch(e){
    showToast(e.message || 'Не получилось добавить');
  }
}

function accessLabel(m){
  if(m.visibleToAll) return '<span class="mat-access-chip">Все ученики</span>';
  const names = (m.studentIds||[]).map(id => { const s = data.students.find(x=>x.id===id); return s ? s.name : '?'; });
  return names.length ? names.map(n=>`<span class="mat-access-chip">${esc(n)}</span>`).join('') : '<span class="mat-access-chip" style="background:#F6E4E1;color:#C0392B;">Только мне</span>';
}

// ---- picker (кому видно) — три блока: все/только мне, по классам, по именам ----
function togglePickerAll(){
  materialPicker.visibleToAll = !materialPicker.visibleToAll;
  if(materialPicker.visibleToAll) materialPicker.onlyMe = false;
  refreshSheet();
}
function togglePickerOnlyMe(){
  materialPicker.onlyMe = !materialPicker.onlyMe;
  if(materialPicker.onlyMe){ materialPicker.visibleToAll = false; materialPicker.studentIds = []; }
  refreshSheet();
}
function togglePickerStudent(id){
  materialPicker.onlyMe = false;
  materialPicker.visibleToAll = false;
  const i = materialPicker.studentIds.indexOf(id);
  if(i>=0) materialPicker.studentIds.splice(i,1); else materialPicker.studentIds.push(id);
  refreshSheet();
}
function togglePickerGrade(grade){
  materialPicker.onlyMe = false;
  materialPicker.visibleToAll = false;
  const idsForGrade = data.students.filter(s=>s.grade===grade).map(s=>s.id);
  const allSelected = idsForGrade.length>0 && idsForGrade.every(id=>materialPicker.studentIds.includes(id));
  if(allSelected){
    materialPicker.studentIds = materialPicker.studentIds.filter(id=>!idsForGrade.includes(id));
  } else {
    idsForGrade.forEach(id=>{ if(!materialPicker.studentIds.includes(id)) materialPicker.studentIds.push(id); });
  }
  refreshSheet();
}
function pickerHTML(picker, prefix){
  const allPicked = picker.visibleToAll;
  const onlyMe = !!picker.onlyMe;
  const grades = [...new Set(data.students.map(s=>s.grade).filter(Boolean))];
  return `<div class="mat-picker-group">
    <div style="display:flex; gap:0.375rem; margin-bottom:0.5rem;">
      <span class="mat-pill ${allPicked?'picked':''}" onclick="${prefix}TogglePickerAll()">👥 Все ученики</span>
      <span class="mat-pill ${onlyMe?'picked':''}" onclick="${prefix}TogglePickerOnlyMe()">🔒 Только мне</span>
    </div>
    ${grades.length ? `
    <div style="font-size:0.71875rem; color:#8A93A0; margin-bottom:0.25rem;">По классам</div>
    <div class="mat-picker" style="margin-bottom:0.5rem;">
      ${grades.map(g => {
        const idsForGrade = data.students.filter(s=>s.grade===g).map(s=>s.id);
        const allSelected = !allPicked && !onlyMe && idsForGrade.length>0 && idsForGrade.every(id=>picker.studentIds.includes(id));
        return `<span class="mat-pill ${allSelected?'picked':''}" onclick="${prefix}TogglePickerGrade('${esc(g)}')">${esc(g)}</span>`;
      }).join('')}
    </div>` : ''}
    <div style="font-size:0.71875rem; color:#8A93A0; margin-bottom:0.25rem;">По именам</div>
    <div class="mat-picker">
      ${data.students.map(s=>`<span class="mat-pill ${!allPicked && !onlyMe && picker.studentIds.includes(s.id)?'picked':''}" onclick="${prefix}TogglePickerStudent('${s.id}')">${esc(s.name)}</span>`).join('')}
    </div>
  </div>`;
}

// ---- material card ----
function materialCardHTML(m){
  const tags = [...normalizeGrades(m), ...(m.types||[])];
  return `
      <div class="matcard">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span>${materialIcon(m.url)}</span>
          <a href="${esc(m.url)}" target="_blank" style="flex:1; min-width:0; font-size:0.875rem; color:#2C4A7C; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(m.name||m.url)}</a>
          <button class="iconbtn" onclick="copyText('${esc(m.url)}', this)">⧉</button>
          <button class="iconbtn" onclick="requestDeleteMaterial('${m.id}')" style="border-color:#F0DAD6;background:#FBEEEC;color:#C0392B;">✕</button>
        </div>
        ${tags.length ? `<div style="display:flex; gap:0.25rem; flex-wrap:wrap; margin-top:0.375rem;">${tags.map(t=>`<span class="mat-access-chip">${esc(t)}</span>`).join('')}</div>` : ''}
        ${m.notes ? `<div style="font-size:0.78125rem; color:#5A6472; margin-top:0.375rem; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${esc(m.notes)}</div>` : ''}
        ${confirmDeleteFor===m.id ? `
          <div style="margin-top:0.5rem; padding:0.625rem; border-radius:0.5rem; background:#FBEEEC;">
            <div style="font-size:0.78125rem; color:#7A2E1E; margin-bottom:0.5rem;">Этот материал сейчас кому-то виден или скопирован коллегой. Удалить совсем, или просто спрятать (архивировать), не трогая тех, кто уже видит?</div>
            <div style="display:flex; gap:0.375rem;">
              <button class="btn btn-off" style="flex:1;" onclick="archiveMaterial('${m.id}')">🗄 Архивировать</button>
              <button class="btn" style="flex:1; background:#C0392B; color:#fff;" onclick="reallyDeleteMaterial('${m.id}')">Удалить всё равно</button>
              <button class="btn btn-off" style="flex:1;" onclick="cancelDeleteMaterial()">Отмена</button>
            </div>
          </div>
        ` : `
        <div style="margin-top:0.5rem;">
          <div>${accessLabel(m)}</div>
          <button style="font-size:0.75rem; color:#5A6472; background:none; border:none; padding:0.25rem 0; margin-top:0.25rem; cursor:pointer; text-decoration:underline;" onclick="openEditForm('${m.id}')">✏️ Редактировать</button>
        </div>`}
      </div>`;
}
function materialTileHTML(m){
  return `
    <div class="mat-tile" title="${esc(m.notes||m.name||'')}">
      <button class="iconbtn" onclick="event.stopPropagation(); requestDeleteMaterial('${m.id}')" style="position:absolute; top:0.25rem; right:0.25rem; width:1.375rem; height:1.375rem; font-size:0.6875rem; border-color:#F0DAD6;background:#FBEEEC;color:#C0392B;">✕</button>
      <a href="${esc(m.url)}" target="_blank" style="text-decoration:none; color:inherit; display:flex; flex-direction:column; align-items:center; gap:0.375rem;">
        <span style="font-size:1.75rem;">${materialIcon(m.url)}</span>
        <span style="font-size:0.71875rem; color:#3A4250; text-align:center; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; line-height:1.2; word-break:break-word; overflow-wrap:anywhere; width:100%;">${esc(m.name||m.url)}</span>
      </a>
      <button style="width:100%; margin-top:0.375rem; font-size:0.6875rem; color:#5A6472; background:none; border:none; padding:0.125rem 0; cursor:pointer; text-decoration:underline;" onclick="openEditForm('${m.id}')">✏️</button>
    </div>`;
}
function materialsInMode(items){
  return matViewMode === 'grid'
    ? `<div class="mat-grid">${items.map(materialTileHTML).join('')}</div>`
    : items.map(materialCardHTML).join('');
}
function viewModeToggleHTML(){
  return `<div style="display:flex; gap:0.25rem; flex-shrink:0;">
    <button onclick="setMatViewMode('list')" class="mat-pill ${matViewMode==='list'?'picked':''}" title="Список">☰</button>
    <button onclick="setMatViewMode('grid')" class="mat-pill ${matViewMode==='grid'?'picked':''}" title="Значки">▦</button>
  </div>`;
}

// ---- add/edit bottom sheet ----
function renderMaterialFormSheetInner(){
  const allGrades = [...new Set(data.students.map(s=>s.grade).filter(Boolean))];
  const isEdit = !!editingMaterialId;
  const editingUpload = isEdit && (data.materials||[]).find(x=>x.id===editingMaterialId)?.storage === 'timeweb';
  return `
      <input id="matNameInput" type="text" placeholder="название" value="${esc(matNameValue)}" oninput="matNameValue=this.value" style="width:100%; font-size:0.84375rem; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem;">
      ${!isEdit ? `
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
          <input type="text" placeholder="ссылка на файл" value="${esc(matUrlValue)}" oninput="matUrlValue=this.value" style="width:100%; font-size:0.84375rem; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem;">
        `}
      ` : (editingUpload ? '' : `
        <input type="text" placeholder="ссылка на файл" value="${esc(matUrlValue)}" oninput="matUrlValue=this.value" style="width:100%; font-size:0.84375rem; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem;">
      `)}
      <textarea placeholder="заметка / описание — необязательно" oninput="matNotesValue=this.value" style="width:100%; min-height:3.5rem; font-size:0.8125rem; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem; resize:vertical; font-family:inherit;">${esc(matNotesValue)}</textarea>
      ${allGrades.length > 0 ? `
        <div class="filelabel" style="margin-top:0.375rem;">Класс (можно несколько)</div>
        <div style="display:flex; gap:0.375rem; margin-bottom:0.375rem; flex-wrap:wrap;">
          ${allGrades.map(g=>`<button onclick="toggleMatGrade('${esc(g)}')" class="mat-pill ${matGrades.includes(g)?'picked':''}">${esc(g)}</button>`).join('')}
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
      <div class="filelabel" style="margin-top:0.375rem;">Тип (необязательно, можно несколько)</div>
      <div style="display:flex; gap:0.375rem; margin-bottom:0.375rem; flex-wrap:wrap;">
        ${TYPE_OPTIONS.map(t=>`<span class="mat-pill ${matTypes.includes(t)?'picked':''}" onclick="toggleMatType('${esc(t)}')">${esc(t)}</span>`).join('')}
      </div>
      <div class="filelabel" style="margin-top:0.375rem;">Кому видно</div>
      ${pickerHTML(materialPicker, 'window.')}
      <label style="display:flex; align-items:center; gap:0.375rem; font-size:0.75rem; color:#3A4250; margin:0.625rem 0;">
        <input type="checkbox" id="matVisibleToFriends" ${matVisibleToFriendsChecked?'checked':''} onchange="matVisibleToFriendsChecked=this.checked"> Показывать друзьям-репетиторам
      </label>
      <button class="btn btn-done" style="width:100%; margin-top:0.375rem;" onclick="submitMaterialForm()">${isEdit?'✓ Сохранить':'+ Добавить'}</button>
  `;
}
function refreshSheet(){
  if(!addFormOpen) return;
  const el = document.getElementById('matSheetInner');
  if(el) el.innerHTML = renderMaterialFormSheetInner();
  const titleEl = document.getElementById('matSheetTitle');
  if(titleEl) titleEl.textContent = editingMaterialId ? '✏️ Редактировать материал' : '➕ Новый материал';
}
function renderMaterialFormSheet(){
  if(!addFormOpen) return '';
  const isEdit = !!editingMaterialId;
  return `
  <div class="mat-sheet-backdrop" onclick="closeAddForm()"></div>
  <div class="mat-sheet">
    <div style="display:flex; align-items:center; justify-content:space-between; padding:1rem 1rem 0.5rem;">
      <div id="matSheetTitle" style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:1.0625rem;">${isEdit?'✏️ Редактировать материал':'➕ Новый материал'}</div>
      <button class="hamburger" onclick="closeAddForm()">✕</button>
    </div>
    <div id="matSheetInner" style="padding:0 1rem 1.5rem;">${renderMaterialFormSheetInner()}</div>
  </div>`;
}

// ---- main view ----
function renderMaterialsView(){
  const allGrades = [...new Set(data.students.map(s=>s.grade).filter(Boolean))];

  const applyFilters = (items) => items
    .filter(m => !m.archived)
    .filter(m => matSubjectFilter==='all' || m.subject === matSubjectFilter)
    .filter(m => matGradeFilter==='all' || normalizeGrades(m).includes(matGradeFilter))
    .filter(m => matTab!=='search' || !matSearchQuery.trim() || (m.name||'').toLowerCase().includes(matSearchQuery.trim().toLowerCase()));

  const mineList = applyFilters(data.materials || []);
  const friendsListFiltered = applyFilters(friendMaterials || []);
  const archivedList = (data.materials||[]).filter(m=>m.archived);

  const discussList = mineList.filter(m => (m.category||'discuss') === 'discuss');
  const practiceList = mineList.filter(m => m.category === 'practice');

  const groupHtml = (title, icon, items) => `
    <div class="filelabel" style="margin-top:0.75rem;">${icon} ${title}</div>
    ${items.length===0 ? '<div style="font-size:0.8125rem;color:#9BA3AE;padding:0.375rem 0;">Пока пусто</div>' : materialsInMode(items)}
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

  const tabs = [
    {id:'mine', label:'Личное'},
    {id:'friends', label:'Друзья'},
    {id:'shared', label:'Открытая библиотека'},
    {id:'search', label:'🔍 Поиск'},
    {id:'archive', label:`🗄 Архив${archivedList.length?` (${archivedList.length})`:''}`},
  ];
  const tabsHtml = `<div style="display:flex; gap:0.375rem; margin-bottom:0.75rem; align-items:center;">
    <div style="display:flex; gap:0.375rem; overflow-x:auto; flex:1;">
      ${tabs.map(t=>`<button onclick="setMatTab('${t.id}')" class="mat-pill ${matTab===t.id?'picked':''}" style="white-space:nowrap; flex-shrink:0;">${t.label}</button>`).join('')}
    </div>
    ${(matTab==='mine' || matTab==='search') ? viewModeToggleHTML() : ''}
  </div>`;

  let bodyHtml;
  if(matTab === 'shared'){
    bodyHtml = `<div style="display:flex; align-items:center; gap:0.5rem; padding:0.5rem 0.625rem; border-radius:0.625rem; background:#F1F3F5; color:#B7BEC7; font-size:0.8125rem; margin:0.75rem 0;">🌐 Открытая библиотека материалов<span style="margin-left:auto; font-size:0.6875rem; background:#fff; color:#8A93A0; padding:0.1rem 0.4rem; border-radius:999px;">скоро</span></div>`;
  } else if(matTab === 'archive'){
    bodyHtml = `
      ${archivedList.length===0 ? '<div style="font-size:0.8125rem;color:#9BA3AE;padding:0.375rem 0 0.75rem;">Пусто</div>' : archivedList.map(m => `
      <div class="matcard">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span>${materialIcon(m.url)}</span>
          <a href="${esc(m.url)}" target="_blank" style="flex:1; min-width:0; font-size:0.875rem; color:#2C4A7C; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(m.name||m.url)}</a>
        </div>
        <div style="display:flex; gap:0.375rem; margin-top:0.5rem;">
          <button class="btn btn-done" style="flex:1;" onclick="restoreMaterial('${m.id}')">↩️ Восстановить</button>
          <button class="btn" style="flex:1; background:#C0392B; color:#fff;" onclick="reallyDeleteMaterial('${m.id}')">Удалить навсегда</button>
        </div>
      </div>`).join('')}
    `;
  } else if(matTab === 'friends'){
    bodyHtml = `
      <button class="btn btn-done" style="width:100%; margin-bottom:0.75rem;" onclick="openAddForm()">+ Добавить материал</button>
      ${gradeFilterHtml}${subjectFilterHtml}
      ${friendsListFiltered.length===0 ? '<div style="font-size:0.8125rem;color:#9BA3AE;padding:0.375rem 0 0.75rem;">Пока никто ничем не поделился</div>' : friendsListFiltered.map(m => `
      <div class="matcard">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span>${materialIcon(m.url)}</span>
          <a href="${esc(m.url)}" target="_blank" style="flex:1; min-width:0; font-size:0.875rem; color:#2C4A7C; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(m.name||m.url)}</a>
        </div>
        <div style="font-size:0.71875rem; color:#9BA3AE; margin-top:0.25rem;">от ${esc(m.__friendName||'коллеги')}</div>
        <button class="btn btn-done" style="width:100%; margin-top:0.5rem;" onclick="addFriendMaterialToMine('${m.__friendUid}','${m.id}')">+ Добавить себе</button>
      </div>`).join('')}
    `;
  } else if(matTab === 'search'){
    bodyHtml = `
      <input type="text" placeholder="искать по названию…" value="${esc(matSearchQuery)}" oninput="setMatSearchQuery(this.value)" style="width:100%; font-size:0.875rem; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.75rem;">
      ${gradeFilterHtml}${subjectFilterHtml}
      ${groupHtml('Личные — Разбираем', '📖', discussList)}
      ${groupHtml('Личные — Тренируемся', '🏋️', practiceList)}
      ${friendsListFiltered.length ? groupHtml('От друзей', '🤝', friendsListFiltered) : ''}
    `;
  } else { // mine
    bodyHtml = `
      <button class="btn btn-done" style="width:100%; margin-bottom:0.75rem;" onclick="openAddForm()">+ Добавить материал</button>
      ${gradeFilterHtml}${subjectFilterHtml}
      ${groupHtml('Разбираем', '📖', discussList)}
      ${groupHtml('Тренируемся', '🏋️', practiceList)}
    `;
  }

  return `
    ${tabsHtml}
    ${bodyHtml}
    ${renderMaterialFormSheet()}
  `;
}

function showMaterialsView(studentId){
  viewMode = 'materials';
  matTab = 'mine';
  if(studentId){
    editingMaterialId = null;
    matMode = 'link';
    matNameValue = '';
    matUrlValue = '';
    matNotesValue = '';
    matCategory = 'discuss';
    matSubject = profileSubjects.length===1 ? profileSubjects[0] : null;
    matGrades = [];
    matTypes = [];
    selectedMatFile = null;
    materialPicker = { visibleToAll:false, onlyMe:false, studentIds:[studentId] };
    matVisibleToFriendsChecked = false;
    addFormOpen = true;
  } else {
    addFormOpen = false;
    editingMaterialId = null;
  }
  closeDrawer();
  render();
}

// expose picker toggles for the inline onclick handlers in pickerHTML()
window.TogglePickerAll = togglePickerAll;
window.TogglePickerOnlyMe = togglePickerOnlyMe;
window.TogglePickerStudent = togglePickerStudent;
window.TogglePickerGrade = togglePickerGrade;
