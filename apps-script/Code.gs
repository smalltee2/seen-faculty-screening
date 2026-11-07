/**
 * SEEN "ข้อมูลของฉัน" login backend (Google Apps Script, bound to the private sheet "SEEN Login").
 * Passwordless: a lecturer enters their @up.ac.th e-mail on /me/, this script e-mails a one-time
 * link, the link opens /me/ with a code, and the page exchanges it for a session. The script
 * never serves lecturer data itself: it only tells the page which per-lecturer data folder to
 * load (p/<folder>/data.json on the site), so the sheet holds no publication data.
 *
 * Sheets (created by setup()):
 *   users:    email | name_en | name_th | folder | active        ← admin fills (npm run personal-codes -- --users)
 *   tokens:   email | hash | expires | used | remember | created  ← one-time login codes
 *   sessions: email | hash | expires | created                     ← logged-in devices
 *   log:      time | action | email | ok | note
 *   submissions: works a lecturer adds on "ตรวจสอบคุณสมบัติของฉัน" (status pending → approved/rejected)
 *   admins:   email | name | active   ← level-2 admins who may approve works (Tum fills)
 *
 * Deploy: Deploy → New deployment → Web app, "Execute as: Me", "Who has access: Anyone".
 * The site calls doPost with a text/plain JSON body (no CORS preflight).
 */
var SITE = 'https://smalltee2.github.io/seen-faculty-screening/';
var CODE_MINUTES = 15;
var SESSION_HOURS = 12;
var REMEMBER_DAYS = 30;
var MAX_REQUESTS_PER_HOUR = 5;
var MAX_SUBMISSIONS_PER_DAY = 30;
var SUB_HEAD = ['id', 'email', 'name_en', 'year', 'title', 'authors', 'type', 'venue', 'volume', 'doi', 'research', 'created', 'status', 'decided_by', 'decided_at', 'decision_note'];
var SUB_TYPES = { journal: 1, proceeding: 1, poster: 1 };
// SHA-256 of the approval key stored inside the encrypted level-2 admin data (data/sources.json
// approvalKeyHash; scripts/set-admin-passcode.mjs). Safe to publish. Update after each level-2 passcode change.
var APPROVAL_KEY_HASH = '';

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var want = {
    users: ['email', 'name_en', 'name_th', 'folder', 'active'],
    tokens: ['email', 'hash', 'expires', 'used', 'remember', 'created'],
    sessions: ['email', 'hash', 'expires', 'created'],
    log: ['time', 'action', 'email', 'ok', 'note'],
    submissions: SUB_HEAD,
    admins: ['email', 'name', 'active'],
  };
  Object.keys(want).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(want[name]);
  });
  var first = ss.getSheets()[0];
  if (first.getName() !== 'users' && first.getLastRow() <= 1 && !want[first.getName()]) ss.deleteSheet(first);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'seen-login' })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents || '{}');
  } catch (err) {
    return json({ ok: false, error: 'bad_request' });
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    switch (body.action) {
      case 'request':
        return json(requestLink(body));
      case 'verify':
        return json(verifyCode(body));
      case 'me':
        return json(me(body));
      case 'logout':
        return json(logout(body));
      case 'submit':
        return json(submitWork(body));
      case 'list':
        return json(listWorks());
      case 'decide':
        return json(decideWork(body));
      case 'withdraw':
        return json(withdrawWork(body));
      default:
        return json({ ok: false, error: 'unknown_action' });
    }
  } finally {
    lock.releaseLock();
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function rows(name) {
  var sh = sheet(name);
  var values = sh.getDataRange().getValues();
  var header = values[0];
  return values.slice(1).map(function (r, i) {
    var o = { _row: i + 2 };
    header.forEach(function (h, j) {
      o[h] = r[j];
    });
    return o;
  });
}

function log(action, email, ok, note) {
  sheet('log').appendRow([new Date(), action, email || '', ok ? 'yes' : 'no', note || '']);
}

function normEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function sha256(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) {
      return ('0' + (b & 255).toString(16)).slice(-2);
    })
    .join('');
}

function randomToken() {
  var bytes = [];
  for (var i = 0; i < 32; i++) bytes.push(Math.floor(Math.random() * 256));
  // Math.random is not cryptographic; mix in a UUID and time, then hash.
  return sha256(bytes.join(',') + Utilities.getUuid() + Date.now()).slice(0, 48);
}

function findUser(email) {
  var u = rows('users').filter(function (r) {
    return normEmail(r.email) === email && String(r.active).toLowerCase() !== 'no' && String(r.active) !== 'FALSE';
  });
  return u.length ? u[0] : null;
}

