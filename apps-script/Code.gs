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
 *   conf_decisions: time | key | decision | by | note | name  ← conference decisions from the register buttons
 *   notices:  time | name_en | kind | by | subject | ack_hash | ack_at  ← reminder e-mails; ack_at = lecturer clicked รับทราบ
 *   form_cancels: time | name_en | title_norm | title | action | by  ← admin-form works cancelled/restored from the site
 *
 * Deploy: Deploy → New deployment → Web app, "Execute as: Me", "Who has access: Anyone".
 * The site calls doPost with a text/plain JSON body (no CORS preflight).
 */
// The main address since 2026-11-12 (Cloudflare Pages). The same build is also published at
// https://smalltee2.github.io/seen-faculty-screening/ (GitHub Pages).
var SITE = 'https://seen-education-service.pages.dev/';
// This web app's own URL (data/sources.json loginApiUrl), used in the รับทราบ link; a constant so
// the script needs no extra permission to read its deployment.
var APP_URL = 'https://script.google.com/macros/s/AKfycbxjAV3AbbEVkIiq7qsxVTkj6FXYPwlClPF66Mg96u3jZi_9UA6Cb9Y01PUEtwCE4hPg/exec';
var CODE_MINUTES = 15;
var SESSION_HOURS = 12;
var REMEMBER_DAYS = 30;
var MAX_REQUESTS_PER_HOUR = 5;
var MAX_REQUESTS_PER_HOUR_ALL = 60;
var MAX_FAILED_LOGS_PER_HOUR = 200;
var NOTICE_COOLDOWN_HOURS = 12;
var NOTICE_HEAD = ['time', 'name_en', 'kind', 'by', 'subject', 'ack_hash', 'ack_at']; // one reminder per lecturer per kind within this window
var MAX_NOTICES_PER_DAY = 60; // across all e-mails, so the mail quota cannot be drained
var MAX_SUBMISSIONS_PER_DAY = 30;
// Google Scholar rows imported by a level-2 admin from the admin page (2026-11-08). One batch per import.
var SCH_HEAD = ['time', 'name_en', 'year', 'title', 'authors', 'venue', 'cites', 'by', 'batch'];
var MAX_SCHOLAR_ROWS = 1500;
// Works added through the admin form that a level-2 admin cancelled (or restored) from the site.
// Every press is kept; the latest per lecturer + title wins (site and hourly job).
var FORM_CANCEL_HEAD = ['time', 'name_en', 'title_norm', 'title', 'action', 'by'];
// "อัปเดตจาก Google Scholar" button (2026-11-08): a level-2 admin queues a job; the iMac job
// (scripts/scholar-poll.sh) claims it and reports progress with its own token. SHA-256 of that
// token (kept in the iMac Keychain, service seen-scholar-token). Safe to publish.
var SCHOLAR_TOKEN_HASH = '14df3e4fcae6acad4c6938f39ab72b1df9b1aad3ebdd4d8969815ea946880368';
var JOB_HEAD = ['time', 'by', 'status', 'progress', 'message', 'updated']; // per import (a Scholar profile shows at most ~1,000 rows)
var SUB_HEAD = ['id', 'email', 'name_en', 'year', 'title', 'authors', 'type', 'venue', 'volume', 'doi', 'research', 'created', 'status', 'decided_by', 'decided_at', 'decision_note'];
// SHA-256 of the approval key stored inside the encrypted level-2 admin data (data/sources.json
// approvalKeyHash; scripts/set-admin-passcode.mjs). Safe to publish. Update after each level-2 passcode change.
var APPROVAL_KEY_HASH = 'abe28d12e9f557e4cee21b82b007a2eeb7314379a7025fe74c9476b390075082';

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var want = {
    users: ['email', 'name_en', 'name_th', 'folder', 'active'],
    tokens: ['email', 'hash', 'expires', 'used', 'remember', 'created'],
    sessions: ['email', 'hash', 'expires', 'created'],
    log: ['time', 'action', 'email', 'ok', 'note'],
    submissions: SUB_HEAD,
    admins: ['email', 'name', 'active'],
    conf_decisions: ['time', 'key', 'decision', 'by', 'note', 'name'],
    notices: NOTICE_HEAD,
    scholar_imports: SCH_HEAD,
    scholar_jobs: JOB_HEAD,
    form_cancels: FORM_CANCEL_HEAD,
  };
  Object.keys(want).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(want[name]);
    else {
      // Columns added later (e.g. notices ack_hash/ack_at): extend the header row in place.
      var have = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
      // Rows are written by position, so a missing column goes to its own place; a place already
      // holding another header is a sheet edited by hand and is reported, not overwritten.
      want[name].forEach(function (col, i) {
        if (have.indexOf(col) >= 0) return;
        if (String(have[i] || '').trim() !== '') throw new Error('Sheet "' + name + '": column ' + (i + 1) + ' is "' + have[i] + '", expected "' + col + '". Fix the header row by hand, then run setup again.');
        sh.getRange(1, i + 1).setValue(col);
      });
    }
  });
  var first = ss.getSheets()[0];
  if (first.getName() !== 'users' && first.getLastRow() <= 1 && !want[first.getName()]) ss.deleteSheet(first);
}

