const KEY = 'tutoring-app-data-v1';

function showToast(message, type='error', duration=10000){
  let wrap = document.getElementById('toastWrap');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'toastWrap';
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  wrap.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const span = document.createElement('span');
  span.style.flex = '1';
  span.textContent = message;
  const close = document.createElement('span');
  close.style.opacity = '.6';
  close.textContent = '✕';
  el.appendChild(span); el.appendChild(close);
  el.onclick = () => el.classList.remove('show');
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

function materialIcon(url){
  const clean = (url||'').split('?')[0].toLowerCase();
  if(clean.endsWith('.pdf')) return '📕';
  if(/\.(jpg|jpeg|png|gif|webp|heic)$/.test(clean)) return '🖼️';
  if(/\.(mp4|mov|avi|webm|mkv)$/.test(clean)) return '🎬';
  if(/\.(doc|docx)$/.test(clean)) return '📄';
  if(/\.(xls|xlsx|csv)$/.test(clean)) return '📊';
  if(/\.(ppt|pptx)$/.test(clean)) return '📽️';
  return '🔗';
}

const THEMES = {
  classic: { name:'Классика', bg:'#F3F5F1', accent:'#1F2A3D' },
  mint:    { name:'Мята',     bg:'#EAF4EE', accent:'#2E7D4F' },
  sky:     { name:'Небо',     bg:'#E7EEF6', accent:'#2C4A7C' },
  peach:   { name:'Персик',   bg:'#FBEEE4', accent:'#B5651D' },
  lavender:{ name:'Лаванда',  bg:'#EFEAF6', accent:'#6A4C93' },
  pink:    { name:'Розовый',  bg:'#FBEAF0', accent:'#C2547A' },
};
function themePickerHTML(currentTheme, onClickFn){
  return `<div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
    ${Object.entries(THEMES).map(([id, t]) => `
      <button onclick="${onClickFn}('${id}')" title="${t.name}" style="width:2.25rem; height:2.25rem; border-radius:999px; border:2px solid ${currentTheme===id?'#1F2A3D':'transparent'}; background:${t.accent}; display:flex; align-items:center; justify-content:center; cursor:pointer;">
        ${currentTheme===id ? '<span style="color:#fff; font-size:0.875rem;">✓</span>' : ''}
      </button>`).join('')}
  </div>`;
}

const ACCENTS = [
  {ink:'#C0392B', soft:'#F6E4E1'},
  {ink:'#2E7D4F', soft:'#E2EFE6'},
  {ink:'#2C4A7C', soft:'#E3E9F1'},
  {ink:'#B5651D', soft:'#F3E5D6'},
  {ink:'#5A6472', soft:'#E7E9EC'},
];

function defaultData(){
  return {
    students: [
      {
        id: "sonya", name: "Соня", grade: "9 класс", format: "Онлайн",
        accent: 0, messengers: [{id:'m1', label:'ВК (Соня)', url:'https://vk.com/im?sel=630793840'}, {id:'m2', label:'ТГ (мама)', url:'https://t.me/Dontfaqmymind'}, {id:'m3', label:'ТГ (Соня)', url:'https://t.me/Coconutnv'}], boardLink: "https://unidraw.io/app/board/83192784a1059c3a4a4c", callLink: "https://telemost.yandex.ru/j/16483728930070",
        needsPaymentReport: true,
        subjects:[{label:'Школьная программа (1 ч)', price:'1700 ₽'},{label:'Подготовка к ОГЭ (1,5 ч)', price:'2900 ₽'}], files:[]
      },
      {id:'lera', name:'Лера', grade:'9 класс', format:'Очно', accent:1, messengers:[{id:'m1', label:'ТГ (Лера)', url:'https://t.me/Kotiktv3'}, {id:'m2', label:'ТГ (мама Леры)', url:'https://t.me/svetlana_2l'}], boardLink:'', callLink:'', needsPaymentReport:true,
       subjects:[{label:'Школьная программа (1 ч)', price:'1150 ₽'},{label:'Подготовка к ОГЭ (1,5 ч)', price:'2000 ₽'}], files:[]},
      {id:'ksyusha', name:'Ксюша', grade:'11 класс', format:'Онлайн', accent:2, messengers:[], boardLink:'', callLink:'', needsPaymentReport:true,
       subjects:[{label:'Подготовка к ЕГЭ (1,5 ч)', price:'2650 ₽'}], files:[]},
      {id:'nadya', name:'Надя', grade:'9 класс', format:'Очно', accent:4, messengers:[{id:'m1', label:'ТГ (Надя)', url:'https://t.me/omishonaa'}], boardLink:'', callLink:'', needsPaymentReport:false,
       subjects:[{label:'Школьная программа (сестра)', price:'Бесплатно'}], files:[]},
      {id:'anya8', name:'Аня', grade:'8 класс', format:'Онлайн', accent:3, messengers:[], boardLink:'', callLink:'', needsPaymentReport:true,
       subjects:[{label:'Школьная программа (1 ч)', price:'1700 ₽'}], files:[]},
    ],
    sharedFiles: [],
    openIds: [],
  };
}

function uid(){ return Math.random().toString(36).slice(2,9); }

function migrate(d){
  d.students.forEach(s => {
    if(!Array.isArray(s.messengers)){
      s.messengers = s.messenger ? [{id: uid(), label:'', url: s.messenger}] : [];
    }
    delete s.messenger;
  });
  return d;
}

function load(){
  try{
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : defaultData();
  }catch(e){ return defaultData(); }
}
function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch(e){}
  if(window.__firestoreSave) window.__firestoreSave(data);
  render();
}

