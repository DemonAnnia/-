let allTutorLinks = []; // [{tutorUid, studentId, tutorName, subjectFilter, label}]
let activeLinkIndex = 0;
let activeSubjectFilter = null;
function renderTutorSwitcher(){
  const el = document.getElementById('tutorSwitcher');
  if(!el) return;
  if(allTutorLinks.length <= 1){ el.innerHTML = ''; return; }
  el.innerHTML = `<div style="display:flex; gap:0.375rem; flex-wrap:wrap;">
    ${allTutorLinks.map((l,i) => `<button onclick="switchTutorLink(${i})" style="padding:0.375rem 0.75rem; border-radius:999px; border:1px solid ${i===activeLinkIndex?'var(--ink)':'var(--border)'}; background:${i===activeLinkIndex?'var(--ink)':'#fff'}; color:${i===activeLinkIndex?'#fff':'var(--text-secondary)'}; font-size:0.78125rem; font-weight:600; cursor:pointer;">Ты у ${esc(l.label || 'репетитора')}</button>`).join('')}
  </div>`;
}
function switchTutorLink(i){
  if(i === activeLinkIndex) return;
  const link = allTutorLinks[i];
  const prev = allTutorLinks[activeLinkIndex];
  activeLinkIndex = i;
  activeSubjectFilter = link.subjectFilter;
  if(!prev || prev.tutorUid !== link.tutorUid || prev.studentId !== link.studentId){
    if(window.__fbSwitchTutor) window.__fbSwitchTutor(link);
  } else {
    renderStudentView(lastStudent, lastMaterials, lastProfile);
  }
  renderTutorSwitcher();
}
async function addTutorByCode(){
  const input = document.getElementById('newTutorCode');
  const code = input.value.trim().toUpperCase();
  if(!code){ showToast('Впиши код'); return; }
  if(!window.__fbAddTutorByCode){ showToast('Сейчас недоступно, попробуй позже'); return; }
  try{
    await window.__fbAddTutorByCode(code);
    showToast('Добавлено! Переключись сверху, чтобы посмотреть', 'success', 5000);
    input.value = '';
  }catch(e){
    showToast(e.message || 'Не получилось добавить — проверь код');
  }
}