/** Step 1: e-mail a one-time link. Always answers ok so e-mails cannot be enumerated. */
function requestLink(body) {
  var email = normEmail(body.email);
  if (!/^[^@\s]+@up\.ac\.th$/.test(email)) return { ok: false, error: 'not_up_email' };
  var user = findUser(email);
  var admin = findAdmin(email);
  if (!user && !admin) {
    log('request', email, false, 'unknown e-mail');
    return { ok: true };
  }
  var hourAgo = Date.now() - 3600 * 1000;
  var recent = rows('tokens').filter(function (t) {
    return normEmail(t.email) === email && new Date(t.created).getTime() > hourAgo;
  }).length;
  if (recent >= MAX_REQUESTS_PER_HOUR) {
    log('request', email, false, 'rate limit');
    return { ok: false, error: 'rate_limit' };
  }
  var code = randomToken();
  var expires = new Date(Date.now() + CODE_MINUTES * 60 * 1000);
  sheet('tokens').appendRow([email, sha256(code), expires, '', body.remember ? 'yes' : 'no', new Date()]);
  var link = SITE + 'me/#login=' + code;
  var name = user ? user.name_th || user.name_en : admin.name || email;
  MailApp.sendEmail({
    to: email,
    subject: 'ลิงก์เข้าสู่ระบบ ข้อมูลคุณสมบัติของฉัน (SEEN)',
    body:
      'เรียน ' + name + '\n\n' +
      'คลิกลิงก์นี้เพื่อเข้าดูข้อมูลคุณสมบัติของท่าน (ใช้ได้ ' + CODE_MINUTES + ' นาที และใช้ได้ครั้งเดียว):\n' +
      link + '\n\n' +
      'หากท่านไม่ได้ขอลิงก์นี้ ไม่ต้องดำเนินการใด ๆ',
    name: 'SEEN ระบบตรวจสอบคุณสมบัติอาจารย์',
    noReply: true,
  });
  log('request', email, true, '');
  return { ok: true };
}

/** Step 2: exchange the code from the e-mail link for a session. */
function verifyCode(body) {
  var code = String(body.code || '');
  if (!code) return { ok: false, error: 'bad_request' };
  var h = sha256(code);
  var now = Date.now();
  var tokens = rows('tokens');
  var t = null;
  for (var i = 0; i < tokens.length; i++) if (tokens[i].hash === h) t = tokens[i];
  if (!t || t.used || new Date(t.expires).getTime() < now) {
    log('verify', t ? t.email : '', false, !t ? 'no such code' : t.used ? 'already used' : 'expired');
    return { ok: false, error: 'invalid_or_expired' };
  }
  sheet('tokens').getRange(t._row, 4).setValue(new Date());
  var email = normEmail(t.email);
  var user = findUser(email);
  var admin = findAdmin(email);
  if (!user && !admin) return { ok: false, error: 'invalid_or_expired' };
  var remember = String(t.remember) === 'yes';
  var session = randomToken();
  var expires = new Date(now + (remember ? REMEMBER_DAYS * 24 : SESSION_HOURS) * 3600 * 1000);
  sheet('sessions').appendRow([email, sha256(session), expires, new Date()]);
  purgeExpired();
  log('verify', email, true, remember ? 'remember' : '');
  return { ok: true, session: session, email: email, nameEn: user ? user.name_en : '', folder: user ? user.folder : '', isAdmin: !!admin, expires: expires.toISOString() };
}

/** Returning visit with a stored session. */
function me(body) {
  var s = findSession(body.session);
  if (!s) return { ok: false, error: 'no_session' };
  var email = normEmail(s.email);
  var user = findUser(email);
  var admin = findAdmin(email);
  if (!user && !admin) return { ok: false, error: 'no_session' };
  return { ok: true, email: email, nameEn: user ? user.name_en : '', folder: user ? user.folder : '', isAdmin: !!admin, expires: new Date(s.expires).toISOString() };
}

function logout(body) {
  var s = findSession(body.session);
  if (s) sheet('sessions').deleteRow(s._row);
  return { ok: true };
}

function findSession(session) {
  if (!session) return null;
  var h = sha256(String(session));
  var now = Date.now();
  var all = rows('sessions');
  for (var i = 0; i < all.length; i++) if (all[i].hash === h && new Date(all[i].expires).getTime() > now) return all[i];
  return null;
}

/** Drop expired tokens and sessions (called after each login). */
function purgeExpired() {
  ['tokens', 'sessions'].forEach(function (name) {
    var sh = sheet(name);
    var values = sh.getDataRange().getValues();
    var now = Date.now();
    for (var r = values.length - 1; r >= 1; r--) {
      var exp = new Date(values[r][2]).getTime();
      if (exp < now - 24 * 3600 * 1000) sh.deleteRow(r + 1);
    }
  });
}