function doGet(e) {
  var ack = e && e.parameter && e.parameter.ack;
  if (ack) return ackPage(String(ack));
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'seen-login' })).setMimeType(ContentService.MimeType.JSON);
}

/** The lecturer clicked the รับทราบ link in a reminder: record the time (once) and show a small page. */
function ackPage(token) {
  var lock = LockService.getScriptLock();
  var title = 'ไม่พบลิงก์นี้';
  var text = 'ลิงก์ยืนยันการรับทราบไม่ถูกต้อง หรือถูกลบไปแล้ว';
  // A busy script answers with a page, not an uncaught error.
  var locked = lock.tryLock(20000);
  try {
    if (!locked) {
      title = 'ระบบกำลังทำรายการอื่นอยู่';
      text = 'ยังไม่ได้บันทึกการรับทราบ กรุณากดลิงก์ในอีเมลอีกครั้งในอีกสักครู่';
    } else if (/^[0-9a-f]{32,64}$/.test(token)) {
      var h = sha256(token);
      var n = rows('notices').filter(function (r) { return String(r.ack_hash) === h; })[0];
      if (n) {
        if (!n.ack_at) {
          sheet('notices').getRange(n._row, NOTICE_HEAD.indexOf('ack_at') + 1).setValue(new Date());
          log('ack', n.name_en, true, n.kind);
        }
        title = 'บันทึกการรับทราบแล้ว';
        text = 'ขอบคุณครับ ระบบบันทึกว่าท่านได้รับทราบอีเมลแจ้งเตือนแล้ว' + (n.ack_at ? ' (เคยยืนยันไว้ก่อนแล้ว)' : '') + ' ท่านสามารถดูข้อมูลและเพิ่มผลงานได้ที่แถบ "ตรวจสอบคุณสมบัติของฉัน"';
      }
    }
  } finally {
    if (locked) lock.releaseLock();
  }
  var html =
    '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + title + '</title><style>body{font-family:Sarabun,"Noto Sans Thai",system-ui,sans-serif;background:#efebe2;color:#2c2a25;margin:0;padding:40px 16px}' +
    '.card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #d8d2c6;border-left:5px solid #1d5c33;border-radius:12px;padding:24px 28px}h1{font-size:1.3rem;margin:0 0 10px;color:#1d5c33}p{line-height:1.7;margin:0 0 12px}a{color:#1d5c33}</style></head>' +
    '<body><div class="card"><h1>' + title + '</h1><p>' + text + '</p><p><a href="' + SITE + '#/me">ไปที่ระบบตรวจสอบคุณสมบัติอาจารย์ →</a></p></div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(title);
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents || '{}');
  } catch (err) {
    return json({ ok: false, error: 'bad_request' });
  }
  // Actions that only read a sheet do not wait for the lock: the site asks for several lists at
  // once on every page load, and they would queue behind each other and behind a slow write.
  if (READ_ONLY[String(body.action)] === true) return dispatch(body);
  var lock = LockService.getScriptLock();
  // tryLock, not waitLock: a timeout must reach the site as JSON, not as an uncaught error page.
  if (!lock.tryLock(20000)) return json({ ok: false, error: 'server_busy' });
  try {
    return dispatch(body);
  } finally {
    lock.releaseLock();
  }
}

var READ_ONLY = { me: true, list: true, confList: true, noticeList: true, scholarList: true, scholarJob: true, formCancelList: true, decisionLog: true };

function dispatch(body) {
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
      case 'confDecide':
        return json(confDecide(body));
      case 'confList':
        return json(confList());
      case 'notify':
        return json(notifyLecturer(body));
      case 'noticeList':
        return json(noticeList());
      case 'scholarImport':
        return json(scholarImport(body));
      case 'scholarList':
        return json(scholarList());
      case 'scholarRemove':
        return json(scholarRemove(body));
      case 'scholarRequest':
        return json(scholarRequest(body));
      case 'scholarJob':
        return json(scholarJob());
      case 'scholarJobUpdate':
        return json(scholarJobUpdate(body));
      case 'formCancel':
        return json(formCancel(body));
      case 'formCancelList':
        return json(formCancelList());
      case 'decisionLog':
        return json(decisionLog());
      default:
        return json({ ok: false, error: 'unknown_action' });
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
  if (!sh) return []; // sheet not created yet (run setup)
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
  var sh = sheet('log');
  if (!sh) return;
  if (!ok) {
    // Failed attempts are kept up to MAX_FAILED_LOGS_PER_HOUR an hour, so a flood of bad requests
    // (made-up addresses, guessed codes) cannot fill the sheet that every login reads.
    var cache = CacheService.getScriptCache();
    var hourKey = 'faillog:' + Math.floor(Date.now() / 3600000);
    var n = Number(cache.get(hourKey)) || 0;
    if (n >= MAX_FAILED_LOGS_PER_HOUR) return;
    cache.put(hourKey, String(n + 1), 7200);
  }
  sh.appendRow([new Date(), action, cell(email, 200), ok ? 'yes' : 'no', cell(note, 300)]);
}

