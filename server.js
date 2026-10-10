// Swapi backend: plain Node.js (no npm install) + built-in SQLite.
// Run:  node server.js     then open http://localhost:3000
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, "swapi.db");
const db = new DatabaseSync(DB_FILE);
db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

/* ---------- constants (mirror the frontend) ---------- */
const SKILLS = ["maths", "coding", "science", "lang", "history", "art"];
const HOBBIES = ["gaming", "music", "sport", "read", "cook", "film"];
const PRONOUNS = ["She/Her", "He/Him", "They/Them", ""];
const TIMES = ["Morning", "Afternoon", "Evening"];
const SPEC = {
  maths: ["Algebra", "Calculus", "Statistics", "Geometry", "Linear Algebra", "Probability", "Trigonometry", "Discrete Maths"],
  coding: ["Python", "JavaScript", "C++", "Java", "HTML & CSS", "SQL", "React", "Rust", "Git", "Data Structures", "Machine Learning"],
  science: ["Physics", "Chemistry", "Biology", "Astronomy", "Neuroscience", "Organic Chemistry", "Ecology", "Earth Science"],
  lang: ["Spanish", "French", "Japanese", "German", "Mandarin", "Italian", "Korean", "Arabic", "Academic Writing"],
  history: ["Ancient Rome", "World War II", "Medieval Europe", "Ancient Egypt", "Cold War", "Industrial Revolution", "French Revolution"],
  art: ["Drawing", "Watercolour", "Digital Art", "Graphic Design", "Photography", "Animation", "Colour Theory", "Sketching"],
};
const DEMO_NAMES = ["Mira", "Jonas", "Priya", "Leo", "Zainab", "Kofi", "Ana", "Tomás", "Hana", "Sam", "Ivy", "Dev", "Noor", "Finn"];

/* ---------- helpers ---------- */
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// Strip characters that could break out of HTML. The frontend also escapes, this is defence in depth.
const clean = (v, n) => String(v == null ? "" : v).replace(/[<>&"'`\\]/g, "").replace(/\s+/g, " ").trim().slice(0, n);
const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const topics = (arr, max) =>
  (Array.isArray(arr) ? arr : []).slice(0, max)
    .map((x) => ({ t: clean(x && x.t, 24), k: SKILLS.includes(x && x.k) ? x.k : null }))
    .filter((x) => x.t && x.k);
const json = (v) => JSON.stringify(v);
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

function parseProfile(b) {
  const times = (Array.isArray(b.time) ? b.time : []).filter((t) => TIMES.includes(t));
  return {
    pronouns: PRONOUNS.includes(b.pr) ? b.pr : "",
    goal: clean(b.goal, 60),
    level: int(b.level, 0, 2, 0),
    confidence: int(b.conf, 1, 5, 3),
    hobby: HOBBIES.includes(b.hobby) ? b.hobby : "gaming",
    times: json(times.length ? times : ["Morning"]),
    teach: json(topics(b.teach, 3)),
    want: json(topics(b.want, 5)),
    has_cert: b.cert ? 1 : 0,
  };
}

function uniqueName(base, selfId) {
  base = clean(base, 18) || "Learner";
  let name = base, i = 1;
  const q = db.prepare("SELECT id FROM users WHERE name = ? AND id != ?");
  while (q.get(name, selfId || 0)) name = base.slice(0, 16) + ++i;
  return name;
}

function ratingOf(u) {
  const r = db.prepare("SELECT COUNT(*) n, AVG(useful) avg FROM ratings WHERE to_name = ?").get(u.name);
  let n = r.n, sum = (r.avg || 0) * r.n;
  if (u.is_demo && u.demo_rating_n) { n += u.demo_rating_n; sum += u.demo_rating_avg * u.demo_rating_n; }
  return n ? { n, avg: Math.round((sum / n) * 10) / 10, tags: [] } : null;
}

function userOut(u) {
  return {
    id: u.id, name: u.name, pr: u.pronouns, goal: u.goal, level: u.level, conf: u.confidence,
    hobby: u.hobby, time: parse(u.times, ["Morning"]), teach: parse(u.teach, []), want: parse(u.want, []),
    cert: !!u.has_cert, demo: !!u.is_demo, rs: ratingOf(u),
  };
}

/* ---------- seed demo buddies so a lone user can still match ---------- */
function seed() {
  if (db.prepare("SELECT COUNT(*) n FROM users").get().n) return;
  const ins = db.prepare(`INSERT INTO users (name,is_demo,pronouns,level,confidence,hobby,times,teach,want,has_cert,demo_rating_avg,demo_rating_n)
                          VALUES (?,1,?,?,?,?,?,?,?,?,?,?)`);
  DEMO_NAMES.forEach((name) => {
    const tk = pick(SKILLS), wk = pick(SKILLS), wk2 = pick(SKILLS);
    const teach = [{ t: pick(SPEC[tk]), k: tk }];
    const want = [{ t: pick(SPEC[wk]), k: wk }, { t: pick(SPEC[wk2]), k: wk2 }];
    ins.run(name, pick(["She/Her", "He/Him", "They/Them"]), Math.floor(Math.random() * 3), 1 + Math.floor(Math.random() * 5),
      pick(HOBBIES), json([pick(TIMES)]), json(teach), json(want), Math.random() < 0.4 ? 1 : 0,
      Math.round((3.8 + Math.random() * 1.1) * 10) / 10, 3 + Math.floor(Math.random() * 30));
  });
  console.log(`Seeded ${DEMO_NAMES.length} demo buddies.`);
}
seed();

/* ---------- request plumbing ---------- */
const hits = new Map(); // naive per-IP rate limit: 400 requests / minute
setInterval(() => hits.clear(), 60000).unref();

function send(res, code, body, type = "application/json") {
  res.writeHead(code, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}
const fail = (res, code, msg) => send(res, code, { error: msg });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > 1e6) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { reject(new Error("bad json")); } });
    req.on("error", reject);
  });
}

