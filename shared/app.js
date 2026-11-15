(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const e = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const types = {sign:'Sign',banner:'Banner',decor:'Decoration',lanyard:'Lanyard'};
  const states = {available:'Available',reserved:'Reserved',handed:'Handed over',pending:'Pending',accepted:'Accepted',declined:'Declined',cancelled:'Cancelled',completed:'Confirmed by both'};
  let user = null, items = [], requests = [], stores = [], toastTimer;
  const localToday = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  async function api(path, body) {
    const response = await fetch(path, {method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : {'Content-Type':'application/json'}, body: body === undefined ? undefined : JSON.stringify(body), credentials:'same-origin'});
    let data; try { data = await response.json(); } catch { throw new Error('The server returned an unreadable response.'); }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }
  function notify(message, isError=false) { const t=$('toast'); t.textContent=message; t.style.background=isError?'#8d3f35':'#173e35'; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),6000); }
  function account() {
    $('session-label').innerHTML=user?`Signed in: ${e(user.username)} <button id="logout" class="link">Sign out</button>`:'Not signed in';
    $('account-content').innerHTML=user?`<div class="panel"><h3>Hello, ${e(user.username)}.</h3><p class="muted">You can list materials, request items and view handoffs. Use a separate browser session to sign in as a second participant.</p></div>`:`<div class="auth-wrap"><form id="login-form" class="panel"><h3>Sign in</h3><label>Username<input name="username" required autocomplete="username" maxlength="32"></label><label>Password<input name="password" type="password" required autocomplete="current-password" maxlength="128"></label><button class="primary" type="submit">Sign in ↗</button></form><form id="register-form" class="panel"><h3>Create account</h3><p class="muted">Use a dedicated test password, not a password you use elsewhere. Username: 3–32 letters, numbers, underscores or hyphens; password: at least 8 characters.</p><label>Username<input name="username" required autocomplete="username" minlength="3" maxlength="32" pattern="[A-Za-z0-9_-]+"></label><label>Password<input name="password" type="password" required autocomplete="new-password" minlength="8" maxlength="128"></label><button class="primary" type="submit">Create account ↗</button></form></div>`;
    if(user) $('logout').addEventListener('click',async()=>{try{await api('/api/logout',{}); user=null;items=[];requests=[];stores=[];await refresh();notify('Signed out.');}catch(err){notify(err.message,true);}});
    else for(const mode of ['login','register']) $(`${mode}-form`).addEventListener('submit',async ev=>{ev.preventDefault();const f=new FormData(ev.currentTarget);try{await api(`/api/${mode}`,{username:String(f.get('username')).trim(),password:String(f.get('password'))});await refresh();notify(mode==='login'?'Signed in.':'Account created and signed in.');}catch(err){notify(err.message,true);}});
  }
  function showItems() {
    $('item-count').textContent=`${items.length} ${items.length===1?'item':'items'}`;
    if(!user){$('items').innerHTML='<p class="empty">Sign in to view shared materials.</p>';return;}
    $('items').innerHTML=items.map(x=>{
      const mine=String(x.owner_id)===String(user.id), activeRequest=requests.some(r=>String(r.item_id)===String(x.id)&&String(r.claimant_id)===String(user.id)&&['pending','accepted'].includes(r.status)), canRequest=!mine&&!activeRequest&&x.status==='available'&&x.deadline>=localToday();
      return `<article class="card"><span class="badge">${e(states[x.status]||x.status)}</span><h3>${e(x.name)}</h3><p><strong>${e(types[x.type]||x.type)}</strong> · ${e(x.condition)}</p><p>⌖ ${e(x.location)} · Owner ${e(x.owner_name)}</p><p>Available ${e(x.available)} · Clearance ${e(x.deadline)}</p>${mine?'<p>You listed this item.</p>':''}${activeRequest?'<p>You already have an active request. See your handoffs.</p>':''}${canRequest?`<form class="request-form" data-id="${e(x.id)}"><label>Pickup date<input class="inline-date" type="date" name="pickup" min="${e(x.available>localToday()?x.available:localToday())}" required></label><label>Route<select name="storage_id"><option value="">Direct pickup</option>${stores.map(s=>`<option value="${e(s.id)}">${e(s.name)} · ${e(s.location)}</option>`).join('')}</select></label><p class="route-help" aria-live="polite">Direct pickup must be by the clearance date. For storage, verify the location, permission and transport; capacity is checked at request and acceptance.</p><button class="secondary" type="submit">Request ↗</button></form>`:''}</article>`;
    }).join('')||'<p class="empty">No materials listed yet. Sign in to list the first item.</p>';
  }
  function showRequests(){
    if(!user){$('requests-list').innerHTML='<p class="empty">Sign in to view your requests.</p>';return;}
    $('requests-list').innerHTML=requests.map(r=>{
      const owner=String(r.owner_id)===String(user.id), pending=r.status==='pending', accepted=r.status==='accepted';
      const confirmed=owner?Number(r.owner_confirmed):Number(r.claimant_confirmed);
      let actions='';
      if(owner&&pending)actions+=`<button class="secondary" data-action="accept" data-id="${e(r.id)}">Accept</button>`;
      if((pending||accepted)&&!Number(r.owner_confirmed)&&!Number(r.claimant_confirmed))actions+=`<button class="secondary" data-action="cancel" data-id="${e(r.id)}">Cancel</button>`;
      if(accepted&&!confirmed)actions+=`<button class="secondary" data-action="handoff" data-id="${e(r.id)}">Confirm handoff</button>`;
      const route=r.storage_id?`Storage: ${e(r.storage_name)} · ${e(r.storage_location)} · ${e(r.storage_start)} → ${e(r.pickup)}`:'Direct handoff';
      return `<article class="request"><span class="badge">${e(states[r.status]||r.status)}</span><h3>${e(r.item_name)}</h3><p>Owner ${e(r.owner_name)} · Requester ${e(r.claimant_name)} · Pickup ${e(r.pickup)}</p><p>${route}</p><p>Owner confirmed: ${Number(r.owner_confirmed)?'Yes':'No'} · Requester confirmed: ${Number(r.claimant_confirmed)?'Yes':'No'}</p><div class="request-actions">${actions}</div></article>`;
    }).join('')||'<p class="empty">No handoffs yet. Use another session to request an item, then manage it here.</p>';
  }
  function showStores(){
    if(!user){$('stores').innerHTML='<p class="empty">Sign in to see storage.</p>';return;}
    $('stores').innerHTML=stores.map(s=>`<article class="card"><span class="badge">${e(s.capacity)} item ${Number(s.capacity)===1?'slot':'slots'}</span><h3>${e(s.name)}</h3><p>⌖ ${e(s.location)} · Listed by ${e(s.owner_name)}</p><p>Accept: ${e(s.from_date)} – ${e(s.accept_until)}</p><p>Hold until: ${e(s.hold_until)}</p><p>Capacity is not live; it is rechecked on acceptance.</p></article>`).join('')||'<p class="empty">No storage points yet.</p>';
  }
  async function refresh(){
    const session=await api('/api/session');user=session.user;
    if(user){const [a,b,c]=await Promise.all([api('/api/items'),api('/api/requests'),api('/api/storage-points')]);items=a.items;requests=b.requests;stores=c.stores;}else{items=[];requests=[];stores=[];}
    account();showItems();showRequests();showStores();
  }
  $('refresh').addEventListener('click',async()=>{try{await refresh();notify('Shared data refreshed.');}catch(err){notify(err.message,true);}});
  $('item-form').addEventListener('submit',async ev=>{ev.preventDefault();if(!user){notify('Sign in before listing an item.',true);return;}const form=ev.currentTarget,f=new FormData(form),payload=Object.fromEntries(f.entries());try{await api('/api/items',payload);form.reset();await refresh();$('item-message').textContent='Published to the shared service.';notify('Item published.');}catch(err){$('item-message').textContent=err.message;notify(err.message,true);}});
  $('storage-form').addEventListener('submit',async ev=>{ev.preventDefault();if(!user){notify('Please sign in.',true);return;}const form=ev.currentTarget,f=new FormData(form),payload=Object.fromEntries(f.entries());payload.capacity=Number(payload.capacity);try{await api('/api/storage-points',payload);form.reset();await refresh();$('storage-message').textContent='Storage listed; verify permission and transport.';notify('Storage added.');}catch(err){$('storage-message').textContent=err.message;notify(err.message,true);}});
  document.addEventListener('change',ev=>{const form=ev.target.closest('.request-form');if(!form)return;const item=items.find(x=>String(x.id)===form.dataset.id),date=form.elements.pickup.value,select=form.elements.storage_id;if(!item||!date||!select)return;for(const opt of select.options){if(!opt.value){opt.disabled=date>item.deadline;continue;}const s=stores.find(v=>String(v.id)===opt.value);opt.disabled=!s||date<=item.deadline||s.from_date>item.deadline||s.accept_until<item.available||s.accept_until<localToday()||s.hold_until<date;}if(select.selectedOptions[0]?.disabled)select.value='';form.querySelector('.route-help').textContent=date<=item.deadline?'Direct pickup is possible by the clearance date.':'Choose a date-compatible storage point for pickup after clearance; capacity is rechecked.';});
  document.addEventListener('submit',async ev=>{const form=ev.target.closest('.request-form');if(!form)return;ev.preventDefault();const f=new FormData(form),pickup=f.get('pickup'),storage_id=f.get('storage_id'),item=items.find(x=>String(x.id)===form.dataset.id);if(item&&pickup>item.deadline&&!storage_id){notify('Select an available storage point for pickup after clearance.',true);return;}const payload={pickup};if(storage_id)payload.storage_id=Number(storage_id);try{await api(`/api/items/${encodeURIComponent(form.dataset.id)}/request`,payload);await refresh();notify('Request submitted; storage capacity is reserved only when the owner accepts.');}catch(err){notify(err.message,true);await refresh().catch(()=>{});}});
  document.addEventListener('click',async ev=>{const b=ev.target.closest('[data-action]');if(!b)return;try{await api(`/api/requests/${encodeURIComponent(b.dataset.id)}/${b.dataset.action}`,{});await refresh();notify('Handoff status updated.');}catch(err){notify(err.message,true);await refresh().catch(()=>{});}});
  const local=['localhost','127.0.0.1'].includes(location.hostname);$('deployment-banner').textContent=(local?'Local development prototype':'Shared service')+' · Coordinate direct handoffs and storage offline. Confirmations are user records and do not prove physical transfer.';
  const t=localToday();document.querySelector('[name="available"]').min=t;document.querySelector('[name="deadline"]').min=t;
  refresh().catch(err=>{ $('session-label').textContent='Service unavailable'; $('account-content').innerHTML='<p class="error">Cannot connect to the local service. Start the server and open the address it provides.</p>';notify(err.message,true); });
})();

