import postgres from 'postgres';
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import * as C from './content.mjs';

const SECRET = process.env.SESSION_SECRET || '', CERT_TO = process.env.CERT_EMAIL || 'vutomiringana@gmail.com', PAY = process.env.PAYSHAP_ID || '';
const ADMINS = String(process.env.ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const TRANSIENT = new Set(['CONNECT_TIMEOUT', 'CONNECTION_ENDED', 'CONNECTION_CLOSED', 'CONNECTION_DESTROYED', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN']);
const err = (m, s = 400) => Object.assign(new Error(m), { status: s });
const rid = p => p + Date.now().toString(36) + randomBytes(3).toString('hex');
let db;
const tableNames = new Set(['users', 'payments', 'certs']);
const jsonKeys = new Set(['email', 'idNumber', 'phone', 'boss', 'uid']);
function database() {
  if (!process.env.DATABASE_URL) throw err('Server database is not configured. Set DATABASE_URL in Vercel Environment Variables, then redeploy.', 503);
  if (!db) db = postgres(process.env.DATABASE_URL, { max: 5, idle_timeout: 20, connect_timeout: 20, ssl: 'require' });
  return db;
}
const table = t => { if (!tableNames.has(t)) throw err('Invalid database table.', 500); return database()(t); };
const get = async (t, id) => { const rows = await database()`SELECT data FROM ${table(t)} WHERE id = ${id} LIMIT 1`; return rows[0]?.data ?? null; };
const put = async (t, d) => { try { await database()`INSERT INTO ${table(t)} (id, data) VALUES (${d.id}, ${database().json(d)}) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`; return d; } catch (e) { console.error('Database write failed:', e.message); throw Object.assign(err('Could not save your information (' + (e.code || e.name) + '). Please try again.', 500), { code: e.code }); } };
const where = async (t, k, v) => { if (!jsonKeys.has(k)) throw err('Invalid search field.', 500); const rows = await database()`SELECT data FROM ${table(t)} WHERE data->>${k} = ${String(v)}`; return rows.map(r => r.data); };
const isAdmin = u => !!u.admin || (!!u.email && ADMINS.includes(String(u.email).toLowerCase()));
const payList = async () => (await database()`SELECT data - 'proof' AS data, (data->'proof') IS NOT NULL AS has_proof FROM payments`).map(r => ({ ...r.data, hasProof: r.has_proof }));
const all = async t => { const rows = await database()`SELECT data FROM ${table(t)}`; return rows.map(r => r.data); };
const hash = p => { const s = randomBytes(16).toString('hex'); return s + ':' + scryptSync(p, s, 32).toString('hex'); };
const same = (p, h) => { const [s, k] = String(h).split(':'); return !!k && timingSafeEqual(Buffer.from(k, 'hex'), scryptSync(p, s, 32)); };
const sign = id => { const b = id + '.' + (Date.now() + 7 * 864e5); return b + '.' + createHmac('sha256', SECRET).update(b).digest('hex'); };
const unsign = t => { const [id, exp, sig] = String(t || '').split('.'); if (!sig || +exp < Date.now()) return null; const ok = createHmac('sha256', SECRET).update(id + '.' + exp).digest('hex'); return ok.length === sig.length && timingSafeEqual(Buffer.from(ok), Buffer.from(sig)) ? id : null; };
const email = v => { const e = String(v || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ''; };
const phone = v => { let d = String(v || '').replace(/\D/g, ''); if (d.startsWith('27')) d = '0' + d.slice(2); return /^0\d{9}$/.test(d) ? d : ''; };
const saId = s => { if (!/^\d{13}$/.test(s)) return false; const m = +s.slice(2, 4), d = +s.slice(4, 6); if (m < 1 || m > 12 || d < 1 || d > 31) return false; let t = 0; for (let i = 0; i < 13; i++) { let x = +s[i]; if (i % 2) { x *= 2; if (x > 9) x -= 9; } t += x; } return t % 10 === 0; };
const idn = v => { const s = String(v || '').toUpperCase().replace(/[\s-]/g, ''); if (/^\d{13}$/.test(s)) return saId(s) ? s : ''; return /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{6,9}$/.test(s) ? s : ''; };
const pw = p => typeof p === 'string' && p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);
const P = u => u.paid || (u.paid = { course: false, membership: 0, att: false, used: 0, webinars: [] });
const grant = (u, r) => { const p = P(u); if (r.type === 'course') p.course = true; else if (r.type === 'membership') p.membership = Math.max(p.membership, Date.now()) + 30 * 864e5; else if (r.type === 'assessment') { p.att = true; p.used = 0; } else if (!p.webinars.includes(r.itemId)) p.webinars.push(r.itemId); };

async function mail(subject, html) {
  if (!process.env.RESEND_API_KEY) return 'not-configured';
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.MAIL_FROM || 'CSDSA Learning Academy <onboarding@resend.dev>', to: [CERT_TO], subject, html }) });
    return r.ok ? 'sent' : 'failed';
  } catch (_) { return 'failed'; }
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const certMail = (c, u, ask) => mail((ask ? 'Certificate for signature: ' : 'Certificate issued: ') + c.number,
  `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:3px double #087443;padding:28px;text-align:center"><h2 style="color:#087443">CSDSA Learning Academy</h2><p>${ask ? 'Please sign this certificate.' : 'All requirements are complete.'}</p><h1>${esc(c.learner)}</h1><p>${esc(u.company || '')}</p><p>${esc(c.course)}</p><p>Score: <b>${c.score}/${c.total}</b> · Certificate no. <b>${esc(c.number)}</b></p><p>Issued ${new Date(c.issuedAt).toDateString()}</p><p><a href="${esc(process.env.SITE_URL || '')}/?verify=${esc(c.verifyToken)}">Verify this certificate</a></p></div>`);

