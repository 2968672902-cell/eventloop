(() => {
  'use strict';
  // v2 deliberately leaves earlier local data untouched.
  const KEY='eventloop-handoff-v2', $=id=>document.getElementById(id);
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateString=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today=()=>dateString(new Date());
  const days=n=>{const d=new Date();d.setDate(d.getDate()+n);return dateString(d);};
  const nice=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'});};
  const types={sign:'Sign / board',banner:'Banner / fabric',decor:'Decoration',lanyard:'Lanyard / badge'};
  const seed=()=>({items:[
    {id:'demo-1',name:'Welcome sign',type:'sign',available:days(0),deadline:days(2),location:'Student centre',condition:'Blank reverse side; clean and dry',status:'available',demo:true},
    {id:'demo-2',name:'Workshop display board',type:'sign',available:days(0),deadline:days(7),location:'Design studio',condition:'White side clear; small marks',status:'available',demo:true},
    {id:'demo-3',name:'Fabric festival banner',type:'banner',available:days(1),deadline:days(3),location:'Club room',condition:'Clean; date can be covered',status:'available',demo:true}
  ],stores:[{id:'store-1',name:'Sample student union cupboard',from:days(0),acceptUntil:days(3),holdUntil:days(12),capacity:1,demo:true}]});
  let data;try{const saved=JSON.parse(localStorage.getItem(KEY));data=saved&&Array.isArray(saved.items)&&Array.isArray(saved.stores)?saved:seed();}catch{data=seed();}
  let query=null;
  const save=()=>localStorage.setItem(KEY,JSON.stringify(data));
  // Inclusive date intervals: a handoff on the clearance date is allowed.
  function capacityFits(store,start,end){
    const bookings=data.items.filter(x=>x.reservation?.storeId===store.id&&['reserved','handed'].includes(x.status)).map(x=>x.reservation).filter(x=>x.start<=end&&x.end>=start);
    const points=[start,...bookings.map(x=>x.start).filter(d=>d>start&&d<=end)];
    return points.every(d=>bookings.filter(b=>b.start<=d&&b.end>=d).length<store.capacity);
  }
  function routeFor(item,q){
    if(item.status!=='available')return {reason:'This item is no longer available in this demo.'};
    if(item.deadline<today())return {reason:'The venue clearance date has passed.'};
    if(q.date<today())return {reason:'Pickup is in the past.'};
    if(q.date<item.available)return {reason:'The item is not available by your pickup date.'};
    if(q.date<=item.deadline)return {kind:'direct',pickup:q.date};
    const candidates=data.stores.map(store=>{
      // Latest possible intake avoids claiming storage is needed before it is.
      const start=[item.deadline,store.acceptUntil].sort()[0];
      const earliest=[today(),item.available,store.from].sort().at(-1);
      if(start<earliest||store.holdUntil<q.date||!capacityFits(store,start,q.date))return null;
      return {kind:'storage',storeId:store.id,storeName:store.name,start,end:q.date};
    }).filter(Boolean).sort((a,b)=>b.start.localeCompare(a.start));
    return candidates[0]||{reason:'No storage point can accept it by clearance and hold it until pickup with a free slot for the full period.'};
  }
  function cards(){
    $('available-count').textContent=`${data.items.filter(x=>x.status==='available'&&x.deadline>=today()).length} available`;
    $('cards').innerHTML=data.items.map(x=>{
      const expired=x.status==='available'&&x.deadline<today(),status=expired?'expired':x.status;
      const label=status==='handed'?'demo handoff marked':status;
      const r=x.reservation;
      const details=r?(r.kind==='storage'?`Demo plan: ${esc(r.event)} via ${esc(r.storeName)}, ${esc(nice(r.start))}–${esc(nice(r.end))}`:`Demo plan: ${esc(r.event)} · direct pickup ${esc(nice(r.pickup))}`):'';
      return `<article class="card"><div class="card-art"><div class="mini-board">↻</div></div><div class="card-body"><div class="card-top"><span class="status ${esc(status)}">${esc(label)}</span><span class="kicker">${x.demo?'SAMPLE':'LOCAL'}</span></div><h3>${esc(x.name)}</h3><p><strong>${esc(types[x.type]||x.type)}</strong> · ${esc(x.condition)}</p><p>⌖ ${esc(x.location)} · Available ${esc(nice(x.available))} · Clear by ${esc(nice(x.deadline))}</p>${details?`<p><strong>${details}</strong></p>`:''}<div class="card-actions">${x.status==='available'&&!expired?'<a class="link-button" href="#match">Plan pickup ↗</a>':''}${x.status==='reserved'?`<button data-action="handoff" data-id="${esc(x.id)}">Mark demo handoff</button><button data-action="cancel" data-id="${esc(x.id)}">Release</button>`:''}</div></div></article>`;
    }).join('')||'<p>No materials listed yet.</p>';
  }
  function stores(){
    $('storage-cards').innerHTML=data.stores.map(s=>`<article class="card"><div class="card-body"><div class="card-top"><span class="status">${s.demo?'SAMPLE':'LOCAL'}</span><span class="kicker">${s.capacity} ITEM SLOT${s.capacity===1?'':'S'}</span></div><h3>${esc(s.name)}</h3><p>Accepts ${esc(nice(s.from))} – ${esc(nice(s.acceptUntil))}</p><p>Can hold through ${esc(nice(s.holdUntil))}</p><p class="small-note">Availability is checked for each requested date range.</p></div></article>`).join('')||'<p>No storage points in this demo.</p>';
  }
  function results(){
    const el=$('match-results');if(!query){el.innerHTML='<div class="empty-match"><span>⌁</span><p>Your handoff options will appear here.</p></div>';return;}
    if(query.date<today()){el.innerHTML='<p class="result">Choose today or a future pickup date.</p>';return;}
    const selected=data.items.filter(x=>(query.type==='all'||x.type===query.type)&&x.status==='available');
    const options=selected.map(item=>({item,route:routeFor(item,query)}));
    options.sort((a,b)=>(a.route.kind==='direct'?0:a.route.kind==='storage'?1:2)-(b.route.kind==='direct'?0:b.route.kind==='storage'?1:2));
    if(!options.length){el.innerHTML='<div class="empty-match"><p>No available item of this type. Try another type or add an item.</p></div>';return;}
    el.innerHTML=`<p class="form-help">For ${esc(query.event)} · ${esc(nice(query.date))}. Direct options appear first.</p>`+options.map(({item:x,route:r})=>{
      if(!r.kind)return `<div class="result"><h4>${esc(x.name)}</h4><p><strong>No path found.</strong> ${esc(r.reason)}</p></div>`;
      const timeline=r.kind==='direct'?`<strong>DIRECT HANDOFF</strong><br>Collect at ${esc(x.location)} on ${esc(nice(r.pickup))}, before venue clearance on ${esc(nice(x.deadline))}.`:`<strong>STORAGE BRIDGE</strong><br>Move from ${esc(x.location)} to ${esc(r.storeName)} on ${esc(nice(r.start))} (by clearance ${esc(nice(x.deadline))}); hold through pickup ${esc(nice(r.end))}. One item slot is needed for this entire date range.`;
      return `<div class="result"><h4>${esc(x.name)}</h4><p>${timeline}</p><p>Dates and capacity are simulated, not independently confirmed.</p><button type="button" data-action="reserve" data-id="${esc(x.id)}">Reserve in demo ↗</button></div>`;
    }).join('');
  }
  function render(){cards();stores();results();}
  $('need-date').min=today();$('need-date').value=days(5);
  $('match-form').addEventListener('submit',e=>{e.preventDefault();const event=$('need-event').value.trim();if(!event)return;query={type:$('need-type').value,date:$('need-date').value,event};results();});
  $('add-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget),available=String(f.get('available')),deadline=String(f.get('deadline')),name=String(f.get('name')).trim(),location=String(f.get('location')).trim(),condition=String(f.get('condition')).trim();if(!name||!location||!condition){$('add-message').textContent='Please fill out each field with meaningful text.';return;}if(available<today()||deadline<available){$('add-message').textContent='Availability must be today or later and clearance cannot be before availability.';return;}data.items.unshift({id:`item-${Date.now()}-${Math.random().toString(36).slice(2)}`,name,type:String(f.get('type')),available,deadline,location,condition,status:'available',demo:false});save();e.currentTarget.reset();$('add-message').textContent='Added locally. Nobody else can see this listing.';render();});
  $('storage-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget),name=String(f.get('name')).trim(),from=String(f.get('from')),acceptUntil=String(f.get('acceptUntil')),holdUntil=String(f.get('holdUntil')),capacity=Number(f.get('capacity'));if(!name||from<today()||acceptUntil<from||holdUntil<acceptUntil||!Number.isInteger(capacity)||capacity<1||capacity>100){$('storage-message').textContent='Use a name, ordered future dates and a whole-number capacity of 1–100.';return;}data.stores.push({id:`store-${Date.now()}-${Math.random().toString(36).slice(2)}`,name,from,acceptUntil,holdUntil,capacity,demo:false});save();e.currentTarget.reset();$('storage-message').textContent='Storage added locally; it is not a real booking.';render();});
  document.addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(!b)return;const x=data.items.find(i=>i.id===b.dataset.id);if(!x)return;const action=b.dataset.action;if(action==='reserve'&&query){const route=routeFor(x,query);if(!route.kind){results();return;}x.status='reserved';x.reservation={...route,event:query.event};}else if(action==='cancel'&&x.status==='reserved'){x.status='available';delete x.reservation;}else if(action==='handoff'&&x.status==='reserved')x.status='handed';else return;save();render();if(action==='reserve')location.hash='inventory';});
  $('reset').addEventListener('click',()=>{if(!confirm('Reset this local demo? Local v2 listings, storage points and activity in this browser will be removed.'))return;data=seed();query=null;save();render();});
  render();
})();