/** "active" column: anything but no / false / 0 / unchecked box counts as active. */
function isActive(v) {
  var t = String(v == null ? '' : v).trim().toLowerCase();
  return t !== 'no' && t !== 'false' && t !== '0';
}
/** Own enum membership (Object.prototype names such as "constructor" must not pass). */
function oneOf(v, list) {
  return list.indexOf(String(v)) >= 0;
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
    return normEmail(r.email) === email && isActive(r.active);
  });
  return u.length ? u[0] : null;
}

/** Step 1: e-mail a one-time link. Always answers ok so e-mails cannot be enumerated. */
function requestLink(body) {
  var email = normEmail(body.email);
  if (!/^[^@\s]+@up\.ac\.th$/.test(email)) return { ok: false, error: 'not_up_email' };
  // Rate limits are counted from the log for every address, known or not, so the answer does
  // not reveal which addresses exist; a global cap protects the daily mail quota.
  var hourAgo = Date.now() - 3600 * 1000;
  // Only links actually sent count (ok = yes): otherwise 60 requests for made-up addresses, or 5
  // for a victim's, would lock everyone (or that lecturer) out for an hour (review, 2026-11-07).
  var recentAll = rows('log').filter(function (l) {
    return l.action === 'request' && String(l.ok) === 'yes' && new Date(l.time).getTime() > hourAgo;
  });
  var recent = recentAll.filter(function (l) {
    return normEmail(l.email) === email;
  }).length;
  if (recent >= MAX_REQUESTS_PER_HOUR || recentAll.length >= MAX_REQUESTS_PER_HOUR_ALL) {
    log('request', email, false, 'rate limit');
    return { ok: false, error: 'rate_limit' };
  }
  var user = findUser(email);
  var admin = findAdmin(email);
  if (!user && !admin) {
    log('request', email, false, 'unknown e-mail');
    return { ok: true };
  }
  var code = randomToken();
  var expires = new Date(Date.now() + CODE_MINUTES * 60 * 1000);
  var link = SITE + 'me/#login=' + code;
  var name = user ? user.name_th || user.name_en : admin.name || email;
  // The code is stored only once its e-mail has gone out. A refused send (daily quota, a bounced
  // address) is logged and answered like any other request, so the answer still does not reveal
  // which addresses exist.
  try {
    sendLoginMail(email, name, link);
  } catch (err) {
    log('request', email, false, 'mail failed: ' + String(err && err.message ? err.message : err));
    return { ok: true };
  }
  sheet('tokens').appendRow([email, sha256(code), expires, '', body.remember ? 'yes' : 'no', new Date()]);
  log('request', email, true, '');
  return { ok: true };
}

function sendLoginMail(email, name, link) {
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
  // An unreadable expiry counts as expired (NaN < now is false).
  if (!t || t.used || !(new Date(t.expires).getTime() > now)) {
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
  return { ok: true, session: session, email: email, nameEn: user ? user.name_en : '', folder: user ? user.folder : '', isAdmin: !!admin, expires: expires.toISOString(), remember: remember };
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
    return normEmail(r.email) === email && isActive(r.active);
  });
  return a.length ? a[0] : null;
}

/** Text stored in the sheet: trimmed, capped, and always kept as text. The leading apostrophe is
 *  Sheets' own text marker (it is not part of the stored value), so the sheet never reads the text
 *  as a formula, a number or a date: a volume "3/4" stays "3/4" and a title "2020" stays "2020". */
function cell(v, max) {
  return asText(String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 500));
}

/** A string marked as text for the sheet (see cell); other values (dates, numbers) pass unchanged. */
function asText(v) {
  return typeof v === 'string' && v !== '' ? "'" + v : v;
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
  if (!(year >= 1990 && year <= thisYear + 1) || year !== Math.floor(year) || !String(w.title || '').trim() || !oneOf(w.type, ['journal', 'proceeding', 'poster']) || !String(w.venue || '').trim()) {
    return { ok: false, error: 'bad_work' };
  }
  var dayAgo = Date.now() - 24 * 3600 * 1000;
  var recent = rows('submissions').filter(function (r) {
    return normEmail(r.email) === email && new Date(r.created).getTime() > dayAgo;
  }).length;
  if (recent >= MAX_SUBMISSIONS_PER_DAY) return { ok: false, error: 'rate_limit' };
  var id = 'w' + Utilities.getUuid().replace(/-/g, '').slice(0, 9); // letter first: Sheets keeps it as text
  sheet('submissions').appendRow([
    id, email, user.name_en, year, cell(w.title, 600), cell(w.authors, 800), String(w.type), cell(w.venue, 300), cell(w.volume, 120),
    cell(w.doi, 300), w.research ? 'yes' : 'no', new Date(), 'pending', '', '', '',
  ]);
  log('submit', email, true, id);
  return { ok: true, id: id };
}

