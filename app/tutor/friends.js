let friendsList = []; // [{uid, name}]
let friendCode = null;

function showFriendsView(){
  viewMode = 'friends';
  closeDrawer();
  if(window.__fbEnsureFriendCode) window.__fbEnsureFriendCode();
  render();
}
function renderFriendsView(){
  return `
    <div class="matcard">
      <div class="filelabel">Твой код</div>
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <div style="flex:1; font-family:'IBM Plex Mono',monospace; font-size:1.0625rem; font-weight:700; background:var(--surface); border-radius:0.5rem; padding:0.5rem 0.75rem;">${friendCode ? esc(friendCode) : '…'}</div>
        <button class="iconbtn" onclick="copyText('${esc(friendCode||'')}', this)" aria-label="Скопировать код дружбы">⧉</button>
      </div>
      <div style="font-size:0.71875rem; color:var(--text-muted); margin-top:0.375rem;">Пришли этот код коллеге — он вводит его у себя, и вы становитесь друзьями</div>
    </div>
    <div class="matcard" style="margin-top:0.75rem;">
      <div class="filelabel">Добавить друга по коду</div>
      <div style="display:flex; gap:0.375rem;">
        <input id="friendCodeInput" type="text" placeholder="код коллеги" style="flex:1; font-size:0.84375rem; padding:0.5rem 0.625rem; border-radius:0.5rem; border:1px solid var(--border); text-transform:uppercase;">
        <button class="btn btn-done" style="flex:0 0 auto; padding:0 1rem;" onclick="addFriendByCode()">Добавить</button>
      </div>
    </div>
    <div class="matcard" style="margin-top:0.75rem;">
      <div class="filelabel">Твои друзья</div>
      ${friendsList.length===0 ? '<div style="font-size:0.8125rem;color:var(--text-muted);">Пока никого</div>' : friendsList.map(f => `
        <div class="filerow">
          <span>👤</span>
          <span style="flex:1; font-size:0.8125rem;">${esc(f.name || 'Коллега')}</span>
          <button class="iconbtn" onclick="removeFriend('${f.uid}')" aria-label="Удалить из друзей" style="border-color:var(--danger-border);background:var(--danger-soft);color:var(--danger);">✕</button>
        </div>`).join('')}
    </div>
  `;
}
async function addFriendByCode(){
  const input = document.getElementById('friendCodeInput');
  const code = input.value.trim().toUpperCase();
  if(!code){ showToast('Впиши код коллеги'); return; }
  if(!window.__fbAddFriend){ showToast('Сейчас недоступно, попробуй позже'); return; }
  try{
    const name = await window.__fbAddFriend(code);
    showToast(name ? `Теперь вы с ${name} видите общие материалы друг друга` : 'Готово! Вы теперь друзья', 'success', 5000);
    input.value = '';
  }catch(e){
    showToast(e.message || 'Не получилось добавить — проверь код');
  }
}
function removeFriend(uid){
  if(window.__fbRemoveFriend) window.__fbRemoveFriend(uid);
}