async function meOf(u) {
  const p = P(u), [cert, pays, staff] = await Promise.all([get('certs', u.id), where('payments', 'uid', u.id), where('users', 'boss', u.id)]);
  const employees = await Promise.all(staff.map(async e => {
    const q = await where('payments', 'uid', e.id), ec = await get('certs', e.id);
    return { id: e.id, name: e.name, phone: e.phone || '', email: e.email || '', idNumber: e.idNumber, jobTitle: e.job, enrolled: P(e).course, payState: P(e).course ? 'Paid' : q.some(r => r.type === 'course' && r.status === 'pending' && r.submitted) ? 'Payment under review' : 'Awaiting payment', quizCompleted: !!e.result, lastScore: e.result ? e.result.score : null, passed: !!(e.result && e.result.passed), lastActive: e.result ? e.result.completed_at : null, attempts: P(e).used, certNo: ec ? ec.number : '' };
  }));
  return {
    user: { id: u.id, name: u.name, email: u.email || '', phone: u.phone || '', idNumber: u.idNumber || '', type: u.type, company: u.company || '', isAdmin: isAdmin(u), mustChangePassword: !!u.must },
    access: { course: p.course, membership: p.membership > Date.now(), membershipExpiresAt: p.membership ? new Date(p.membership).toISOString() : null, assessment: { paid: p.att, attemptsUsed: p.used, attemptsMax: 1, canAttempt: p.att && p.used < 1 }, webinars: p.webinars },
    lastResult: u.result || null, certificate: cert || null,
    payments: pays.map(({ proof, ...r }) => r).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), employees
  };
}

