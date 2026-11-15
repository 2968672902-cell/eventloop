import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker from './index.mjs';
const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(fileURLToPath(new URL('./migrations/0001_schema.sql',import.meta.url)),'utf8'));
class Statement{constructor(sql){this.sql=sql;this.args=[]}bind(...args){this.args=args;return this}async first(){return sqlite.prepare(this.sql).get(...this.args)||null}async all(){return {results:sqlite.prepare(this.sql).all(...this.args)}}async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}}
const DB={prepare:s=>new Statement(s),async batch(list){sqlite.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of list)out.push(await s.run());sqlite.exec('COMMIT');return out}catch(e){sqlite.exec('ROLLBACK');throw e}}};
async function call(path,{method='GET',body,cookie}={}){const headers={'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})};const res=await worker.fetch(new Request('https://eventloop.test'+path,{method,headers,...(method==='GET'?{}:{body:JSON.stringify(body||{})})}),{DB});const data=await res.json();return {status:res.status,data,cookie:res.headers.get('set-cookie')?.split(';')[0]}}
const post=(path,body,cookie)=>call(path,{method:'POST',body,cookie});
const a=await post('/api/register',{username:'owner',password:'example-pass-123'}),b=await post('/api/register',{username:'reader',password:'example-pass-456'}),c=await post('/api/register',{username:'reader2',password:'example-pass-789'});assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(c.status,200);
const day=n=>{let t=new Date();t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)};
const make=()=>post('/api/items',{name:'Board',type:'sign',location:'Campus',condition:'Usable',available:day(1),deadline:day(2)},a.cookie);
const item1=await make(),item2=await make();const store=await post('/api/storage-points',{name:'Cupboard',location:'Campus',from_date:day(1),accept_until:day(2),hold_until:day(7),capacity:1},a.cookie);assert.equal(store.status,201);
const r1=await post(`/api/items/${item1.data.id}/request`,{pickup:day(5),storage_id:store.data.id},b.cookie),r2=await post(`/api/items/${item2.data.id}/request`,{pickup:day(5),storage_id:store.data.id},c.cookie);assert.equal(r1.status,201);assert.equal(r2.status,201);
const x=await post(`/api/requests/${r1.data.id}/accept`,{},a.cookie),y=await post(`/api/requests/${r2.data.id}/accept`,{},a.cookie);assert.equal(x.status,200);assert.equal(y.status,409);
const item3=await make();assert.equal((await post(`/api/items/${item3.data.id}/request`,{pickup:day(5),storage_id:store.data.id},b.cookie)).status,409);
assert.equal((await post(`/api/requests/${r1.data.id}/cancel`,{},c.cookie)).status,403);
assert.equal((await post(`/api/requests/${r1.data.id}/cancel`,{},a.cookie)).status,200);
assert.equal((await post(`/api/requests/${r2.data.id}/accept`,{},a.cookie)).status,200);
assert.equal((await post(`/api/requests/${r1.data.id}/cancel`,{},a.cookie)).status,409);
assert.equal((await post(`/api/requests/${r2.data.id}/cancel`,{},a.cookie)).status,200);
const r3=await post(`/api/items/${item1.data.id}/request`,{pickup:day(5),storage_id:store.data.id},b.cookie);assert.equal(r3.status,201);assert.equal((await post(`/api/requests/${r3.data.id}/accept`,{},a.cookie)).status,200);
assert.equal((await post(`/api/requests/${r3.data.id}/handoff`,{},c.cookie)).status,403);assert.equal((await post(`/api/requests/${r3.data.id}/handoff`,{},a.cookie)).status,200);assert.equal((await post(`/api/requests/${r3.data.id}/handoff`,{},b.cookie)).status,200);
const mine=await call('/api/requests',{cookie:b.cookie});assert.equal(mine.data.requests[0].status,'completed');assert.equal((await call('/api/items',{cookie:c.cookie})).data.items.find(x=>x.id===item1.data.id).status,'handed');console.log('D1-compatible API: storage capacity, authorization and dual confirmation passed using local SQLite shim.');
