// ---- Экран «Уведомления»: история того, что уже было отправлено ----

function updateNotifBadge(){
  const el = document.getElementById('notifBadge');
  if(!el) return;
  const count = (window.__notifications||[]).filter(n=>!n.read).length;
  el.textContent = count > 0 ? count : '';
  el.style.display = count > 0 ? 'inline-block' : 'none';
}
function showNotificationsView(){
  viewMode = 'notifications';
  closeDrawer();
  if(window.__fbMarkAllNotificationsRead) window.__fbMarkAllNotificationsRead();
  render();
}

function timeAgoLabel(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if(diffMin < 1) return 'только что';
  if(diffMin < 60) return `${diffMin} мин назад`;
  const diffHr = Math.round(diffMin/60);
  if(diffHr < 24) return `${diffHr} ч назад`;
  return d.toLocaleDateString('ru-RU', {day:'numeric', month:'long'});
}

function renderNotificationsView(){
  const items = window.__notifications || [];
  if(items.length === 0){
    return `<div class="matcard" style="text-align:center; padding:1.5rem 1rem; color:#5A6472;">
      <div style="font-size:1.5rem; margin-bottom:0.375rem;">🔔</div>
      <div style="font-size:0.875rem;">Уведомлений пока не было</div>
    </div>`;
  }
  return items.map(n => `
    <div class="matcard" style="${n.read?'':'border-left:3px solid #C0392B;'}">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:0.5rem;">
        <div style="font-weight:600; font-size:0.875rem;">${esc(n.title||'Уведомление')}</div>
        <div style="font-size:0.71875rem; color:#9BA3AE; flex-shrink:0;">${timeAgoLabel(n.createdAt)}</div>
      </div>
      <div style="font-size:0.8125rem; color:#5A6472; margin-top:0.25rem;">${esc(n.body||'')}</div>
    </div>
  `).join('');
}
