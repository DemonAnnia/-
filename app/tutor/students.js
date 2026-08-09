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
}

function addStudent(){
  data.students.push({id:uid(), name:'Новый ученик', grade:'', format:'Онлайн',
    accent: data.students.length % ACCENTS.length, messengers:[], boardLink:'', callLink:'',
    needsPaymentReport:true, subjects:[], files:[]});
  save();
}
let messengerAddKind = {}; // studentId -> 'child'|'parent', default 'child'
function setMessengerKind(sid, kind){ messengerAddKind[sid] = kind; render(); }
function groupMessengers(messengers){
  const child = [], parent = [];
  (messengers||[]).forEach(m => (m.for === 'parent' ? parent : child).push(m));
  return { child, parent };
}
function addMessenger(id){
  const s = data.students.find(x=>x.id===id);
  const labelEl = document.getElementById('mlabel-'+id);
  const urlEl = document.getElementById('murl-'+id);
  if(!urlEl.value) return;
  s.messengers.push({id:uid(), label:labelEl.value, url:urlEl.value, for: messengerAddKind[id] || 'child'});
  labelEl.value=''; urlEl.value='';
  save();
}
function removeMessenger(sid, mid){
  const s = data.students.find(x=>x.id===sid);
  s.messengers = s.messengers.filter(m=>m.id!==mid);
  save();
}
function addSubject(id){
  const s = data.students.find(x=>x.id===id);
  const labelEl = document.getElementById('sublabel-'+id);
  const priceEl = document.getElementById('subprice-'+id);
  const subjectEl = document.getElementById('subsubject-'+id);
  if(!labelEl.value.trim()) { showToast('Впиши название тарифа'); return; }
  if(!Array.isArray(s.subjects)) s.subjects = [];
  s.subjects.push({ id: uid(), label: labelEl.value.trim(), price: priceEl.value.trim(), subject: subjectEl ? subjectEl.value : null });
  labelEl.value=''; priceEl.value='';
  save();
}
function removeSubject(sid, subId){
  const s = data.students.find(x=>x.id===sid);
  s.subjects = (s.subjects||[]).filter(sub=>sub.id!==subId);
  save();
}

// ---- Расписание: панель на карточке ученика (см. calendar-architecture.md, раздел 2) ----
const DAY_NAMES = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
let scheduleAddDays = {}; // studentId -> [dayOfWeek,...]

function toggleScheduleDay(sid, dow){
  const cur = scheduleAddDays[sid] || [];
  scheduleAddDays[sid] = cur.includes(dow) ? cur.filter(d=>d!==dow) : [...cur, dow];
  render();
}
function focusTariffInput(sid){
  const el = document.getElementById('sublabel-'+sid);
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
    const daysLabel = g.days.slice().sort().map(d=>DAY_NAMES[d]).join(', ');
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
  render();
}
function deleteScheduleGroup(sid, ruleIdsJoined){
  ruleIdsJoined.split(',').forEach(ruleId => {
    if(window.__fbDeleteRule) window.__fbDeleteRule(sid, ruleId);
  });
}

let studentSubjectFilter = 'all';
function setStudentSubjectFilter(v){ studentSubjectFilter = v; render(); }

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

let studentMsgOpen = {};
function materialsFor(studentId){
  return (data.materials||[]).filter(m => m.visibleToAll || (m.studentIds||[]).includes(studentId));
}

function buildStudentMessage(s){
  const lines = [];
  if(s.format!=='Очно' && s.callLink) lines.push(`Подключиться к занятию: ${s.callLink}`);
  if(s.format!=='Очно' && s.boardLink) lines.push(`Доска: ${s.boardLink}`);
  const allFiles = materialsFor(s.id);
  if(allFiles.length){
    lines.push('Материалы к уроку:');
    allFiles.forEach(f=> lines.push(`- ${f.name ? f.name+': ' : ''}${f.url}`));
  }
  if(lines.length===0) return null;
  return `Привет, ${s.name}! Вот что нужно для занятия:\n\n${lines.join('\n')}`;
}
function toggleStudentMsg(id){
  if(studentMsgOpen[id]) delete studentMsgOpen[id]; else studentMsgOpen[id] = true;
  render();
}

let msgTextById = {};
function renderStudentMsgBox(s){
  const text = buildStudentMessage(s);
  if(!text){
    return `<div class="msgbox" style="border-color:#E3E3D8;"><div style="flex:1;">Пока нет ни ссылок, ни материалов у ${esc(s.name)} — добавь их ниже, и здесь появится готовый текст.</div></div>`;
  }
  msgTextById[s.id] = text;
  return `<div class="msgbox" style="white-space:pre-wrap;"><div style="flex:1;">${esc(text)}</div><button class="iconbtn" onclick="copyStudentMsg('${s.id}', this)">⧉</button></div>`;
}
function copyStudentMsg(id, btn){ copyText(msgTextById[id], btn); }