function findAdmin(email) {
  var sh = sheet('admins');
  if (!sh) return null;
  var a = rows('admins').filter(function (r) {
    return normEmail(r.email) === email && String(r.active).toLowerCase() !== 'no' && String(r.active) !== 'FALSE';
  });
  return a.length ? a[0] : null;
}

/** Text stored in the sheet: trimmed, capped, and never read as a formula. */
function cell(v, max) {
  var t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 500);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

/** A signed-in lecturer adds one of their own works; it waits for a level-2 admin. */
function submitWork(body) {
  var s = findSession(body.session);
  if (!s) return { ok: false, error: 'no_session' };
  var email = normEmail(s.email);
  var user = findUser(email);
  if (!user) return { ok: false, error: 'not_lecturer' };
  var w = body.work || {};
  var year = Number(w.year);
  var thisYear = new Date().getFullYear();
  if (!(year >= 1990 && year <= thisYear + 1) || !String(w.title || '').trim() || !SUB_TYPES[w.type] || !String(w.venue || '').trim()) {
    return { ok: false, error: 'bad_work' };
  }
  var dayAgo = Date.now() - 24 * 3600 * 1000;
  var recent = rows('submissions').filter(function (r) {
    return normEmail(r.email) === email && new Date(r.created).getTime() > dayAgo;
  }).length;
  if (recent >= MAX_SUBMISSIONS_PER_DAY) return { ok: false, error: 'rate_limit' };
  var id = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  sheet('submissions').appendRow([
    id, email, user.name_en, year, cell(w.title, 600), cell(w.authors, 800), w.type, cell(w.venue, 300), cell(w.volume, 120),
    cell(w.doi, 300), w.research ? 'yes' : 'no', new Date(), 'pending', '', '', '',
  ]);
  log('submit', email, true, id);
  return { ok: true, id: id };
}

/** Public list (no e-mail addresses): the site shows pending ones and counts approved ones. */
function listWorks() {
  var items = rows('submissions').map(function (r) {
    return {
      id: String(r.id), nameEn: r.name_en, year: Number(r.year), title: String(r.title), authors: String(r.authors), type: r.type,
      venue: String(r.venue), volume: String(r.volume), doi: String(r.doi), research: r.research === 'yes',
      created: r.created ? new Date(r.created).toISOString() : '', status: r.status || 'pending',
      decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : '', note: String(r.decision_note || ''),
    };
  });
  return { ok: true, items: items };
}

/** A level-2 admin approves or rejects a work: either with the approval key from the level-2
 *  passcode, or signed in by e-mail and listed in the admins sheet. */
function decideWork(body) {
  var email = '';
  var key = String(body.adminKey || '');
  if (key && APPROVAL_KEY_HASH && sha256(key) === APPROVAL_KEY_HASH) {
    email = 'ผู้ดูแลระดับ 2';
  } else {
    var s = findSession(body.session);
    if (!s) return { ok: false, error: key ? 'bad_key' : 'no_session' };
    email = normEmail(s.email);
    if (!findAdmin(email)) return { ok: false, error: 'not_admin' };
  }
  var status = { approved: 1, rejected: 1, pending: 1 }[body.status] ? body.status : '';
  if (!status) return { ok: false, error: 'bad_request' };
  var r = rows('submissions').filter(function (x) { return String(x.id) === String(body.id); })[0];
  if (!r) return { ok: false, error: 'not_found' };
  var col = function (name) { return SUB_HEAD.indexOf(name) + 1; };
  var sh = sheet('submissions');
  sh.getRange(r._row, col('status')).setValue(status);
  sh.getRange(r._row, col('decided_by')).setValue(status === 'pending' ? '' : email);
  sh.getRange(r._row, col('decided_at')).setValue(status === 'pending' ? '' : new Date());
  sh.getRange(r._row, col('decision_note')).setValue(cell(body.note, 300));
  log('decide', email, true, body.id + ' ' + status);
  return { ok: true };
}

/** A lecturer withdraws one of their own works while it is still pending. */
function withdrawWork(body) {
  var s = findSession(body.session);
  if (!s) return { ok: false, error: 'no_session' };
  var email = normEmail(s.email);
  var r = rows('submissions').filter(function (x) { return String(x.id) === String(body.id); })[0];
  if (!r || normEmail(r.email) !== email) return { ok: false, error: 'not_found' };
  if (r.status !== 'pending') return { ok: false, error: 'not_pending' };
  sheet('submissions').getRange(r._row, SUB_HEAD.indexOf('status') + 1).setValue('withdrawn');
  log('withdraw', email, true, body.id);
  return { ok: true };
}
