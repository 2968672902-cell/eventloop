(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const e = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const types = {sign:'展板 / 指示牌',banner:'横幅 / 帉料',decor:'装饰',lanyard:'挂绳 / 胸牌'};
  const states = {available:'可申请 / Available',reserved:'已接受 / Reserved',handed:'已确认交接 / Handed over',pending:'待处理 / Pending',accepted:'已接受 / Accepted',declined:'已拒绝 / Declined',cancelled:'已取消 / Cancelled',completed:'双方已确认 / Confirmed by both'};
  let user = null, items = [], requests = [], stores = [], toastTimer;
  const localToday = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  async function api(path, body) {
    const response = await fetch(path, {method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : {'Content-Type':'application/json'}, body: body === undefined ? undefined : JSON.stringify(body), credentials:'same-origin'});
    let data; try { data = await response.json(); } catch { throw new Error('服务器返回了无法读取的数据。'); }
    if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
    return data;
  }
  function notify(message, isError=false) { const t=$('toast'); t.textContent=message; t.style.background=isError?'#8d3f35':'#173e35'; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),6000); }
  function account() {
    $('session-label').innerHTML=user?`已登录：${e(user.username)} <button id="logout" class="link">退出</button>`:'未登录';
    $('account-content').innerHTML=user?`<div class="panel"><h3>你好，${e(user.username)}。</h3><p class="muted">现在可以发布物料、申请领取并查看交接记录。打开另一个独立浏览器会话登录另一账号，即可模拟第二个人。</p></div>`:`<div class="auth-wrap"><form id="login-form" class="panel"><h3>登录 / Sign in</h3><label>用户名 / Username<input name="username" required autocomplete="username" maxlength="32"></label><label>密码 / Password<input name="password" type="password" required autocomplete="current-password" maxlength="128"></label><button class="primary" type="submit">登录 / Sign in ↗</button></form><form id="register-form" class="panel"><h3>创建账号 / Create account</h3><p class="muted">请使用专用测试密码，不要使用常用密码。用户名 3–32 位字母、数字、下划线或连字符；密码至少 8 位。 / Use a dedicated test password. Username 3–32 letters, numbers, underscores or hyphens; password at least 8 characters.</p><label>用户名 / Username<input name="username" required autocomplete="username" minlength="3" maxlength="32" pattern="[A-Za-z0-9_-]+"></label><label>密码 / Password<input name="password" type="password" required autocomplete="new-password" minlength="8" maxlength="128"></label><button class="primary" type="submit">创建并登录 / Register ↗</button></form></div>`;
    if(user) $('logout').addEventListener('click',async()=>{try{await api('/api/logout',{}); user=null;items=[];requests=[];stores=[];await refresh();notify('已退出登录。');}catch(err){notify(err.message,true);}});
    else for(const mode of ['login','register']) $(`${mode}-form`).addEventListener('submit',async ev=>{ev.preventDefault();const f=new FormData(ev.currentTarget);try{await api(`/api/${mode}`,{username:String(f.get('username')).trim(),password:String(f.get('password'))});await refresh();notify(mode==='login'?'登录成功。':'账号已创建并登录。');}catch(err){notify(err.message,true);}});
  }
  function showItems() {
    $('item-count').textContent=`${items.length} 件`;
    if(!user){$('items').innerHTML='<p class="empty">请先登录，查看共享物料。</p>';return;}
    $('items').innerHTML=items.map(x=>{
      const mine=String(x.owner_id)===String(user.id), activeRequest=requests.some(r=>String(r.item_id)===String(x.id)&&String(r.claimant_id)===String(user.id)&&['pending','accepted'].includes(r.status)), canRequest=!mine&&!activeRequest&&x.status==='available'&&x.deadline>=localToday();
      return `<article class="card"><span class="badge">${e(states[x.status]||x.status)}</span><h3>${e(x.name)}</h3><p><strong>${e(types[x.type]||x.type)}</strong> · ${e(x.condition)}</p><p>⌖ ${e(x.location)} · 发布者 / Owner ${e(x.owner_name)}</p><p>可领取 / Available ${e(x.available)} · 清场 / Clearance ${e(x.deadline)}</p>${mine?'<p>这是你发布的物料。</p>':''}${activeRequest?'<p>你已有进行中的申请，请在交接记录中查看。</p>':''}${canRequest?`<form class="request-form" data-id="${e(x.id)}"><label>计划领取日期 / Pickup date<input class="inline-date" type="date" name="pickup" min="${e(x.available>localToday()?x.available:localToday())}" required></label><label>交接方式 / Route<select name="storage_id"><option value="">直接领取 / Direct pickup</option>${stores.map(s=>`<option value="${e(s.id)}">${e(s.name)} · ${e(s.location)}</option>`).join('')}</select></label><p class="route-help" aria-live="polite">直接领取需在清场前。暂存须人工核实地点、授权和运输；容量会在申请及接受时重新核验。 / Direct pickup must be by clearance; storage capacity is checked at request and acceptance.</p><button class="secondary" type="submit">申请领取 / Request ↗</button></form>`:''}</article>`;
    }).join('')||'<p class="empty">还没有共享物料。登录后可以发布第一件。</p>';
  }
  function showRequests(){
    if(!user){$('requests-list').innerHTML='<p class="empty">登录后查看与你相关的申请。</p>';return;}
    $('requests-list').innerHTML=requests.map(r=>{
      const owner=String(r.owner_id)===String(user.id), pending=r.status==='pending', accepted=r.status==='accepted';
      const confirmed=owner?Number(r.owner_confirmed):Number(r.claimant_confirmed);
      let actions='';
      if(owner&&pending)actions+=`<button class="secondary" data-action="accept" data-id="${e(r.id)}">接受申请 / Accept</button>`;
      if((pending||accepted)&&!Number(r.owner_confirmed)&&!Number(r.claimant_confirmed))actions+=`<button class="secondary" data-action="cancel" data-id="${e(r.id)}">取消申请 / Cancel</button>`;
      if(accepted&&!confirmed)actions+=`<button class="secondary" data-action="handoff" data-id="${e(r.id)}">我确认已交接 / Confirm handoff</button>`;
      const route=r.storage_id?`暂存 / Storage: ${e(r.storage_name)} · ${e(r.storage_location)} · ${e(r.storage_start)} → ${e(r.pickup)}`:'直接交接 / Direct handoff';
      return `<article class="request"><span class="badge">${e(states[r.status]||r.status)}</span><h3>${e(r.item_name)}</h3><p>发布者 / Owner ${e(r.owner_name)} · 申请者 / Requester ${e(r.claimant_name)} · 领取 / Pickup ${e(r.pickup)}</p><p>${route}</p><p>发布者确认：${Number(r.owner_confirmed)?'是':'否'}；领取者确认：${Number(r.claimant_confirmed)?'是':'否'}</p><div class="request-actions">${actions}</div></article>`;
    }).join('')||'<p class="empty">暂无申请记录。使用另一个会话申请物料后，可在这里处理。</p>';
  }
  function showStores(){
    if(!user){$('stores').innerHTML='<p class="empty">登录后查看暂存点 / Sign in to see storage.</p>';return;}
    $('stores').innerHTML=stores.map(s=>`<article class="card"><span class="badge">${e(s.capacity)} 个物品格 / slots</span><h3>${e(s.name)}</h3><p>⌖ ${e(s.location)} · 登记 / Listed by ${e(s.owner_name)}</p><p>接收 / Accept: ${e(s.from_date)} – ${e(s.accept_until)}</p><p>保管至 / Hold until: ${e(s.hold_until)}</p><p>容量非实时；接受时会重新核验。 / Capacity checked upon acceptance.</p></article>`).join('')||'<p class="empty">尚无暂存点 / No storage points yet.</p>';
  }
  async function refresh(){
    const session=await api('/api/session');user=session.user;
    if(user){const [a,b,c]=await Promise.all([api('/api/items'),api('/api/requests'),api('/api/storage-points')]);items=a.items;requests=b.requests;stores=c.stores;}else{items=[];requests=[];stores=[];}
    account();showItems();showRequests();showStores();
  }
  $('refresh').addEventListener('click',async()=>{try{await refresh();notify('共享数据已刷新。');}catch(err){notify(err.message,true);}});
  $('item-form').addEventListener('submit',async ev=>{ev.preventDefault();if(!user){notify('请先登录再发布。',true);return;}const form=ev.currentTarget,f=new FormData(form),payload=Object.fromEntries(f.entries());try{await api('/api/items',payload);form.reset();await refresh();$('item-message').textContent='已发布到共享服务。 / Published to shared service.';notify('物料已发布。');}catch(err){$('item-message').textContent=err.message;notify(err.message,true);}});
  $('storage-form').addEventListener('submit',async ev=>{ev.preventDefault();if(!user){notify('请先登录 / Please sign in.',true);return;}const form=ev.currentTarget,f=new FormData(form),payload=Object.fromEntries(f.entries());payload.capacity=Number(payload.capacity);try{await api('/api/storage-points',payload);form.reset();await refresh();$('storage-message').textContent='暂存点已登记；请自行确认授权和运输。 / Listed; verify permission and transport.';notify('暂存点已登记 / Storage added.');}catch(err){$('storage-message').textContent=err.message;notify(err.message,true);}});
  document.addEventListener('change',ev=>{const form=ev.target.closest('.request-form');if(!form)return;const item=items.find(x=>String(x.id)===form.dataset.id),date=form.elements.pickup.value,select=form.elements.storage_id;if(!item||!date||!select)return;for(const opt of select.options){if(!opt.value){opt.disabled=date>item.deadline;continue;}const s=stores.find(v=>String(v.id)===opt.value);opt.disabled=!s||date<=item.deadline||s.from_date>item.deadline||s.accept_until<item.available||s.accept_until<localToday()||s.hold_until<date;}if(select.selectedOptions[0]?.disabled)select.value='';form.querySelector('.route-help').textContent=date<=item.deadline?'清场前可直接交接。 / Direct pickup is possible by clearance.':'清场后需选择日期匹配的暂存点；容量在申请和接受时核验。 / Choose a date-compatible storage point; capacity is rechecked.';});
  document.addEventListener('submit',async ev=>{const form=ev.target.closest('.request-form');if(!form)return;ev.preventDefault();const f=new FormData(form),pickup=f.get('pickup'),storage_id=f.get('storage_id'),item=items.find(x=>String(x.id)===form.dataset.id);if(item&&pickup>item.deadline&&!storage_id){notify('清场后请选择可用暂存点 / Select a storage point for late pickup.',true);return;}const payload={pickup};if(storage_id)payload.storage_id=Number(storage_id);try{await api(`/api/items/${encodeURIComponent(form.dataset.id)}/request`,payload);await refresh();notify('申请已提交；暂存容量只在发布者接受后占用。');}catch(err){notify(err.message,true);await refresh().catch(()=>{});}});
  document.addEventListener('click',async ev=>{const b=ev.target.closest('[data-action]');if(!b)return;try{await api(`/api/requests/${encodeURIComponent(b.dataset.id)}/${b.dataset.action}`,{});await refresh();notify('交接状态已更新。');}catch(err){notify(err.message,true);await refresh().catch(()=>{});}});
  const local=['localhost','127.0.0.1'].includes(location.hostname);$('deployment-banner').textContent=(local?'本机开发原型 / Local development prototype':'共享服务 / Shared service')+' · 直接交接与暂存申请需双方线下协调。确认仅为用户记录，不证明实际交接。 / Confirmations do not prove physical transfer.';
  const t=localToday();document.querySelector('[name="available"]').min=t;document.querySelector('[name="deadline"]').min=t;
  refresh().catch(err=>{ $('session-label').textContent='服务未连接'; $('account-content').innerHTML='<p class="error">无法连接本机服务。请通过启动本地服务后提供的地址访问本页面。</p>';notify(err.message,true); });
})();
