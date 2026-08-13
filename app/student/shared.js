function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

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
let currentTheme = 'classic';
function themePickerHTML(){
  return `<div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
    ${Object.entries(THEMES).map(([id, t]) => `
      <button onclick="pickTheme('${id}')" title="${t.name}" style="width:2.25rem; height:2.25rem; border-radius:999px; border:2px solid ${currentTheme===id?'var(--ink)':'transparent'}; background:${t.accent}; display:flex; align-items:center; justify-content:center; cursor:pointer;">
        ${currentTheme===id ? '<span style="color:#fff; font-size:0.875rem;">✓</span>' : ''}
      </button>`).join('')}
  </div>`;
}
function pickTheme(themeId){
  currentTheme = themeId;
  applyTheme();
  if(window.__fbSetTheme) window.__fbSetTheme(themeId);
  const picker = document.getElementById('themePicker');
  if(picker) picker.innerHTML = themePickerHTML();
}
function applyTheme(){
  const t = THEMES[currentTheme] || THEMES.classic;
  document.body.style.backgroundColor = t.bg;
  const card = document.querySelector('#mainArea .card');
  if(card) card.style.borderTop = `3px solid ${t.accent}`;
}

// ---- typed contacts (matches tutor.html's CONTACT_TYPES) ----
const CONTACT_TYPES = {
  telegram: { label:'Telegram', icon:'✈️', action:'Написать в Telegram', build: v => `https://t.me/${v}` },
  whatsapp: { label:'WhatsApp', icon:'📱', action:'Написать в WhatsApp', build: v => `https://wa.me/${v}` },
  vk:       { label:'ВК',       icon:'💬', action:'Написать в ВК', build: v => `https://vk.com/im?sel=${v}` },
  phone:    { label:'Телефон',  icon:'☎️', action:'Позвонить', build: v => `tel:${v}` },
  email:    { label:'Почта',    icon:'✉️', action:'Написать на почту', build: v => `mailto:${v}` },
};
function contactLink(c){ const t = CONTACT_TYPES[c.type]; return (t && c.value) ? t.build(c.value) : '#'; }
function contactLabel(c){ const t = CONTACT_TYPES[c.type]; return t ? t.label : 'контакт'; }
function contactAction(c){ const t = CONTACT_TYPES[c.type]; return t ? t.action : 'Написать'; }
function contactIcon(c){ const t = CONTACT_TYPES[c.type]; return t ? t.icon : '🔗'; }

let accountPanelOpen = false;
function toggleAccountPanel(){
  accountPanelOpen = !accountPanelOpen;
  const el = document.getElementById('accountPanel');
  if(el) el.style.display = accountPanelOpen ? 'block' : 'none';
}

let otherContactsOpen = false;
function toggleOtherContacts(){
  otherContactsOpen = !otherContactsOpen;
  const el = document.getElementById('otherContacts');
  if(el) el.style.display = otherContactsOpen ? 'block' : 'none';
}

function showSwUpdateBanner(worker){
  if (document.getElementById('swUpdateBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'swUpdateBanner';
  banner.style.cssText = 'position:fixed; bottom:0; left:0; right:0; background:#1F2A3D; color:#fff; padding:0.75rem 1rem; display:flex; align-items:center; gap:0.75rem; z-index:999; font-size:0.875rem; box-shadow:0 -2px 12px rgba(0,0,0,0.15);';
  banner.innerHTML = '<span style="flex:1;">Доступна новая версия приложения</span><button id="swUpdateBtn" style="background:#fff; color:#1F2A3D; border:none; border-radius:0.5rem; padding:0.375rem 0.75rem; font-weight:600; cursor:pointer;">Обновить</button>';
  document.body.appendChild(banner);
  document.getElementById('swUpdateBtn').onclick = () => {
    worker.postMessage({ type: 'SKIP_WAITING' });
  };
}