/** Public list (no e-mail addresses): the site shows pending ones and counts approved ones. */
function listWorks() {
  var items = rows('submissions').map(function (r) {
    return {
      id: String(r.id), nameEn: r.name_en, year: Number(r.year), title: String(r.title), authors: String(r.authors), type: String(r.type),
      venue: String(r.venue), volume: String(r.volume), doi: String(r.doi), research: r.research === 'yes',
      created: r.created ? new Date(r.created).toISOString() : '', status: r.status || 'pending',
      decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : '', note: String(r.decision_note || ''),
    };
  });
  return { ok: true, items: items };
}

/** Every approve / reject / reopen / withdraw of a self-submitted work, from the log sheet (the
 *  submissions sheet keeps only the latest decision). No e-mail addresses: an admin's address is
 *  cut to the part before @, a lecturer's is not shown at all. */
function decisionLogItems(logRows) {
  var out = [];
  logRows.forEach(function (r) {
    var action = String(r.action);
    if ((action !== 'decide' && action !== 'withdraw') || String(r.ok) !== 'yes') return;
    var parts = String(r.note || '').trim().split(/\s+/);
    if (!parts[0]) return;
    var by = String(r.email || '');
    if (action === 'withdraw') by = 'อาจารย์เจ้าของผลงาน';
    else if (by.indexOf('@') >= 0) by = 'ผู้ดูแล (' + by.split('@')[0].toLowerCase() + ')';
    out.push({ at: r.time ? new Date(r.time).toISOString() : '', action: action, by: by, id: parts[0], status: action === 'withdraw' ? 'withdrawn' : String(parts[1] || '') });
  });
  return out;
}

function decisionLog() {
  return { ok: true, items: decisionLogItems(rows('log')) };
}

/** A level-2 admin approves or rejects a work: either with the approval key from the level-2
 *  passcode, or signed in by e-mail and listed in the admins sheet. */
function adminWho(body) {
  var key = String(body.adminKey || '');
  if (key && APPROVAL_KEY_HASH && sha256(key) === APPROVAL_KEY_HASH) return { who: 'ผู้ดูแลระดับ 2' };
  var s = findSession(body.session);
  if (!s) return { error: key ? 'bad_key' : 'no_session' };
  var email = normEmail(s.email);
  if (!findAdmin(email)) return { error: 'not_admin' };
  return { who: email };
}

function decideWork(body) {
  var auth = adminWho(body);
  if (auth.error) return { ok: false, error: auth.error };
  var email = auth.who;
  var status = oneOf(body.status, ['approved', 'rejected', 'pending']) ? String(body.status) : '';
  if (!status) return { ok: false, error: 'bad_request' };
  var r = rows('submissions').filter(function (x) { return String(x.id) === String(body.id); })[0];
  if (!r) return { ok: false, error: 'not_found' };
  if (r.status === 'withdrawn') return { ok: false, error: 'not_pending' };
  var col = function (name) { return SUB_HEAD.indexOf(name) + 1; };
  var sh = sheet('submissions');
  sh.getRange(r._row, col('status')).setValue(status);
  sh.getRange(r._row, col('decided_by')).setValue(status === 'pending' ? '' : email);
  sh.getRange(r._row, col('decided_at')).setValue(status === 'pending' ? '' : new Date());
  sh.getRange(r._row, col('decision_note')).setValue(cell(body.note, 300));
  log('decide', email, true, String(r.id) + ' ' + status);
  return { ok: true };
}

/** A lecturer withdraws one of their own works while it is still pending. */
function withdrawWork(body) {
  var s = findSession(body.session);
  if (!s) return { ok: false, error: 'no_session' };
  var email = normEmail(s.email);
  // Same check as submitWork: a lecturer set inactive after signing in can no longer act.
  if (!findUser(email)) return { ok: false, error: 'not_lecturer' };
  var r = rows('submissions').filter(function (x) { return String(x.id) === String(body.id); })[0];
  if (!r || normEmail(r.email) !== email) return { ok: false, error: 'not_found' };
  if (r.status !== 'pending') return { ok: false, error: 'not_pending' };
  sheet('submissions').getRange(r._row, SUB_HEAD.indexOf('status') + 1).setValue('withdrawn');
  log('withdraw', email, true, String(r.id));
  return { ok: true };
}

/** A level-2 admin decides a conference from the register: count, no_count, or clear (= use the
 *  automatic result). Every press is kept; the latest per key wins (site and hourly job). */
function confDecide(body) {
  var auth = adminWho(body);
  if (auth.error) return { ok: false, error: auth.error };
  // The key is matched exactly by the site and the hourly job, so it is never cut (a "work:" key is as long as its title).
  var key = String(body.key || '').trim();
  if (key.length > 3000 || /[\t\r\n]/.test(key)) return { ok: false, error: 'bad_request' };
  var decision = oneOf(body.decision, ['count', 'no_count', 'clear']) ? String(body.decision) : '';
  if (!/^(venue|work):/.test(key) || !decision) return { ok: false, error: 'bad_request' };
  var sh = sheet('conf_decisions');
  if (!sh) return { ok: false, error: 'not_configured' };
  sh.appendRow([new Date(), asText(key), decision, auth.who, cell(body.note, 300), cell(body.name, 300)]);
  log('confDecide', auth.who, true, key + ' ' + decision);
  return { ok: true };
}