function cardHTML(s){
    const accent = ACCENTS[s.accent] || ACCENTS[0];
    const open = data.openIds.includes(s.id);
    const tags = s.subjects.map(sub=>`<span class="tag">${sub.subject ? esc(sub.subject)+': ' : ''}${esc(sub.label)} · ${esc(sub.price)}</span>`).join('');
    const msg = doneMsgFor[s.id];
    const studentTheme = studentThemes[s.id];
    const themeBadge = (studentTheme && studentTheme !== 'classic' && THEMES[studentTheme])
      ? `<span style="position:absolute; bottom:-0.125rem; right:-0.125rem; width:0.5rem; height:0.5rem; border-radius:999px; background:${THEMES[studentTheme].accent}; border:1.5px solid #fff;"></span>`
      : '';
    return `
    <div class="card">
      <div class="card-head" style="background:${accent.soft}" onclick="toggleOpen('${s.id}')">
        <div style="position:relative; flex-shrink:0;">
          <div class="dot" style="background:${accent.ink}"></div>
          ${themeBadge}
        </div>
        <div style="flex:1;min-width:0;">
          <div class="name">${esc(s.name)}</div>
          <div class="meta">${esc(s.grade)} · ${esc(s.format)}</div>
        </div>
        <button class="chev ${open?'open':''}">⌄</button>
      </div>
      <div class="body">
        <div class="tags">${tags}</div>
        <div class="row">
          ${s.format!=='Очно'?`<a class="btn ${s.callLink?'':'btn-off'}" href="${s.callLink?esc(s.callLink):'#'}" target="_blank" style="background:${s.callLink?'#1F2A3D':''};color:${s.callLink?'#fff':''}" onclick="${s.callLink?'':'return false;'}">🎥 Звонок</a>`:''}
          ${s.format!=='Очно'?`<a class="btn ${s.boardLink?'':'btn-off'}" href="${s.boardLink?esc(s.boardLink):'#'}" target="_blank" style="background:${s.boardLink?accent.ink:''};color:${s.boardLink?'#fff':''}" onclick="${s.boardLink?'':'return false;'}">✏️ Доска</a>`:''}
          <button class="btn btn-done" onclick="markDone('${s.id}')">✓ Урок прошёл</button>
        </div>
        ${(() => {
          const g = groupMessengers(s.messengers);
          const chips = list => `<div class="chiprow">${list.map(m=>`<a class="chip" href="${esc(m.url)}" target="_blank">💬 ${esc(m.label||'Чат')}</a>`).join('')}</div>`;
          if(!g.child.length && !g.parent.length) return '';
          let out = '';
          if(g.child.length) out += chips(g.child);
          if(g.child.length && g.parent.length) out += `<hr style="border:none; border-top:1px solid #EEF0F2; margin:0.5rem 0;">`;
          if(g.parent.length) out += chips(g.parent);
          return out;
        })()}
        <button class="btn" style="width:100%;margin-top:8px;background:${accent.soft};color:${accent.ink};border:1px solid ${accent.soft};" onclick="toggleStudentMsg('${s.id}')">📨 Сообщение ученику со ссылками</button>
        ${msg?`<div class="msgbox"><div style="flex:1;">${esc(msg)}</div>${s.needsPaymentReport?`<button class="iconbtn" onclick="copyText('${esc(msg)}', this)">⧉</button>`:''}</div>`:''}
        ${studentMsgOpen[s.id] ? renderStudentMsgBox(s) : ''}
      </div>
      <div class="edit ${open?'open':''}">
        <div style="display:flex; gap:0.375rem; padding-top:0.75rem; margin-bottom:0.625rem;">
          <button onclick="updateStudent('${s.id}',{format:'Онлайн'})" style="flex:1; padding:0.4375rem 0; border-radius:0.5rem; font-size:0.78125rem; font-weight:600; border:1px solid ${s.format!=='Очно'?accent.ink:'#C9D2DB'}; background:${s.format!=='Очно'?accent.soft:'#fff'}; color:${s.format!=='Очно'?accent.ink:'#8A93A0'}; cursor:pointer;">💻 Онлайн</button>
          <button onclick="updateStudent('${s.id}',{format:'Очно'})" style="flex:1; padding:0.4375rem 0; border-radius:0.5rem; font-size:0.78125rem; font-weight:600; border:1px solid ${s.format==='Очно'?accent.ink:'#C9D2DB'}; background:${s.format==='Очно'?accent.soft:'#fff'}; color:${s.format==='Очно'?accent.ink:'#8A93A0'}; cursor:pointer;">🤝 Очно</button>
        </div>
        <div style="padding-top:0;">
          ${s.format!=='Очно'?`<div class="field"><span>🎥</span><input type="text" placeholder="ссылка на звонок (Зум / Телемост)" value="${esc(s.callLink)}" onchange="updateStudent('${s.id}',{callLink:this.value})"><button class="iconbtn" onclick="copyText('${esc(s.callLink)}', this)">⧉</button></div>`:''}
          ${s.format!=='Очно'?`<div class="field"><span>✏️</span><input type="text" placeholder="ссылка на доску" value="${esc(s.boardLink)}" onchange="updateStudent('${s.id}',{boardLink:this.value})"><button class="iconbtn" onclick="copyText('${esc(s.boardLink)}', this)">⧉</button></div>`:''}
          <div class="filelabel" style="margin-top:0.5rem;">Ссылки на чат</div>
          ${(() => {
            const g = groupMessengers(s.messengers);
            const row = m => `
              <div class="filerow">
                <span>💬</span>
                <a href="${esc(m.url)}" target="_blank" rel="noreferrer">${esc(m.label||m.url)}</a>
                <button class="iconbtn" onclick="removeMessenger('${s.id}','${m.id}')" style="border-color:#F0DAD6;background:#FBEEEC;color:#C0392B;">✕</button>
              </div>`;
            if(!g.child.length && !g.parent.length) return '<div style="font-size:0.78125rem;color:#9BA3AE;margin-bottom:0.5rem;">Пока пусто</div>';
            let out = '';
            if(g.child.length){ out += `<div style="font-size:0.71875rem; color:#8A93A0; margin-bottom:0.25rem;">Ребёнку</div>` + g.child.map(row).join(''); }
            if(g.child.length && g.parent.length) out += `<hr style="border:none; border-top:1px solid #EEF0F2; margin:0.5rem 0;">`;
            if(g.parent.length){ out += `<div style="font-size:0.71875rem; color:#8A93A0; margin-bottom:0.25rem;">Родителю</div>` + g.parent.map(row).join(''); }
            return out;
          })()}
          <div style="display:flex; gap:0.375rem; margin:0.5rem 0 0.375rem;">
            <button onclick="setMessengerKind('${s.id}','child')" class="mat-pill ${(messengerAddKind[s.id]||'child')==='child'?'picked':''}" style="flex:1; justify-content:center;">Ребёнку</button>
            <button onclick="setMessengerKind('${s.id}','parent')" class="mat-pill ${messengerAddKind[s.id]==='parent'?'picked':''}" style="flex:1; justify-content:center;">Родителю</button>
          </div>
          <div class="fileadd">
            <input class="fname" type="text" id="mlabel-${s.id}" placeholder="подпись (ВК, ТГ...)">
            <input class="furl" type="text" id="murl-${s.id}" placeholder="ссылка: wa.me/... или t.me/...">
            <button class="addfilebtn" onclick="addMessenger('${s.id}')">+</button>
          </div>
          <div class="filelabel" style="margin-top:0.75rem;">Тарифы</div>
          ${(s.subjects||[]).length===0 ? '<div style="font-size:0.78125rem;color:#9BA3AE;margin-bottom:0.5rem;">Пока пусто</div>' : s.subjects.map(sub=>`
            <div class="filerow">
              <span>💳</span>
              <span style="flex:1; font-size:0.8125rem;">${sub.subject ? `<b>${esc(sub.subject)}:</b> ` : ''}${esc(sub.label)} · ${esc(sub.price)}</span>
              <button class="iconbtn" onclick="removeSubject('${s.id}','${sub.id}')" style="border-color:#F0DAD6;background:#FBEEEC;color:#C0392B;">✕</button>
            </div>`).join('')}
          ${profileSubjects.length > 1 ? `
            <select id="subsubject-${s.id}" style="width:100%; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem;">
              ${profileSubjects.map(sub=>`<option value="${esc(sub)}">${esc(sub)}</option>`).join('')}
            </select>` : ''}
          <div class="fileadd">
            <input class="fname" type="text" id="sublabel-${s.id}" placeholder="название (напр. ОГЭ)">
            <input class="furl" type="text" id="subprice-${s.id}" placeholder="цена (напр. 2900 ₽)">
            <button class="addfilebtn" onclick="addSubject('${s.id}')">+</button>
          </div>
          <div class="filelabel" style="margin-top:0.75rem;">Расписание</div>
          ${renderScheduleGroups(s)}
          <div style="display:flex; gap:0.25rem; margin-bottom:0.375rem;">
            ${DAY_NAMES.map((name, dow) => `<span class="mat-pill ${(scheduleAddDays[s.id]||[]).includes(dow)?'picked':''}" style="flex:1; justify-content:center; padding:0.3rem 0.25rem;" onclick="toggleScheduleDay('${s.id}',${dow})">${name}</span>`).join('')}
          </div>
          <div style="display:flex; gap:0.375rem; margin-bottom:0.375rem;">
            <input type="time" id="scheduletime-${s.id}" value="16:00" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB;">
            <input type="date" id="schedulestart-${s.id}" style="flex:1; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB;">
          </div>
          ${(s.subjects||[]).length===0 ? `
            <button class="btn" style="width:100%; background:#EAF0F6; color:#2C4A7C; margin-bottom:0.375rem;" onclick="focusTariffInput('${s.id}')">Тарифов пока нет — завести</button>
            <div style="font-size:0.71875rem; color:#9BA3AE; margin-bottom:0.375rem;">или оставь пока так, донастроишь тариф позже</div>
          ` : `
            <select id="scheduletariff-${s.id}" style="width:100%; font-size:0.78125rem; padding:0.375rem 0.5rem; border-radius:0.5rem; border:1px solid #C9D2DB; margin-bottom:0.375rem;">
              <option value="">без привязки к тарифу</option>
              ${s.subjects.map(sub=>`<option value="${sub.id}">${esc(sub.label)} · ${esc(sub.price)}</option>`).join('')}
            </select>
          `}
          <button class="btn btn-done" style="width:100%; margin-bottom:0.5rem;" onclick="addScheduleGroup('${s.id}')">+ Добавить в расписание</button>
          ${renderUpcomingLessons(s)}
        </div>
        <label class="checklabel"><input type="checkbox" ${s.needsPaymentReport?'checked':''} onchange="updateStudent('${s.id}',{needsPaymentReport:this.checked})"> Родителю нужно писать про оплату после урока</label>

        <div class="filelabel">Вход для ученика</div>
        ${s.hasAccount ? `
          <div class="msgbox" style="align-items:center; background:#E2EFE6;">
            <div style="flex:1; font-size:0.8125rem; color:#1F5C3A;">✅ Уже подключён — для нового предмета этому же ученику новый код не нужен, просто добавь тариф с нужным предметом выше</div>
          </div>` : s.inviteCode ? `
          <div class="msgbox" style="align-items:center;">
            <div style="flex:1;">Код: <b style="font-family:'IBM Plex Mono',monospace; font-size:1rem;">${esc(s.inviteCode)}</b><br><span style="font-size:0.71875rem; color:#8A93A0;">Пришли этот код ученику — он вводит его один раз при создании своего аккаунта</span></div>
            <button class="iconbtn" onclick="copyText('${esc(s.inviteCode)}', this)">⧉</button>
            <button class="iconbtn" onclick="revokeInviteCode('${s.id}')" style="border-color:#F0DAD6;background:#FBEEEC;color:#C0392B;">✕</button>
          </div>` : `
          <button class="btn" style="width:100%; background:#EAF0F6; color:#2C4A7C; margin-bottom:0.625rem;" onclick="generateInviteCode('${s.id}')">🔑 Создать код для входа</button>`}
        <button class="btn" style="width:100%; background:#F1F3F5; color:#3A4250; margin-top:0.375rem;" onclick="showMaterialsView('${s.id}')">📚 Материалы для ${esc(s.name)}</button>
        <button class="delbtn" onclick="deleteStudent('${s.id}')">🗑 Удалить ученика</button>
      </div>
    </div>`;
}

function renderOverviewView(){
  const students = data.students || [];
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

    ${noAccount.length ? `
    <div class="matcard" style="margin-top:0.75rem;">
      <div class="filelabel">⚠️ Требует внимания</div>
      <div style="font-size:0.8125rem; color:#5A6472; margin-bottom:0.5rem;">Ещё не завели свой аккаунт — не забудь прислать код:</div>
      ${noAccount.map(s=>`
        <div class="filerow">
          <span>🔑</span>
          <span style="flex:1; font-size:0.8125rem;">${esc(s.name)}</span>
          <button style="font-size:0.75rem; color:#5A6472; background:none; border:none; cursor:pointer; text-decoration:underline;" onclick="selectStudentFromDrawer('${s.id}')">открыть</button>
        </div>`).join('')}
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
