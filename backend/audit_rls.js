import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const KNOWN_TABLES = [
    'users', 'tasks', 'habits', 'habit_logs', 'notes', 'activity_logs',
    'daily_productivity', 'friendships', 'friend_presence', 'friend_messages',
    'spotify_tokens', 'spotify_credentials', 'support_requests', 'study_sessions',
    'calendar_events', 'google_calendar_tokens', 'token_blacklist', 'rate_limits',
    'calendar', 'calendar_events_excluded_dates'
];

// Tables only ever touched via the service-role client (from code analysis) —
// authenticated/anon denial is the expected end state for these.
const SERVICE_ONLY = new Set([
    'spotify_tokens', 'spotify_credentials', 'token_blacklist',
    'rate_limits', 'study_sessions', 'support_requests'
]);

const svcHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, Accept: 'application/json' };

const req_ = async (path, key, bearer, extra = {}) => {
    try {
        const res = await fetch(`${URL_}${path}`, {
            headers: { apikey: key, Authorization: `Bearer ${bearer || key}`, Accept: 'application/json', ...extra }
        });
        const text = await res.text();
        let body = null;
        try { body = JSON.parse(text); } catch { /* non-json */ }
        return { status: res.status, body, res };
    } catch (e) {
        return { status: 0, body: { message: e.message }, res: null };
    }
};

const svcCount = async (table) => {
    const r = await req_(`/rest/v1/${table}?select=*`, SERVICE, null, { Prefer: 'count=exact', Range: 'rows=0-0' });
    if (r.status !== 200 && r.status !== 206) return { error: `HTTP ${r.status} ${r.body?.message || ''}`.trim() };
    const m = (r.res?.headers.get('content-range') || '').match(/\/(\d+)$/);
    return { count: m ? Number(m[1]) : (Array.isArray(r.body) ? r.body.length : 0) };
};

const firstRow = async (table) => {
    const r = await req_(`/rest/v1/${table}?select=*&limit=1`, SERVICE);
    return r.status === 200 && Array.isArray(r.body) ? r.body[0] : null;
};

const mintToken = (id, username) => jwt.sign(
    { id, username: username || `id-${id}` },
    process.env.JWT_SECRET,
    { expiresIn: '10m', jwtid: randomUUID() }
);

const userTokenFor = async (userId) => {
    const u = await req_(`/rest/v1/users?select=id,username&id=eq.${userId}&limit=1`, SERVICE);
    return u.status === 200 && u.body?.length ? mintToken(u.body[0].id, u.body[0].username) : mintToken(userId);
};

// Resolve the owning user of a first row across this schema's owner-column shapes.
const ownerToken = async (table, row) => {
    if (row) {
        if (table === 'users' && row.id !== undefined) return userTokenFor(row.id);
        if (row.user_id !== undefined && row.user_id !== null) return userTokenFor(row.user_id);
        if (row.requester_id !== undefined && row.requester_id !== null) return userTokenFor(row.requester_id);
        if (row.sender_id !== undefined && row.sender_id !== null) return userTokenFor(row.sender_id);
        if (row.habit_id !== undefined && row.habit_id !== null) {
            const h = await req_(`/rest/v1/habits?select=user_id&id=eq.${row.habit_id}&limit=1`, SERVICE);
            if (h.status === 200 && h.body?.length) return userTokenFor(h.body[0].user_id);
        }
    }
    const guest = await req_(`/rest/v1/users?select=id,username&username=eq.guest&limit=1`, SERVICE);
    if (guest.status === 200 && guest.body?.length) return mintToken(guest.body[0].id, guest.body[0].username);
    return null;
};

const hasOwnerColumn = (row, table) =>
    table === 'users' && !!row?.id ||
    !!row && ['user_id', 'requester_id', 'sender_id', 'habit_id'].some(c => row[c] !== undefined && row[c] !== null);

const fmt = (r) => r.status === 200
    ? (Array.isArray(r.body) ? `rows:${r.body.length}` : 'ok')
    : `HTTP ${r.status} ${r.body?.message || ''}`.trim();

// 1. Enumerate exposed tables via service-key OpenAPI (anon key is often blocked)
let tables = [...KNOWN_TABLES];
const spec = await req_('/rest/v1/', SERVICE);
if (spec.status === 200 && spec.body?.definitions) {
    tables = [...new Set([...tables, ...Object.keys(spec.body.definitions)])];
    console.log(`OpenAPI: ${Object.keys(spec.body.definitions).length} exposed tables`);
} else {
    console.log(`OpenAPI unavailable (status ${spec.status}) — using known table list`);
}

console.log('\ntable | rows | anon | authenticated | verdict');
console.log('-----|------|------|---------------|--------');

for (const t of tables) {
    const c = await svcCount(t);
    const exists = !c.error;
    const total = exists ? c.count : 'n/a';

    const row = exists && c.count > 0 ? await firstRow(t) : null;
    const anon = await req_(`/rest/v1/${t}?select=*&limit=1`, ANON);
    const token = row && hasOwnerColumn(row, t) ? await ownerToken(t, row) : null;
    const auth = token
        ? await req_(`/rest/v1/${t}?select=*&limit=1`, ANON, token)
        : { status: -1, body: null };

    let verdict;
    if (!exists) {
        verdict = `table missing (${c.error})`;
    } else if (anon.status === 200 && Array.isArray(anon.body) && anon.body.length > 0) {
        verdict = '!! WORLD-READABLE via anon — RLS off / open policy';
    } else if (auth.status === 200 && Array.isArray(auth.body) && auth.body.length > 0) {
        verdict = 'ok: owner reads via authenticated, anon blocked';
    } else if (auth.status === 42501 || anon.status === 42501) {
        verdict = 'ok: no grant for that role (42501)';
    } else if (SERVICE_ONLY.has(t)) {
        verdict = 'ok: service-role-only table, API roles denied';
    } else if (c.count === 0) {
        verdict = 'empty table — RLS state indeterminate (lockdown is a no-op-safe)';
    } else if (!row || !hasOwnerColumn(row, t)) {
        verdict = 'ok: no owner column (service-role-only table), anon blocked';
    } else {
        verdict = '!! anon blocked but owner got 0 rows — CHECK POLICIES';
    }

    console.log(`${t} | ${total} | ${fmt(anon)} | ${fmt(auth)} | ${verdict}`);
}
