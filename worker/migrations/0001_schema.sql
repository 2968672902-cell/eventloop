CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT NOT NULL COLLATE NOCASE UNIQUE,salt TEXT NOT NULL,password_hash TEXT NOT NULL);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE items(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,type TEXT NOT NULL,location TEXT NOT NULL,available TEXT NOT NULL,deadline TEXT NOT NULL,condition TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'available');
CREATE TABLE requests(id INTEGER PRIMARY KEY,item_id INTEGER NOT NULL REFERENCES items(id),claimant_id INTEGER NOT NULL REFERENCES users(id),pickup TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',owner_confirmed INTEGER NOT NULL DEFAULT 0,claimant_confirmed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE storage_points(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,location TEXT NOT NULL,from_date TEXT NOT NULL,accept_until TEXT NOT NULL,hold_until TEXT NOT NULL,capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 100));
CREATE TABLE storage_routes(request_id INTEGER PRIMARY KEY REFERENCES requests(id),storage_id INTEGER NOT NULL REFERENCES storage_points(id),storage_start TEXT NOT NULL);
CREATE UNIQUE INDEX active_claim ON requests(item_id,claimant_id) WHERE status IN ('pending','accepted');
CREATE UNIQUE INDEX one_accepted ON requests(item_id) WHERE status='accepted';
CREATE TRIGGER check_capacity BEFORE UPDATE OF status ON requests WHEN NEW.status='accepted' AND EXISTS(SELECT 1 FROM storage_routes WHERE request_id=NEW.id) BEGIN
 SELECT CASE WHEN EXISTS(
  SELECT 1 FROM storage_routes candidate JOIN storage_points s ON s.id=candidate.storage_id
  JOIN (SELECT storage_start AS day FROM storage_routes WHERE request_id=NEW.id UNION SELECT sr.storage_start FROM storage_routes sr JOIN requests r ON r.id=sr.request_id WHERE r.status IN ('accepted','completed') AND sr.storage_id=(SELECT storage_id FROM storage_routes WHERE request_id=NEW.id)) p
  WHERE candidate.request_id=NEW.id AND p.day BETWEEN candidate.storage_start AND NEW.pickup
  AND (SELECT COUNT(*) FROM storage_routes sr JOIN requests r ON r.id=sr.request_id WHERE sr.storage_id=candidate.storage_id AND r.status IN ('accepted','completed') AND sr.storage_start<=p.day AND r.pickup>=p.day)>=s.capacity
 ) THEN RAISE(ABORT,'storage capacity exceeded') END;
END;