/** Public list of conference decisions (oldest first). */
function confList() {
  var sh = sheet('conf_decisions');
  if (!sh) return { ok: false, error: 'not_configured' };
  var items = rows('conf_decisions').map(function (r) {
    var by = String(r.by);
    if (by.indexOf('@') >= 0) by = 'ผู้ดูแล (' + by.split('@')[0] + ')'; // no full e-mail addresses in the public list
    return { at: r.time ? new Date(r.time).toISOString() : '', key: String(r.key), decision: String(r.decision), by: by, note: String(r.note || ''), name: String(r.name || '') };
  });
  return { ok: true, items: items };
}

/** A level-2 admin e-mails a lecturer who fails a duty (kind "fail") or may fail next year
 *  (kind "risk"). The address comes from the users sheet, never from the client. */
function notifyLecturer(body) {
  var auth = adminWho(body);
  if (auth.error) return { ok: false, error: auth.error };
  // Plain text, not cell(): cell() adds the sheet's text marker (a leading apostrophe), and this
  // name is compared with the users sheet below.
  var nameEn = String(body.nameEn == null ? '' : body.nameEn).replace(/\s+/g, ' ').trim().slice(0, 120);
  var kind = oneOf(body.kind, ['fail', 'risk']) ? String(body.kind) : '';
  var subject = String(body.subject == null ? '' : body.subject).replace(/\s+/g, ' ').trim().slice(0, 200);
  var text = String(body.body == null ? '' : body.body).slice(0, 4000).trim();
  if (!nameEn || !kind || !subject || !text) return { ok: false, error: 'bad_request' };
  var user = rows('users').filter(function (r) { return String(r.name_en).trim() === nameEn && isActive(r.active); })[0];
  if (!user) return { ok: false, error: 'not_found' };
  var email = normEmail(user.email);
  if (!/^[^@\s]+@up\.ac\.th$/.test(email)) return { ok: false, error: 'not_found' };
  var now = Date.now();
  var sent = rows('notices');
  var dayCount = sent.filter(function (n) { return new Date(n.time).getTime() > now - 24 * 3600 * 1000; }).length;
  if (dayCount >= MAX_NOTICES_PER_DAY) return { ok: false, error: 'rate_limit' };
  var recent = sent.filter(function (n) {
    return String(n.name_en).trim() === nameEn && n.kind === kind && new Date(n.time).getTime() > now - NOTICE_COOLDOWN_HOURS * 3600 * 1000;
  });
  if (recent.length) return { ok: false, error: 'notified_recently' };
  var ackToken = randomToken();
  var ackUrl = APP_URL + '?ack=' + ackToken;
  // The sheet must exist before the mail goes: a reminder that cannot be recorded would escape
  // the cooldown and the daily cap.
  var sh = sheet('notices');
  if (!sh) return { ok: false, error: 'not_configured' };
  try {
    sendNoticeMail(email, subject, text, ackUrl);
  } catch (err) {
    log('notify', auth.who, false, nameEn + ' ' + kind + ' mail failed: ' + String(err && err.message ? err.message : err));
    return { ok: false, error: 'mail_failed' };
  }
  sh.appendRow([new Date(), asText(nameEn), kind, auth.who, cell(subject, 200), sha256(ackToken), '']);
  log('notify', auth.who, true, nameEn + ' ' + kind);
  return { ok: true };
}

function sendNoticeMail(email, subject, text, ackUrl) {
  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: text + '\n\n' +
      'เมื่อได้รับอีเมลนี้แล้ว กรุณากดลิงก์ต่อไปนี้เพื่อยืนยันการรับทราบ (กดได้ครั้งเดียว):\n' + ackUrl + '\n\n' +
      '— ระบบตรวจสอบคุณสมบัติอาจารย์ คณะพลังงานและสิ่งแวดล้อม มหาวิทยาลัยพะเยา\n' +
      'ดูข้อมูลของท่านและเพิ่มผลงานได้ที่ ' + SITE + '#/me',
    name: 'SEEN ระบบตรวจสอบคุณสมบัติอาจารย์',
    noReply: true,
  });
}

/** Public list of reminders sent (no e-mail addresses): the site shows "แจ้งเตือนแล้วเมื่อ …". */
function noticeList() {
  var sh = sheet('notices');
  if (!sh) return { ok: false, error: 'not_configured' };
  var items = rows('notices').map(function (r) {
    var by = String(r.by);
    if (by.indexOf('@') >= 0) by = 'ผู้ดูแล (' + by.split('@')[0] + ')';
    return { at: r.time ? new Date(r.time).toISOString() : '', nameEn: String(r.name_en), kind: String(r.kind), by: by, ackAt: r.ack_at ? new Date(r.ack_at).toISOString() : '' };
  });
  return { ok: true, items: items };
}

/** Google Scholar import (2026-11-08). Scholar has no API and blocks automated access, so a level-2
 *  admin copies a lecturer's list in their own browser (scripts/scholar_export_snippet.js) and pastes
 *  it on the admin page; the site sends only the rows not yet in the system. Rows already imported
 *  for that lecturer (same normalised title) are skipped here as well. */