function authUser(req) {
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || "");
  if (!m) return null;
  const u = db.prepare("SELECT * FROM users WHERE token = ? AND is_demo = 0").get(m[1]);
  if (u) db.prepare("UPDATE users SET last_seen = datetime('now') WHERE id = ?").run(u.id);
  return u || null;
}

const tx = (fn) => { db.exec("BEGIN"); try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; } };
const matched = (a, b) => !!db.prepare("SELECT 1 FROM matches WHERE user_a = ? AND user_b = ?").get(Math.min(a, b), Math.max(a, b));
function makeMatch(a, b) { db.prepare("INSERT OR IGNORE INTO matches (user_a,user_b) VALUES (?,?)").run(Math.min(a, b), Math.max(a, b)); }

/* ---------- routes ---------- */
const routes = {
  "GET /api/health": (req, res) => send(res, 200, { ok: true }),

  "GET /api/stats": (req, res) => {
    const c = (t, w = "") => db.prepare(`SELECT COUNT(*) n FROM ${t} ${w}`).get().n;
    send(res, 200, { learners: c("users", "WHERE is_demo = 0"), matches: c("matches"), messages: c("messages"), sessions: c("sessions"), reflections: c("journal") });
  },

  // Create a profile (no token) or update it (with token).
  "POST /api/profile": (req, res, body, me) => {
    const p = parseProfile(body);
    if (me) {
      const name = uniqueName(body.name || me.name, me.id);
      db.prepare(`UPDATE users SET name=?,pronouns=?,goal=?,level=?,confidence=?,hobby=?,times=?,teach=?,want=?,has_cert=?,updated_at=datetime('now') WHERE id=?`)
        .run(name, p.pronouns, p.goal, p.level, p.confidence, p.hobby, p.times, p.teach, p.want, p.has_cert, me.id);
      return send(res, 200, { id: me.id, name });
    }
    if (db.prepare("SELECT COUNT(*) n FROM users WHERE is_demo = 0").get().n >= 5000) return fail(res, 503, "full");
    const name = uniqueName(body.name, 0), token = crypto.randomBytes(32).toString("hex");
    const r = db.prepare(`INSERT INTO users (name,token,pronouns,goal,level,confidence,hobby,times,teach,want,has_cert) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(name, token, p.pronouns, p.goal, p.level, p.confidence, p.hobby, p.times, p.teach, p.want, p.has_cert);
    send(res, 201, { id: Number(r.lastInsertRowid), name, token });
  },

  // People you haven't swiped on yet. People who already liked you come first.
  "GET /api/buddies": (req, res, body, me, url) => {
    const recycle = url.searchParams.get("recycle") === "1";
    const rows = db.prepare(`
      SELECT u.*,
        COALESCE((SELECT s.liked FROM swipes s WHERE s.from_id = u.id AND s.to_id = @me), 0) AS liked_me,
        COALESCE((SELECT s.boost FROM swipes s WHERE s.from_id = u.id AND s.to_id = @me), 0) AS boosted_me
      FROM users u
      WHERE u.id != @me
        AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.user_a = MIN(u.id, @me) AND m.user_b = MAX(u.id, @me))
        AND (@recycle = 1 OR NOT EXISTS (SELECT 1 FROM swipes s WHERE s.from_id = @me AND s.to_id = u.id))
        AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.from_id = @me AND s.to_id = u.id AND s.liked = 1)
      ORDER BY u.is_demo ASC, boosted_me DESC, liked_me DESC, RANDOM()
      LIMIT 14`).all({ me: me.id, recycle: recycle ? 1 : 0 });
    send(res, 200, { buddies: rows.map(userOut) });
  },

  "POST /api/swipe": (req, res, body, me) => {
    const to = int(body.to, 1, 2 ** 31, 0), liked = body.liked ? 1 : 0, boost = body.boost ? 1 : 0;
    const other = db.prepare("SELECT * FROM users WHERE id = ?").get(to);
    if (!other || other.id === me.id) return fail(res, 404, "no such user");
    db.prepare(`INSERT INTO swipes (from_id,to_id,liked,boost) VALUES (?,?,?,?)
                ON CONFLICT(from_id,to_id) DO UPDATE SET liked=excluded.liked, boost=excluded.boost, created_at=datetime('now')`).run(me.id, to, liked, boost);
    let isMatch = matched(me.id, to);
    if (liked && !isMatch) {
      if (other.is_demo) isMatch = boost === 1 || Math.random() < 0.55;       // demo buddies like back
      else isMatch = !!db.prepare("SELECT 1 FROM swipes WHERE from_id = ? AND to_id = ? AND liked = 1").get(to, me.id); // real people need to like each other
      if (isMatch) makeMatch(me.id, to);
    }
    send(res, 200, { matched: isMatch });
  },

  "GET /api/matches": (req, res, body, me) => {
    const rows = db.prepare(`
      SELECT u.*, m.created_at AS matched_at FROM matches m
      JOIN users u ON u.id = CASE WHEN m.user_a = @me THEN m.user_b ELSE m.user_a END
      WHERE m.user_a = @me OR m.user_b = @me ORDER BY m.id`).all({ me: me.id });
    send(res, 200, { matches: rows.map((u) => ({ ...userOut(u), matched_at: u.matched_at })) });
  },

  "POST /api/messages": (req, res, body, me) => {
    const to = int(body.to, 1, 2 ** 31, 0), text = clean(body.text, 500);
    if (!text) return fail(res, 400, "empty message");
    if (!matched(me.id, to)) return fail(res, 403, "you can only message your matches");
    const r = db.prepare("INSERT INTO messages (from_id,to_id,body) VALUES (?,?,?)").run(me.id, to, text);
    send(res, 201, { id: Number(r.lastInsertRowid) });
  },

  "GET /api/inbox": (req, res, body, me, url) => {
    const after = int(url.searchParams.get("after"), 0, Number.MAX_SAFE_INTEGER, 0);
    const rows = db.prepare(`SELECT m.id, m.from_id, u.name AS from_name, m.body AS text, m.created_at AS at
      FROM messages m JOIN users u ON u.id = m.from_id WHERE m.to_id = ? AND m.id > ? ORDER BY m.id LIMIT 100`).all(me.id, after);
    send(res, 200, { messages: rows });
  },

  // Replace this user's saved progress (called by the frontend whenever it changes).
  "POST /api/progress": (req, res, body, me) => {
    tx(() => {
      db.prepare("UPDATE users SET xp=?, streak=? WHERE id=?").run(int(body.xp, 0, 1e9, 0), int(body.streak, 0, 1e5, 0), me.id);
      for (const t of ["meetings", "sessions", "journal", "skills", "ratings"]) db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(me.id);
      const date = (v) => { const d = new Date(v); return Number.isNaN(+d) ? new Date().toISOString() : d.toISOString(); };
      (Array.isArray(body.meetings) ? body.meetings : []).slice(0, 200).forEach((m) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(m && m.d)) return;
        db.prepare("INSERT INTO meetings (user_id,buddy_name,meet_date,meet_hour) VALUES (?,?,?,?)").run(me.id, clean(m.n, 20), m.d, int(m.h, 0, 23, 9));
      });
      (Array.isArray(body.sessions) ? body.sessions : []).slice(0, 500).forEach((s) => {
        db.prepare(`INSERT OR REPLACE INTO sessions (user_id,client_id,buddy,held_at,seconds,rounds,reactions,headline,my_rating) VALUES (?,?,?,?,?,?,?,?,?)`)
          .run(me.id, int(s.id, 0, Number.MAX_SAFE_INTEGER, 0), clean(s.buddy, 20), date(s.date), int(s.dur, 0, 86400, 0), int(s.rounds, 0, 999, 0), int(s.react, 0, 9999, 0), clean(s.headline, 120), s.myRating ? int(s.myRating, 1, 5, 3) : null);
      });
      (Array.isArray(body.journal) ? body.journal : []).slice(0, 500).forEach((j) => {
        const learned = clean(j.learned, 200); if (!learned) return;
        db.prepare(`INSERT OR REPLACE INTO journal (user_id,session_id,topic,buddy,learned,next_step,done,created_at) VALUES (?,?,?,?,?,?,?,?)`)
          .run(me.id, int(j.sid, 0, Number.MAX_SAFE_INTEGER, 0), clean(j.topic, 24), clean(j.buddy, 20), learned, clean(j.next, 200), j.done ? 1 : 0, date(j.date));
      });
      const sk = body.skills && typeof body.skills === "object" ? Object.entries(body.skills).slice(0, 100) : [];
      sk.forEach(([t, v]) => db.prepare("INSERT OR REPLACE INTO skills (user_id,topic,learned_count,taught_count) VALUES (?,?,?,?)")
        .run(me.id, clean(t, 24), int(v && v.l, 0, 9999, 0), int(v && v.t, 0, 9999, 0)));
      (Array.isArray(body.ratings) ? body.ratings : []).slice(0, 500).forEach((r) => {
        db.prepare(`INSERT OR REPLACE INTO ratings (user_id,session_id,to_name,useful,likes,comment,created_at) VALUES (?,?,?,?,?,?,?)`)
          .run(me.id, int(r.sid, 0, Number.MAX_SAFE_INTEGER, 0), clean(r.to, 20), int(r.useful, 1, 5, 3),
            json((Array.isArray(r.likes) ? r.likes : []).slice(0, 8).map((l) => clean(l, 30))), clean(r.text, 240), date(r.date));
      });
    });
    send(res, 200, { ok: true });
  },

  "GET /api/progress": (req, res, body, me) => {
    const all = (sql) => db.prepare(sql).all(me.id);
    send(res, 200, {
      xp: me.xp, streak: me.streak,
      meetings: all("SELECT buddy_name n, meet_date d, meet_hour h FROM meetings WHERE user_id = ?"),
      sessions: all("SELECT client_id id, buddy, held_at date, seconds dur, rounds, reactions react, headline, my_rating myRating FROM sessions WHERE user_id = ?"),
      journal: all("SELECT session_id sid, topic, buddy, learned, next_step next, done, created_at date FROM journal WHERE user_id = ?"),
      skills: all("SELECT topic, learned_count l, taught_count t FROM skills WHERE user_id = ?"),
    });
  },

  // Delete everything about me.
  "DELETE /api/me": (req, res, body, me) => {
    db.prepare("DELETE FROM users WHERE id = ?").run(me.id);
    send(res, 200, { ok: true });
  },
};
const PUBLIC = new Set(["GET /api/health", "GET /api/stats", "POST /api/profile"]); // profile: auth optional

/* ---------- static files: only the app itself ---------- */
const STATIC = {
  "/": ["swapi.html", "text/html; charset=utf-8"],
  "/index.html": ["swapi.html", "text/html; charset=utf-8"],
  "/swapi-project-image.png": ["swapi-project-image.png", "image/png"],
};

const server = http.createServer(async (req, res) => {
  try {
    const ip = req.socket.remoteAddress || "?";
    const n = (hits.get(ip) || 0) + 1; hits.set(ip, n);
    if (n > 400) return fail(res, 429, "slow down");
    if (req.method === "OPTIONS") return send(res, 204, "", "text/plain");

    const url = new URL(req.url, "http://localhost");
    const key = `${req.method} ${url.pathname}`;

    if (url.pathname.startsWith("/api/")) {
      const handler = routes[key];
      if (!handler) return fail(res, 404, "not found");
      const me = authUser(req);
      if (!me && !PUBLIC.has(key)) return fail(res, 401, "unauthorised");
      const body = req.method === "POST" ? await readBody(req) : {};
      return handler(req, res, body, me, url);
    }

    const f = req.method === "GET" && STATIC[url.pathname];
    if (!f) return fail(res, 404, "not found");
    const file = path.join(__dirname, f[0]);
    if (!fs.existsSync(file)) return fail(res, 404, "not found");
    send(res, 200, fs.readFileSync(file), f[1]);
  } catch (e) {
    if (e.message === "bad json" || e.message === "too large") return fail(res, 400, e.message);
    console.error(e);
    fail(res, 500, "server error");
  }
});

server.listen(PORT, () => console.log(`Swapi running at http://localhost:${PORT}  (database: ${DB_FILE})`));
module.exports = server;
