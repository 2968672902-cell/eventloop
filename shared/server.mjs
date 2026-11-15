import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.EVENTLOOP_DATA_DIR ? resolve(process.env.EVENTLOOP_DATA_DIR) : join(here, '..', '.data');
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, 'eventloop.sqlite'));
db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL, type TEXT NOT NULL, location TEXT NOT NULL, available TEXT NOT NULL, deadline TEXT NOT NULL, condition TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'available');
CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES items(id), claimant_id INTEGER NOT NULL REFERENCES users(id), pickup TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', owner_confirmed INTEGER NOT NULL DEFAULT 0, claimant_confirmed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS storage_points(id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL, location TEXT NOT NULL, from_date TEXT NOT NULL, accept_until TEXT NOT NULL, hold_until TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 100));
CREATE TABLE IF NOT EXISTS storage_routes(request_id INTEGER PRIMARY KEY REFERENCES requests(id), storage_id INTEGER NOT NULL REFERENCES storage_points(id), storage_start TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS active_claim ON requests(item_id,claimant_id) WHERE status IN ('pending','accepted');
CREATE UNIQUE INDEX IF NOT EXISTS one_accepted ON requests(item_id) WHERE status='accepted';`);
const get=(sql,...args)=>db.prepare(sql).get(...args), all=(sql,...args)=>db.prepare(sql).all(...args), run=(sql,...args)=>db.prepare(sql).run(...args);
const sha=s=>createHash('sha256').update(s).digest('hex');
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const validDate=s=>typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s+'T00:00:00Z')) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const fail=(status,message)=>{const e=new Error(message);e.status=status;throw e;};
const required=(val,max=100)=>{if(typeof val!=='string'||!val.trim()||val.trim().length>max)fail(400,'Please provide valid input.');return val.trim();};
function credentials(body){const username=required(body.username,32);if(!/^[A-Za-z0-9_\-]{3,32}$/.test(username))fail(400,'Username must have 3–32 letters, numbers, underscores or hyphens.');if(typeof body.password!=='string'||body.password.length<8||body.password.length>128)fail(400,'Password must be 8–128 characters.');return {username,password:body.password};}
function send(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));}
function createSession(res,user){const token=randomBytes(32).toString('base64url');run('INSERT INTO sessions VALUES (?,?,?)',sha(token),user.id,Date.now()+7*86400000);send(res,200,{ok:true,user},{'Set-Cookie':`eventloop_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`});}
function session(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('eventloop_session='))?.slice(18);if(!token)return null;return get('SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?',sha(token),Date.now())||null;}
async function bodyOf(req){let n=0,chunks=[];for await(const chunk of req){n+=chunk.length;if(n>16384)fail(413,'Request too large.');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{fail(400,'Invalid JSON.');}}
function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
const requestRow=id=>get(`SELECT r.*,i.name item_name,i.owner_id,i.status item_status,u.username owner_name,c.username claimant_name FROM requests r JOIN items i ON i.id=r.item_id JOIN users u ON u.id=i.owner_id JOIN users c ON c.id=r.claimant_id WHERE r.id=?`,id);
function storageRoute(item,pickup,storageId,checkCapacity=true){
  if(!Number.isSafeInteger(storageId)||storageId<1)fail(400,'Invalid storage point.');
  const s=get('SELECT * FROM storage_points WHERE id=?',storageId);
  if(!s)fail(404,'Storage point not found.');
  if(pickup<=item.deadline)fail(400,'Use direct pickup before clearance.');
  const start=[item.deadline,s.accept_until].sort()[0], earliest=[today(),item.available,s.from_date].sort().at(-1);
  if(start<earliest||s.hold_until<pickup)fail(409,'Storage dates do not cover this handoff.');
  if(checkCapacity){
    const rows=all(`SELECT sr.storage_start AS start,r.pickup AS end FROM storage_routes sr JOIN requests r ON r.id=sr.request_id WHERE sr.storage_id=? AND r.status IN ('accepted','completed') AND sr.storage_start<=? AND r.pickup>=?`,storageId,pickup,start);
    const points=[start,...rows.map(x=>x.start).filter(d=>d>start&&d<=pickup)];
    if(points.some(d=>rows.filter(x=>x.start<=d&&x.end>=d).length>=s.capacity))fail(409,'No storage capacity for the full period.');
  }
  return {start};
}
const staticFiles={'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
const server=http.createServer(async(req,res)=>{try{
  if(!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(req.headers.host||''))fail(403,'Invalid host.');
  const url=new URL(req.url,'http://127.0.0.1');const path=url.pathname;
  if(!path.startsWith('/api/')){if(req.method!=='GET'||!staticFiles[path])return send(res,404,{error:'Not found.'});try{const [file,type]=staticFiles[path];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(readFileSync(join(here,file)));}catch{return send(res,404,{error:'Frontend is not available yet.'});}}
  if(req.method!=='GET' && req.headers.origin && req.headers.origin!==`http://${req.headers.host}`)fail(403,'Invalid origin.');
  if(req.method!=='GET' && !String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))fail(415,'JSON required.');
  let user=session(req);
  if(path==='/api/session' && req.method==='GET')return send(res,200,{user});
  if(path==='/api/register' && req.method==='POST'){const {username,password}=credentials(await bodyOf(req));const salt=randomBytes(16).toString('hex'),hash=scryptSync(password,salt,64).toString('hex');let id;try{id=Number(run('INSERT INTO users(username,salt,password_hash) VALUES (?,?,?)',username,salt,hash).lastInsertRowid);}catch(e){if(String(e.message).includes('UNIQUE'))fail(409,'Username already exists.');throw e;}return createSession(res,{id,username});}
  if(path==='/api/login' && req.method==='POST'){const {username,password}=credentials(await bodyOf(req));const record=get('SELECT * FROM users WHERE username=?',username);const actual=scryptSync(password,record?.salt||'00000000000000000000000000000000',64);const expected=Buffer.from(record?.password_hash||'0'.repeat(128),'hex');if(!record||!timingSafeEqual(actual,expected))fail(401,'Invalid username or password.');return createSession(res,{id:record.id,username:record.username});}
  if(path==='/api/logout' && req.method==='POST'){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('eventloop_session='))?.slice(18);if(token)run('DELETE FROM sessions WHERE token_hash=?',sha(token));return send(res,200,{ok:true},{'Set-Cookie':'eventloop_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
  if(!user)fail(401,'Please sign in.');
  if(path==='/api/storage-points' && req.method==='GET'){return send(res,200,{stores:all('SELECT s.*,u.username owner_name FROM storage_points s JOIN users u ON u.id=s.owner_id ORDER BY s.id DESC')});}
  if(path==='/api/storage-points' && req.method==='POST'){
    const b=await bodyOf(req),name=required(b.name),location=required(b.location),{from_date,accept_until,hold_until,capacity}=b;
    if(!validDate(from_date)||!validDate(accept_until)||!validDate(hold_until)||from_date<today()||accept_until<from_date||hold_until<accept_until||!Number.isInteger(capacity)||capacity<1||capacity>100)fail(400,'Please choose ordered future dates and capacity of 1–100.');
    const id=Number(run('INSERT INTO storage_points(owner_id,name,location,from_date,accept_until,hold_until,capacity) VALUES (?,?,?,?,?,?,?)',user.id,name,location,from_date,accept_until,hold_until,capacity).lastInsertRowid);
    return send(res,201,{ok:true,id});
  }
  if(path==='/api/items' && req.method==='GET'){const items=all(`SELECT i.*,u.username owner_name FROM items i JOIN users u ON u.id=i.owner_id ORDER BY i.id DESC`);return send(res,200,{items});}
  if(path==='/api/items' && req.method==='POST'){const b=await bodyOf(req),name=required(b.name),type=required(b.type,40),location=required(b.location),condition=required(b.condition,500),available=b.available,deadline=b.deadline;if(!validDate(available)||!validDate(deadline)||available<today()||deadline<available)fail(400,'Please choose valid current or future dates in order.');const id=Number(run('INSERT INTO items(owner_id,name,type,location,available,deadline,condition) VALUES (?,?,?,?,?,?,?)',user.id,name,type,location,available,deadline,condition).lastInsertRowid);return send(res,201,{ok:true,id});}
  if(path==='/api/requests' && req.method==='GET'){const requests=all(`SELECT r.*,i.name item_name,i.owner_id,u.username owner_name,c.username claimant_name,s.id storage_id,s.name storage_name,s.location storage_location,sr.storage_start FROM requests r JOIN items i ON i.id=r.item_id JOIN users u ON u.id=i.owner_id JOIN users c ON c.id=r.claimant_id LEFT JOIN storage_routes sr ON sr.request_id=r.id LEFT JOIN storage_points s ON s.id=sr.storage_id WHERE i.owner_id=? OR r.claimant_id=? ORDER BY r.id DESC`,user.id,user.id);return send(res,200,{requests});}
  let m=path.match(/^\/api\/items\/(\d+)\/request$/);
  if(m && req.method==='POST'){const b=await bodyOf(req),id=Number(m[1]);const requestId=transaction(()=>{const item=get('SELECT * FROM items WHERE id=?',id);if(!item)fail(404,'Item not found.');if(item.owner_id===user.id)fail(403,'You cannot request your own item.');if(item.status!=='available')fail(409,'Item is no longer available.');if(!validDate(b.pickup)||b.pickup<today()||b.pickup<item.available)fail(400,'Please choose a valid pickup date.');let route=null;if(b.storage_id!=null)route=storageRoute(item,b.pickup,b.storage_id);else if(b.pickup>item.deadline)fail(400,'Pickup after clearance requires storage.');try{const requestId=Number(run('INSERT INTO requests(item_id,claimant_id,pickup) VALUES (?,?,?)',id,user.id,b.pickup).lastInsertRowid);if(route)run('INSERT INTO storage_routes(request_id,storage_id,storage_start) VALUES (?,?,?)',requestId,b.storage_id,route.start);return requestId;}catch(e){if(String(e.message).includes('UNIQUE'))fail(409,'You already have an active request.');throw e;}});return send(res,201,{ok:true,id:requestId});}
  m=path.match(/^\/api\/requests\/(\d+)\/(accept|handoff|cancel)$/);
  if(m && req.method==='POST'){await bodyOf(req);const id=Number(m[1]),action=m[2];transaction(()=>{const row=requestRow(id);if(!row)fail(404,'Request not found.');if(user.id!==row.owner_id&&user.id!==row.claimant_id)fail(403,'Not a participant.');if(action==='accept'){if(user.id!==row.owner_id)fail(403,'Only the owner may accept.');if(row.status!=='pending'||row.item_status!=='available'||row.pickup<today())fail(409,'This request can no longer be accepted.');const route=get('SELECT * FROM storage_routes WHERE request_id=?',id);if(route){const item=get('SELECT * FROM items WHERE id=?',row.item_id);const verified=storageRoute(item,row.pickup,route.storage_id);run('UPDATE storage_routes SET storage_start=? WHERE request_id=?',verified.start,id);}run("UPDATE requests SET status='accepted' WHERE id=?",id);run("UPDATE items SET status='reserved' WHERE id=?",row.item_id);run("UPDATE requests SET status='declined' WHERE item_id=? AND id<>? AND status='pending'",row.item_id,id);}else if(action==='cancel'){if(!['pending','accepted'].includes(row.status))fail(409,'Request is not active.');if(row.owner_confirmed||row.claimant_confirmed)fail(409,'A confirmed handoff cannot be cancelled.');run("UPDATE requests SET status='cancelled' WHERE id=?",id);if(row.status==='accepted')run("UPDATE items SET status='available' WHERE id=?",row.item_id);}else{if(row.status!=='accepted')fail(409,'Only accepted requests can be confirmed.');const field=user.id===row.owner_id?'owner_confirmed':'claimant_confirmed';if(row[field])fail(409,'You have already confirmed.');run(`UPDATE requests SET ${field}=1 WHERE id=?`,id);const updated=requestRow(id);if(updated.owner_confirmed&&updated.claimant_confirmed){run("UPDATE requests SET status='completed' WHERE id=?",id);run("UPDATE items SET status='handed' WHERE id=?",row.item_id);}}});return send(res,200,{ok:true});}
  return send(res,404,{error:'Not found.'});
}catch(e){if(!e.status)console.error('Request failed:',e.message);if(!res.headersSent)send(res,e.status||500,{error:e.status?e.message:'Server error.'});else res.end();}});
const port=Number(process.env.PORT||8787);server.listen(port,'127.0.0.1',()=>console.log(`EventLoop shared prototype: http://127.0.0.1:${port}`));