function scholarSheet() {
  var sh = sheet('scholar_imports');
  if (!sh) {
    sh = SpreadsheetApp.getActiveSpreadsheet().insertSheet('scholar_imports');
    sh.appendRow(SCH_HEAD);
  }
  return sh;
}

function normTitle(t) {
  return String(t || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');
}

function scholarImport(body) {
  var auth = adminWho(body);
  if (auth.error) return { ok: false, error: auth.error };
  var nameEn = String(body.nameEn || '').trim();
  var known = rows('users').some(function (u) { return String(u.name_en).trim() === nameEn; });
  if (!nameEn || !known) return { ok: false, error: 'bad_request' };
  var input = Array.isArray(body.rows) ? body.rows.slice(0, MAX_SCHOLAR_ROWS) : [];
  var thisYear = new Date().getFullYear();
  var sh = scholarSheet();
  var seen = {};
  rows('scholar_imports').forEach(function (r) {
    if (String(r.name_en).trim() === nameEn) seen[normTitle(r.title)] = true;
  });
  var batch = 'b' + Utilities.getUuid().replace(/-/g, '').slice(0, 9);
  var now = new Date();
  var out = [];
  // Rows beyond the cap are reported as skipped, not dropped without a word.
  var skipped = Array.isArray(body.rows) ? Math.max(0, body.rows.length - MAX_SCHOLAR_ROWS) : 0;
  input.forEach(function (w) {
    var title = cell(w && w.title, 600);
    var k = normTitle(title);
    var y = String(w && w.year != null ? w.year : '').trim();
    var year = y === '' ? '' : Number(y);
    if (!k || seen[k] || (year !== '' && !(year >= 1900 && year <= thisYear + 1 && year === Math.floor(year)))) {
      skipped++;
      return;
    }
    seen[k] = true;
    out.push([now, asText(nameEn), year, title, cell(w.authors, 800), cell(w.venue, 300), Math.max(0, Math.floor(Number(w.cites) || 0)), cell(auth.who, 200), batch]);
  });
  if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, SCH_HEAD.length).setValues(out);
  log('scholarImport', auth.who, true, nameEn + ' +' + out.length + ' (' + batch + ')');
  return { ok: true, added: out.length, skipped: skipped, batch: batch };
}

/** Public list (no e-mail addresses), read by the site and the hourly data job. */
function scholarList() {
  if (!sheet('scholar_imports')) return { ok: false, error: 'not_configured' };
  var items = rows('scholar_imports').map(function (r) {
    var by = String(r.by);
    if (by.indexOf('@') >= 0) by = 'ผู้ดูแล (' + by.split('@')[0] + ')';
    return {
      at: r.time ? new Date(r.time).toISOString() : '', nameEn: String(r.name_en), year: r.year === '' ? null : Number(r.year),
      title: String(r.title), authors: String(r.authors), venue: String(r.venue), cites: Number(r.cites) || 0, by: by, batch: String(r.batch),
    };
  });
  return { ok: true, items: items };
}

/** Undo one import: delete every row of that batch. */
function scholarRemove(body) {
  var auth = adminWho(body);
  if (auth.error) return { ok: false, error: auth.error };
  var batch = String(body.batch || '');
  if (!/^b[0-9a-f]{9}$/.test(batch)) return { ok: false, error: 'bad_request' };
  var sh = sheet('scholar_imports');
  if (!sh) return { ok: false, error: 'not_found' };
  // One read and one write: deleting rows one by one is too slow for a batch of hundreds.
  var values = sh.getDataRange().getValues();
  var col = values[0].map(String).indexOf('batch');
  var keep = values.slice(1).filter(function (r) { return String(r[col]) !== batch; });
  var n = values.length - 1 - keep.length;
  if (!n) return { ok: false, error: 'not_found' };
  sh.getRange(2, 1, values.length - 1, values[0].length).clearContent();
  // Written back as text: a plain rewrite would let the sheet re-read a title such as "2020" as a number.
  if (keep.length) sh.getRange(2, 1, keep.length, values[0].length).setValues(keep.map(function (r) { return r.map(asText); }));
  log('scholarRemove', auth.who, true, batch + ' -' + n);
  return { ok: true, removed: n };
}

/** A level-2 admin cancels a work added through the admin form (action "cancel"), or puts it
 *  back ("restore"). The form's responses sheet is left as it is. */
function formCancel(body) {
  var auth = adminWho(body);
  if (auth.error) return { ok: false, error: auth.error };
  var nameEn = String(body.nameEn || '').trim();
  var title = cell(body.title, 600);
  // From the full title: the site and the build compare the whole title. A restore sends the key
  // of the press it undoes (titleNorm), because the title kept in the sheet is cut at 600 characters.
  var k = normTitle(String(body.titleNorm || body.title || ''));
  var action = oneOf(body.mode, ['cancel', 'restore']) ? String(body.mode) : '';
  if (!nameEn || !k || !action) return { ok: false, error: 'bad_request' };
  var sh = sheet('form_cancels');
  if (!sh) {
    sh = SpreadsheetApp.getActiveSpreadsheet().insertSheet('form_cancels');
    sh.appendRow(FORM_CANCEL_HEAD);
  }
  sh.appendRow([new Date(), asText(nameEn), asText(k), title, action, auth.who]);
  log('formCancel', auth.who, true, nameEn + ' ' + action + ' ' + k.slice(0, 60));
  return { ok: true };
}

