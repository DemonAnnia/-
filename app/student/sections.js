let viewSection = 'lesson';
let lastStudent = null, lastMaterials = [], lastProfile = null;

function openDrawer(){ document.getElementById('drawer').classList.add('open'); document.getElementById('backdrop').classList.add('open'); }
function closeDrawer(){ document.getElementById('drawer').classList.remove('open'); document.getElementById('backdrop').classList.remove('open'); }
function showSection(section){ viewSection = section; closeDrawer(); renderStudentView(lastStudent, lastMaterials, lastProfile); }

const stubCard = (icon, text) => `<div class="card"><div class="body" style="text-align:center; padding:2rem 1rem; color:#B7BEC7;">
  <div style="font-size:2rem; margin-bottom:0.5rem;">${icon}</div>
  <div style="font-size:0.9375rem; font-weight:600; margin-bottom:0.25rem;">${text}</div>
  <div style="font-size:0.78125rem;">Скоро здесь что-то появится</div>
</div></div>`;

function renderNextLessonWidget(){
  const sched = window.__scheduleData || { rules:[], breaks:[], exceptions:[] };
  const now = new Date();
  const todayStr = fmtDate(now);
  const farStr = fmtDate(new Date(now.getTime() + 60*86400000));
  const lessons = getLessons(sched.rules, sched.exceptions, sched.breaks, todayStr, farStr).filter(l=>l.status!=='skipped');
  const upcoming = lessons.find(l => {
    const dt = new Date(l.date + 'T' + (l.time||'00:00'));
    return dt.getTime() >= now.getTime() - 30*60000;
  });
  if(!upcoming){
    return `<div style="display:flex; align-items:center; gap:0.5rem; padding:0.5rem 0.625rem; border-radius:0.625rem; background:#F1F3F5; color:#B7BEC7; font-size:0.8125rem; margin-bottom:0.75rem;">🕐 Занятий пока не запланировано</div>`;
  }
  const dt = new Date(upcoming.date + 'T' + (upcoming.time||'00:00'));
  const diffHrs = (dt.getTime() - now.getTime())/3600000;
  let whenLabel;
  if(diffHrs < 0) whenLabel = 'сейчас идёт';
  else if(diffHrs < 1) whenLabel = `через ${Math.max(1,Math.round((dt.getTime()-now.getTime())/60000))} мин`;
  else if(diffHrs < 24) whenLabel = `через ${Math.round(diffHrs)} ч`;
  else whenLabel = `через ${Math.round(diffHrs/24)} дн`;
  return `<div style="display:flex; align-items:center; gap:0.5rem; padding:0.5rem 0.625rem; border-radius:0.625rem; background:#EAF0F6; color:#2C4A7C; font-size:0.8125rem; margin-bottom:0.75rem;">
    ⏰ <b>${esc(whenLabel)}</b> — ${esc(fmtDateRu(upcoming.date))}, ${esc(upcoming.time)}${upcoming.status==='pending'?' <span style="color:#B5651D;">(уточняется)</span>':''}
  </div>`;
}

function renderLessonSection(student, materials, profile){
  const allFiles = (materials || []).filter(f => !f.archived).filter(f => !activeSubjectFilter || f.subject === activeSubjectFilter);
  const tutorName = (profile && profile.name) ? esc(profile.name) : null;
  const emptyText = tutorName
    ? `Здесь появятся материалы, как только ${tutorName} их добавит`
    : `Здесь появятся материалы, как только их добавит твой репетитор`;
  return `
    ${renderNextLessonWidget()}
    <div class="card"><div class="body">
      ${student.format!=='Очно' ? `
        <div class="row" style="margin-bottom:0.5rem;">
          <a class="btn ${student.callLink?'':'btn-off'}" href="${student.callLink?esc(student.callLink):'#'}" target="_blank" style="background:${student.callLink?'#1F2A3D':''};color:${student.callLink?'#fff':''}">🎥 Звонок</a>
          <a class="btn ${student.boardLink?'':'btn-off'}" href="${student.boardLink?esc(student.boardLink):'#'}" target="_blank" style="background:${student.boardLink?'#C0392B':''};color:${student.boardLink?'#fff':''}">✏️ Доска</a>
        </div>` : `<div style="font-size:0.8125rem; color:#5A6472; margin-bottom:0.75rem;">Занятие очное — увидимся на месте 🤝</div>`}
      <div class="filelabel">Материалы к уроку</div>
      ${allFiles.length===0 ? `
        <div style="text-align:center; padding:1.25rem 0.5rem; color:#B7BEC7;">
          <div style="font-size:1.75rem; margin-bottom:0.375rem;">🗂️</div>
          <div style="font-size:0.8125rem;">${emptyText}</div>
        </div>` : (() => {
          const discussList = allFiles.filter(f => (f.category||'discuss') === 'discuss');
          const practiceList = allFiles.filter(f => f.category === 'practice');
          const row = f => `<div class="filerow"><span>${materialIcon(f.url)}</span><a href="${esc(f.url)}" target="_blank">${esc(f.name||f.url)}</a></div>`;
          let out = '';
          if(discussList.length){ out += `<div style="font-size:0.71875rem; font-weight:700; color:#8A93A0; text-transform:uppercase; letter-spacing:.4px; margin:0.5rem 0 0.25rem;">📖 Разбираем</div>` + discussList.map(row).join(''); }
          if(practiceList.length){ out += `<div style="font-size:0.71875rem; font-weight:700; color:#8A93A0; text-transform:uppercase; letter-spacing:.4px; margin:0.5rem 0 0.25rem;">🏋️ Тренируемся</div>` + practiceList.map(row).join(''); }
          return out;
        })()}
    </div></div>`;
}