async function route(path, b, token) {
  if (path === '/config') return { fees: C.DFEES, payShapId: PAY, passMark: 80 };
  if (path === '/auth/register') {
    const e = email(b.email); if (!e) throw err('Enter a valid email address.'); if (!pw(b.password)) throw err('Password must be at least 8 characters with a letter and a number.');
    if (!b.first_name || !b.last_name) throw err('Enter your first name and surname.'); if ((await where('users', 'email', e)).length) throw err('An account with this email already exists. Sign in instead.');
    const n = { id: rid('u'), name: b.first_name + ' ' + b.last_name, email: e, pw: hash(b.password), type: b.account_type === 'business' ? 'business' : 'individual', company: b.company_name || '', title: b.title || '', country: b.country || '', qualification: b.qualification || '' };
    await put('users', n); return { session: { access_token: sign(n.id) } };
  }
  if (path === '/auth/login') {
    const raw = String(b.identifier || '').trim(); let f = null;
    if (raw.includes('@')) f = (await where('users', 'email', raw.toLowerCase()))[0];
    else { const ph = phone(raw), id = raw.toUpperCase().replace(/[\s-]/g, ''); f = (ph && (await where('users', 'phone', ph))[0]) || (await where('users', 'idNumber', id))[0]; }
    if (!f || !same(b.password || '', f.pw)) throw err('Those sign-in details or the password are not correct. Employees: use your ID / passport number (or cellphone) and the password your employer gave you.', 401);
    return { session: { access_token: sign(f.id) } };
  }
  if (path === '/auth/reset-request' || path === '/auth/reset-complete') throw err('Please contact CSDSA to reset your password.');
  if (path.startsWith('/certificates/verify/')) { const t = decodeURIComponent(path.split('/').pop()), c = (await all('certs')).find(x => x.verifyToken === t); if (!c) throw err('Not found', 404); return { certificate: { learner: c.learner, course: c.course, score: c.score, total: c.total, number: c.number, issuedAt: c.issuedAt, verifyToken: c.verifyToken, signStatus: c.signStatus } }; }
  const uid = unsign(token), u = uid && await get('users', uid); if (!u) throw err('Please sign in again.', 401);
  const p = P(u);
  if (path === '/me') return meOf(u);
  if (path === '/auth/change-password') { if (!same(b.current_password || '', u.pw)) throw err('Your current password is not correct.'); if (!pw(b.new_password)) throw err('Password must be at least 8 characters with a letter and a number.'); u.pw = hash(b.new_password); u.must = false; await put('users', u); return { message: 'Password updated.' }; }
  if (path === '/content/free') return { content: { title: 'Introduction to food safety', body: ['Food safety protects customers and your business. Unsafe food can cause serious illness, product recalls and legal action.', 'Good hygiene, correct temperatures, clean premises and accurate records are the foundations of safe food. This free overview introduces the ideas covered in the full course.'] } };
  if (path === '/content/course') { if (!p.course) throw err('Course access required.', 403); return { modules: C.SYLLABUS.map((m, i) => ({ ...m, content: C.MOD[i][0], check: C.MOD[i][1] })) }; }
  if (path === '/content/member-library') { if (p.membership < Date.now()) throw err('Membership required.', 403); return { sections: C.MEMBER_LIB, expiresAt: new Date(p.membership).toISOString() }; }
  if (path.startsWith('/content/webinar/')) { if (!p.webinars.includes(decodeURIComponent(path.split('/').pop()))) throw err('Purchase required.', 403); return { embedUrl: null }; }
  if (path === '/payment-requests') {
    if (!C.ITEM_TITLE[b.item_type]) throw err('Unknown item.');
    const r = { id: rid('p'), uid: u.id, type: b.item_type, title: C.ITEM_TITLE[b.item_type], amount: C.DFEES[b.item_type], reference: 'CSDSA-' + randomBytes(3).toString('hex').toUpperCase(), status: 'pending', submitted: false, itemId: b.item_id || null, createdAt: new Date().toISOString() };
    await put('payments', r); return { request: r };
  }
  if (/^\/payment-requests\/[^/]+\/submit$/.test(path)) {
    const r = await get('payments', path.split('/')[2]); if (!r || r.uid !== u.id) throw err('Not found', 404);
    const f = b.proof || {}, d = String(f.data || ''), pdf = d.startsWith('data:application/pdf;base64,'), jpg = d.startsWith('data:image/jpeg;base64,');
    if (!pdf && !jpg) throw err('Upload your proof of payment as a PDF or photo.');
    if (d.length > 3e6) throw err('The file is too large.'); const head = Buffer.from(d.split(',')[1].slice(0, 16), 'base64');
    if ((pdf && head.toString('latin1', 0, 4) !== '%PDF') || (jpg && !(head[0] === 0xff && head[1] === 0xd8))) throw err('That file is not a valid PDF or photo.');
    if (Math.abs(Number(b.amount) - r.amount) > 0.001) throw err('The amount must be exactly R' + r.amount + '.');
    r.submitted = true; r.status = 'pending'; r.note = String(b.note || '').slice(0, 160); r.proof = { name: String(f.name || 'proof').slice(0, 80), type: pdf ? 'application/pdf' : 'image/jpeg', data: d }; await put('payments', r); return { ok: true };
  }
  if (path === '/assessment') {
    if (!p.course) throw err('Unlock the course first: pay for it and wait for CSDSA to verify the payment.', 403); if (!p.att || p.used >= 1) throw err('Pay the assessment fee to unlock the questions.', 403);
    return { attemptsUsed: p.used, attemptsMax: 1, questions: C.QS.map(q => ({ q: q[0], options: q.slice(1, 4) })) };
  }
  if (path === '/assessment/submit') {
    if (!p.course || !p.att || p.used >= 1) throw err('No assessment attempts available.', 403); const a = b.answers || []; if (a.length !== C.QS.length) throw err('Answer every question.');
    const score = C.QS.reduce((s, q, i) => s + (a[i] === q[4] ? 1 : 0), 0), pct = score / C.QS.length * 100, passed = pct >= 80; p.used++;
    u.result = { score, total: C.QS.length, percentage: pct, passed, completed_at: new Date().toISOString() }; await put('users', u); let certificate = null;
    if (passed) {
      const n = (await all('certs')).length + 1, c = { id: u.id, uid: u.id, verifyToken: rid('v'), learner: u.name, course: C.COURSE_TITLE, score, total: C.QS.length, number: 'CSDSA-' + new Date().getFullYear() + '-' + String(n).padStart(4, '0'), issuedAt: new Date().toISOString() };
      await put('certs', c); certificate = { emailStatus: await certMail(c, u, false) };
    }
    return { ...u.result, passMark: 80, attemptsRemaining: 1 - p.used, certificate };
  }
  if (path === '/certificates/request-signature') { const c = await get('certs', u.id); if (!c) throw err('No certificate yet.', 404); if (c.signStatus !== 'signed') c.signStatus = 'requested'; c.signRequestedTo = b.to; await put('certs', c); await certMail(c, u, true); return { ok: true }; }
  if (path === '/org/employees') {
    if (u.type !== 'business') throw err('Only business accounts can add employees.', 403);
    const id = idn(b.id_number), ph = b.phone ? phone(b.phone) : ''; if (!b.name || !id) throw err('That ID or passport number is not valid. Check it and try again.'); if (b.phone && !ph) throw err('Enter a valid cellphone number.');
    if ((await where('users', 'idNumber', id)).length || (ph && (await where('users', 'phone', ph)).length)) throw err('An account with that ID / passport number or cellphone already exists.');
    const tmp = b.temp_password || 'Csd' + Math.floor(1000 + Math.random() * 9000) + 'x', e = { id: rid('u'), name: b.name, idNumber: id, phone: ph, email: email(b.email), job: b.job_title || 'Employee', type: 'employee', boss: u.id, company: u.company, pw: hash(tmp), must: true };
    await put('users', e); return { employee: { name: e.name, phone: e.phone, idNumber: e.idNumber }, temporaryPassword: b.temp_password ? undefined : tmp };
  }
  if (path.startsWith('/admin/')) {
    if (!isAdmin(u)) throw err('Administrator access required.', 403);
    if (path === '/admin/payment-requests') {
      const users = await all('users'), rows = await payList(), byId = new Map(users.map(x => [x.id, x]));
      return { requests: rows.map(r => { const o = byId.get(r.uid) || {}; return { ...r, userName: o.name || '', email: o.email || '', phone: o.phone || '', idNumber: o.idNumber || '', company: o.company || '' }; }), certs: (await all('certs')).map(c => ({ ...c, who: (byId.get(c.uid) || {}).company || '' })) };
    }
    if (path === '/admin/users') {
      const users = await all('users'), byId = new Map(users.map(x => [x.id, x]));
      return { users: users.map(x => { const q = P(x); return { id: x.id, name: x.name || '', email: x.email || '', phone: x.phone || '', idNumber: x.idNumber || '', type: x.type || 'individual', company: x.company || '', employer: x.boss ? (byId.get(x.boss) || {}).name || '' : '', access: { course: !!q.course, assessment: !!q.att, attemptsUsed: q.used || 0, membershipUntil: q.membership > Date.now() ? new Date(q.membership).toISOString() : null, webinars: q.webinars || [] }, passed: !!(x.result && x.result.passed) }; }) };
    }
    if (path === '/admin/access') {
      const t = await get('users', String(b.user_id || '')); if (!t) throw err('User not found.', 404);
      const type = String(b.item_type || ''); if (!C.ITEM_TITLE[type]) throw err('Unknown item.');
      const q = P(t), wid = String(b.item_id || 'food-safety-essentials').slice(0, 80), now = new Date().toISOString();
      if (b.action === 'grant') {
        const r = { id: rid('p'), uid: t.id, type, title: C.ITEM_TITLE[type], amount: 0, reference: 'ADMIN-' + randomBytes(3).toString('hex').toUpperCase(), status: 'approved', submitted: true, manual: true, itemId: type === 'webinar' ? wid : null, note: String(b.note || 'Access given by administrator').slice(0, 160), createdAt: now, reviewedAt: now };
        grant(t, r); await put('users', t); await put('payments', r); return { ok: true };
      }
      if (b.action === 'revoke') {
        if (type === 'course') q.course = false; else if (type === 'membership') q.membership = 0; else if (type === 'assessment') q.att = false; else q.webinars = q.webinars.filter(x => x !== wid);
        await put('users', t); return { ok: true };
      }
      throw err('Invalid action.');
    }
    if (/^\/admin\/proof\//.test(path)) { const r = await get('payments', path.split('/')[3]); if (!r || !r.proof) throw err('Not found', 404); return { proof: r.proof }; }
    if (/^\/admin\/payment-requests\/[^/]+\/review$/.test(path)) {
      const r = await get('payments', path.split('/')[3]); if (!r) throw err('Not found', 404);
      if (!['approved', 'rejected'].includes(b.status)) throw err('Invalid status.');
      if (r.status === 'approved' || r.status === 'paid') throw err('This payment is already approved. To remove access, use the Users tab.');
      r.status = b.status; r.reviewedAt = new Date().toISOString(); await put('payments', r);
      if (b.status === 'approved') { const t = await get('users', r.uid); if (t) { grant(t, r); await put('users', t); } }
      return { ok: true };
    }
    if (/^\/admin\/certificates\/[^/]+\/sign$/.test(path)) { const c = (await all('certs')).find(x => x.verifyToken === path.split('/')[3]); if (!c) throw err('Not found', 404); c.signStatus = 'signed'; c.signedAt = new Date().toISOString(); await put('certs', c); return { ok: true }; }
  }
  throw err('This feature is not available.', 404);
}

async function sendHealth(res) {
  const missingConfiguration = ['DATABASE_URL', 'SESSION_SECRET'].filter(k => !process.env[k]);
  if (missingConfiguration.length) return res.status(503).json({ ok: false, service: 'csdsa-api', databaseConfigured: !!process.env.DATABASE_URL, sessionSecretConfigured: !!process.env.SESSION_SECRET, databaseReachable: false, missingConfiguration });
  try { await database()`SELECT 1 AS ok`; return res.status(200).json({ ok: true, service: 'csdsa-api', databaseConfigured: true, sessionSecretConfigured: true, databaseReachable: true, missingConfiguration: [] }); }
  catch (e) { console.error('Health database check failed:', e.message); return res.status(503).json({ ok: false, service: 'csdsa-api', databaseConfigured: true, sessionSecretConfigured: true, databaseReachable: false, error: 'Database connection failed. Check DATABASE_URL and Neon connection settings.', missingConfiguration: [] }); }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET' && req.url?.split('?')[0] === '/api/health') return await sendHealth(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    let payload = req.body;
    if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { throw err('Invalid request body.', 400); } }
    if (!payload || typeof payload !== 'object') throw err('Invalid request body.', 400);
    const path = String(payload.path || ''), body = payload.body && typeof payload.body === 'object' ? payload.body : {};
    if (path === '/health') return await sendHealth(res);
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 40) throw err('Server authentication is not configured correctly. Set SESSION_SECRET to a random value of at least 40 characters in Vercel and redeploy.', 503);
    const authorization = req.headers?.authorization || req.headers?.Authorization || '';
    const token = String(authorization).replace(/^Bearer\s+/i, '');
    let result;
    try { result = await route(path, body, token); } catch (first) { if (!TRANSIENT.has(first.code)) throw first; result = await route(path, body, token); }
    return res.status(200).json(result);
  } catch (e) {
    const status = Number.isInteger(e.status) ? e.status : 500;
    if (status >= 500) console.error('CSDSA API error:', e.message, e.stack);
    return res.status(status).json({ error: status >= 500 && !e.status ? 'Something went wrong (' + (e.code || e.name || 'error') + '). Please try again.' : e.message || 'Request failed.' });
  }
}