let data = defaultData(); // placeholder until Firebase auth + Firestore load finishes
const BASE_STUDENTS = defaultData().students;

function downloadBackup(){
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `kabinet-repetitora-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function restoreBackup(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = migrate(JSON.parse(reader.result));
      if(!Array.isArray(parsed.students)) throw new Error('bad format');
      if(!confirm('Заменить текущие данные содержимым файла? Текущие данные будут перезаписаны.')) return;
      data = parsed;
      if(!data.openIds) data.openIds = [];
      save();
    }catch(e){
      showToast('Не получилось прочитать файл — убедись, что это резервная копия, скачанная отсюда же.');
    }
    input.value = '';
  };
  reader.readAsText(file);
}

function syncBaseLinks(){
  let changed = 0;
  data.students.forEach(s => {
    const base = BASE_STUDENTS.find(b => b.id === s.id);
    if(!base) return;
    if(base.callLink && s.callLink !== base.callLink){ s.callLink = base.callLink; changed++; }
    if(base.boardLink && s.boardLink !== base.boardLink){ s.boardLink = base.boardLink; changed++; }
    if(base.messengers && base.messengers.length){
      if(!Array.isArray(s.messengers)) s.messengers = [];
      base.messengers.forEach(bm => {
        if(!s.messengers.some(m => m.id === bm.id)){
          s.messengers.push({...bm});
          changed++;
        }
      });
    }
  });
  save();
  showToast(changed ? `Обновлено ссылок: ${changed}` : 'Уже всё актуально', 'success', 4000);
}

function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

async function copyText(text, btn){
  if(!text) return;
  try{ await navigator.clipboard.writeText(text); }catch(e){}
  btn.classList.add('copied');
  btn.textContent = '✓';
  setTimeout(()=>{ btn.classList.remove('copied'); btn.textContent = '⧉'; }, 1200);
}

function toggleOpen(id){
  const i = data.openIds.indexOf(id);
  if(i>=0) data.openIds.splice(i,1); else data.openIds.push(id);
  save();
}

function updateStudent(id, patch){
  const s = data.students.find(x=>x.id===id);
  Object.assign(s, patch);
  save();
}
function deleteStudent(id){
  if(!confirm('Удалить ученика?')) return;
  data.students = data.students.filter(x=>x.id!==id);
  save();
}
const CONTACT_TYPE_ORDER = ['telegram','whatsapp','vk','phone','email'];
const CONTACT_TYPES = {
  telegram: { label:'Telegram', icon:'✈️', placeholder:'username без @', build: v => `https://t.me/${v}` },
  whatsapp: { label:'WhatsApp', icon:'📱', placeholder:'номер с кодом страны, без +', build: v => `https://wa.me/${v}` },
  vk:       { label:'ВК',       icon:'💬', placeholder:'числовой ID страницы (не короткое имя!)', build: v => `https://vk.com/im?sel=${v}` },
  phone:    { label:'Телефон',  icon:'☎️', placeholder:'номер телефона', build: v => `tel:${v}` },
  email:    { label:'Почта',    icon:'✉️', placeholder:'email', build: v => `mailto:${v}` },
};
function contactLink(c){ const t = CONTACT_TYPES[c.type]; return (t && c.value) ? t.build(c.value) : '#'; }

const ALLOWED_EXT = ['pdf','doc','docx','xls','xlsx','csv','ppt','pptx','png','jpg','jpeg','gif','webp','txt','zip','rar','py'];
const VIDEO_EXT = ['mp4','mov','avi','webm','mkv'];
const MAX_FILE_SIZE = 20*1024*1024; // 20 МБ, совпадает с upload.php