/** Public list of form cancellations (oldest first; no e-mail addresses). */
function formCancelList() {
  if (!sheet('form_cancels')) return { ok: false, error: 'not_configured' };
  var items = rows('form_cancels').map(function (r) {
    var by = String(r.by);
    if (by.indexOf('@') >= 0) by = 'ผู้ดูแล (' + by.split('@')[0] + ')';
    return { at: r.time ? new Date(r.time).toISOString() : '', nameEn: String(r.name_en), titleNorm: String(r.title_norm), title: String(r.title), action: String(r.action), by: by };
  });
  return { ok: true, items: items };
}

/** Scholar refresh jobs. Only the latest row matters; a new request is refused while one waits or runs
 *  (unless it has been silent for 3 hours, e.g. the iMac was off). */
function jobSheet() {
  var sh = sheet('scholar_jobs');
  if (!sh) {
    sh = SpreadsheetApp.getActiveSpreadsheet().insertSheet('scholar_jobs');
    sh.appendRow(JOB_HEAD);
  }
  return sh;
}

function latestJob() {
  var all = rows('scholar_jobs');
  return all.length ? all[all.length - 1] : null;
}

function jobOut(r) {
  if (!r) return null;
  var by = String(r.by);
  if (by.indexOf('@') >= 0) by = 'ผู้ดูแล (' + by.split('@')[0] + ')';
  return {
    at: r.time ? new Date(r.time).toISOString() : '', by: by, status: String(r.status), progress: String(r.progress || ''),
    message: String(r.message || ''), updated: r.updated ? new Date(r.updated).toISOString() : '',
  };
}

function scholarRequest(body) {
  var auth = adminWho(body);
  if (auth.error) return { ok: false, error: auth.error };
  jobSheet();
  var last = latestJob();
  var silentFor = last ? Date.now() - new Date(last.updated || last.time).getTime() : Infinity;
  if (last && (last.status === 'requested' || last.status === 'running') && silentFor < 3 * 3600 * 1000) return { ok: false, error: 'busy', job: jobOut(last) };
  var now = new Date();
  jobSheet().appendRow([now, cell(auth.who, 200), 'requested', '', '', now]);
  log('scholarRequest', auth.who, true, '');
  return { ok: true, job: jobOut(latestJob()) };
}

function scholarJob() {
  return { ok: true, job: jobOut(sheet('scholar_jobs') ? latestJob() : null) };
}

/** The iMac job: step "claim" takes a waiting job; "update" reports progress or the end. */
function scholarJobUpdate(body) {
  if (!SCHOLAR_TOKEN_HASH || sha256(String(body.token || '')) !== SCHOLAR_TOKEN_HASH) return { ok: false, error: 'bad_key' };
  var last = sheet('scholar_jobs') ? latestJob() : null;
  if (!last) return { ok: true, job: null };
  var col = function (name) { return JOB_HEAD.indexOf(name) + 1; };
  var sh = jobSheet();
  if (body.step === 'claim') {
    if (last.status !== 'requested') return { ok: true, job: null };
    sh.getRange(last._row, col('status')).setValue('running');
    sh.getRange(last._row, col('updated')).setValue(new Date());
    return { ok: true, job: jobOut(latestJob()) };
  }
  if (last.status !== 'running') return { ok: false, error: 'not_running' };
  var status = oneOf(body.status, ['running', 'done', 'blocked', 'failed']) ? String(body.status) : 'running';
  sh.getRange(last._row, col('status')).setValue(status);
  sh.getRange(last._row, col('progress')).setValue(cell(body.progress, 100));
  sh.getRange(last._row, col('message')).setValue(cell(body.message, 500));
  sh.getRange(last._row, col('updated')).setValue(new Date());
  if (status !== 'running') log('scholarJob', 'imac', status === 'done', status + ' ' + cell(body.message, 200));
  return { ok: true };
}

// ───────────────────────── Stale-data alert (2026-11-10) ─────────────────────────
// The site publishes status.json: when the site was built and when each source last really
// answered (data/status/*.txt, written by the fetch scripts only on success). checkFreshness()
// runs once a day from a time trigger and e-mails the admin while anything is older than
// STALE_HOURS: a failed GitHub Actions run, an iMac that is off, a refused Scopus key or an
// unreadable form all show up as a time that stopped moving. Same rule as src/freshness.ts
// (src/freshness.test.ts runs both on the same cases).
//
// One-time setup by the script owner: run installAlertTrigger() in the editor (it asks for the
// new permissions: fetch an external URL, manage triggers). The address is the Script Property
// ALERT_EMAIL (Project Settings → Script Properties); without it the mail goes to the script owner.
var STATUS_URL = SITE + 'status.json';
var STALE_HOURS = 48;
var STALE_WATCHED = ['build', 'scopus', 'openalex', 'forms']; // Scholar is refreshed by hand
var STALE_LABEL = {
  build: 'การสร้างเว็บ (GitHub Actions)',
  scopus: 'Scopus (งานบน iMac 07:30)',
  openalex: 'OpenAlex (GitHub Actions 03:00)',
  forms: 'Google Form (GitHub Actions ทุกชั่วโมง)',
};