function renderTutorSection(profile){
  const p = profile || {};
  if(!p.name){
    return `<div class="card"><div class="body" style="text-align:center; padding:2rem 1rem; color:#9BA3AE;">Репетитор пока не заполнил профиль</div></div>`;
  }
  const contacts = p.contacts || [];
  const primary = contacts.find(c => c.id === p.primaryContactId) || contacts[0];
  const others = contacts.filter(c => c !== primary);
  return `
    <div class="card"><div class="body">
      <div style="font-size:0.71875rem; font-weight:700; color:#8A93A0; text-transform:uppercase; letter-spacing:.4px; margin-bottom:0.375rem;">Репетитор</div>
      <div style="font-weight:600; font-size:1rem;">${esc(p.name)}</div>
      ${p.showSubject && ((p.subjects && p.subjects.length) || p.subject) ? `<div style="font-size:0.8125rem; color:#5A6472; margin-top:0.125rem;">${esc((p.subjects && p.subjects.length ? p.subjects : [p.subject]).join(' · '))}</div>` : ''}
      ${p.showContacts && primary ? `
        <a href="${contactLink(primary)}" target="_blank" title="${esc(contactLink(primary))}" style="display:flex; align-items:center; justify-content:center; gap:0.5rem; margin-top:0.875rem; padding:0.625rem 0; border-radius:0.625rem; background:#1F2A3D; color:#fff; font-weight:600; font-size:0.875rem; text-decoration:none;">
          ${contactIcon(primary)} ${contactAction(primary)}
        </a>` : ''}
      ${p.showContacts && others.length ? `
        <div style="text-align:center; margin-top:0.5rem;">
          <a href="#" onclick="toggleOtherContacts();return false;" style="font-size:0.75rem; color:#5A6472;">другие способы связи</a>
        </div>
        <div id="otherContacts" style="display:${otherContactsOpen?'block':'none'}; margin-top:0.5rem;">
          <div style="display:flex; flex-wrap:wrap; gap:0.375rem; justify-content:center;">
            ${others.map(c=>`<a href="${contactLink(c)}" target="_blank" title="${esc(contactLink(c))}" style="display:inline-flex; align-items:center; gap:0.3rem; padding:0.3rem 0.625rem; border-radius:999px; font-size:0.75rem; font-weight:600; background:#EAF0F6; color:#2C4A7C; text-decoration:none;">${contactIcon(c)} ${contactLabel(c)}</a>`).join('')}
          </div>
        </div>` : ''}
    </div></div>`;
}

function renderSettingsSection(){
  return `
    <div class="card"><div class="body">
      <div class="filelabel">Моя тема</div>
      <div id="themePicker">${themePickerHTML()}</div>
    </div></div>
    <div class="card" style="margin-top:0.75rem;"><div class="body">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div class="filelabel" style="margin:0;">Пароль</div>
        <a href="#" onclick="toggleAccountPanel();return false;" style="font-size:0.78125rem; color:#5A6472;">Сменить</a>
      </div>
      <div id="accountPanel" style="display:${accountPanelOpen?'block':'none'}; margin-top:0.625rem;">
        <div style="font-size:0.78125rem; color:#5A6472; margin-bottom:0.625rem;">Чтобы сменить пароль, подтверди текущим</div>
        <input id="accCurPass" type="password" placeholder="текущий пароль" style="width:100%; font-size:0.84375rem; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.5rem;">
        <input id="accNewPass" type="password" placeholder="новый пароль (мин. 6 символов)" style="width:100%; font-size:0.84375rem; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.5rem;">
        <button onclick="changePassword()" style="width:100%; padding:0.5rem 0; border-radius:0.625rem; border:none; background:#1F2A3D; color:#fff; font-weight:600; font-size:0.8125rem; cursor:pointer;">Сменить пароль</button>
      </div>
    </div></div>
    <div class="card" style="margin-top:0.75rem;"><div class="body">
      <div class="filelabel">Добавиться к новому репетитору</div>
      <div style="font-size:0.75rem; color:#9BA3AE; margin-bottom:0.5rem;">Если занимаешься ещё с кем-то — впиши код, который он тебе даст</div>
      <div style="display:flex; gap:0.375rem;">
        <input id="newTutorCode" type="text" placeholder="код репетитора" style="flex:1; font-size:0.84375rem; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid #C9D2DB; text-transform:uppercase;">
        <button onclick="addTutorByCode()" style="padding:0 1rem; border-radius:0.625rem; border:none; background:#1F2A3D; color:#fff; font-weight:600; font-size:0.8125rem; cursor:pointer;">Добавить</button>
      </div>
    </div></div>`;
}