/** Pure: the watched sources that are stale. status = parsed status.json; nowMs = Date.now(). */
function staleSources(status, nowMs) {
  var f = (status && status.freshness) || {};
  var times = { build: status && status.builtAt, scopus: f.scopus, openalex: f.openalex, forms: f.forms };
  var out = [];
  STALE_WATCHED.forEach(function (key) {
    var t = typeof times[key] === 'string' ? Date.parse(times[key]) : NaN;
    var hours = isNaN(t) ? null : Math.max(0, Math.floor((nowMs - t) / 3600000));
    if (hours === null || hours > STALE_HOURS) out.push({ key: key, at: isNaN(t) ? null : times[key], hours: hours });
  });
  return out;
}

/** Daily (time trigger). Sends at most one e-mail per day, and none while everything is fresh. */
function checkFreshness() {
  var props = PropertiesService.getScriptProperties();
  var problems = [];
  var unreadable = '';
  try {
    var res = UrlFetchApp.fetch(STATUS_URL + '?t=' + Date.now(), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) unreadable = 'HTTP ' + res.getResponseCode();
    else problems = staleSources(JSON.parse(res.getContentText()), Date.now());
  } catch (err) {
    unreadable = String(err && err.message ? err.message : err);
  }
  if (!unreadable && !problems.length) {
    log('freshness', '', true, 'fresh');
    return 'fresh';
  }
  var today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  if (props.getProperty('ALERT_SENT_ON') === today) return 'already sent today';
  var to = props.getProperty('ALERT_EMAIL') || Session.getEffectiveUser().getEmail();
  // A missing permission is the script's own problem, not stale data: say so, and how to fix it.
  var noPermission = /permission|authorization|script\.external_request/i.test(unreadable);
  var lines = unreadable
    ? noPermission
      ? ['สคริปต์แจ้งเตือนยังไม่ได้รับสิทธิ์อ่านเว็บ (' + unreadable + ')', 'แก้: เปิดโปรเจกต์ Apps Script เลือกฟังก์ชัน checkFreshness แล้วกด Run และกดอนุญาตสิทธิ์ (ทำครั้งเดียว)', 'ข้อมูลของเว็บอาจยังอัปเดตตามปกติ ตรวจได้ที่หน้าผู้ดูแล']
      : ['อ่านไฟล์สถานะของเว็บไม่ได้ (' + unreadable + '): ' + STATUS_URL, 'เว็บอาจล่ม หรือการ deploy ครั้งล่าสุดล้มเหลว']
    : problems.map(function (p) {
        return '• ' + STALE_LABEL[p.key] + ': ' + (p.at ? 'ครั้งล่าสุด ' + Utilities.formatDate(new Date(p.at), 'Asia/Bangkok', 'd MMM yyyy HH:mm') + ' น. (' + Math.floor(p.hours / 24) + ' วันที่แล้ว)' : 'ไม่มีบันทึกเวลา');
      });
  MailApp.sendEmail({
    to: to,
    subject: unreadable
      ? '[SEEN] ระบบแจ้งเตือนตรวจสถานะเว็บไม่ได้'
      : '[SEEN] ข้อมูลระบบตรวจสอบคุณสมบัติอาจารย์ไม่อัปเดตเกิน 2 วัน',
    body:
      (unreadable ? 'ระบบแจ้งเตือนตรวจสถานะข้อมูลของเว็บไม่ได้\n\n' : 'ระบบตรวจพบว่าข้อมูลต่อไปนี้ไม่ได้อัปเดตเกิน ' + STALE_HOURS + ' ชั่วโมง\n\n') + lines.join('\n') +
      '\n\nตรวจได้ที่\n- GitHub Actions: https://github.com/smalltee2/seen-faculty-screening/actions\n- iMac: ~/Library/Logs/seen-scopus.log\n- หน้าผู้ดูแลของเว็บ (แหล่งข้อมูล): ' + SITE + 'sfs.html#/admin' +
      '\n\nอีเมลนี้ส่งวันละไม่เกิน 1 ฉบับ และจะหยุดเองเมื่อข้อมูลกลับมาอัปเดต',
  });
  props.setProperty('ALERT_SENT_ON', today);
  log('freshness', to, false, unreadable || problems.map(function (p) { return p.key; }).join(','));
  return 'sent';
}

/** Run once in the editor: (re)installs the daily check at about 09:00 Bangkok time. */
function installAlertTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkFreshness') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkFreshness').timeBased().everyDays(1).atHour(9).inTimezone('Asia/Bangkok').create();
  return 'installed';
}
