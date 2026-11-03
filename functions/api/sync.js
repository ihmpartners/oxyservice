// Cloudflare Pages Function: /api/sync
// POST body: { since: <ms>, changes: [{id, kind, data, updated_at, deleted}] }
// Stores each change (last write wins by updated_at) and returns everything the server
// received after `since`, so every device ends up with the same data.
// GET returns a health check, with a plain-English reason when something is misconfigured.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });

// Returns an error Response if the request can't go ahead, otherwise null.
function check(request, env) {
  const expected = String(env.SYNC_TOKEN ?? '').trim();
  if (!expected) return json({ error: 'The SYNC_TOKEN secret is not set on this Cloudflare Pages project, or the project has not been redeployed since it was set.', code: 'no_secret' }, 500);
  if (!env.DB) return json({ error: 'The D1 database is not connected to this Pages project (binding "DB" is missing).', code: 'no_db' }, 500);
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  let diff = got.length ^ expected.length;
  for (let i = 0; i < Math.max(got.length, expected.length); i++) diff |= (got.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  if (diff !== 0) return json({ error: 'The sync key does not match the SYNC_TOKEN set in Cloudflare.', code: 'bad_key' }, 401);
  return null;
}
function dbError(e) {
  const msg = String(e?.message || e);
  if (/no such table/i.test(msg)) return json({ error: 'The database tables have not been created yet. Run schema.sql against the D1 database.', code: 'no_table' }, 500);
  return json({ error: 'Database error: ' + msg, code: 'db_error' }, 500);
}

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

export async function onRequestGet({ request, env }) {
  const bad = check(request, env); if (bad) return bad;
  try {
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM records WHERE deleted = 0').first();
    return json({ ok: true, records: row.n, serverTime: Date.now() });
  } catch (e) { return dbError(e); }
}

export async function onRequestPost({ request, env }) {
  const bad = check(request, env); if (bad) return bad;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json', code: 'bad_json' }, 400); }
  const since = Number(body.since) || 0;
  const changes = Array.isArray(body.changes) ? body.changes : [];
  const now = Date.now();
  try {
    const upsert = env.DB.prepare(
      `INSERT INTO records (id, kind, data, updated_at, deleted, server_ts) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, data = excluded.data, updated_at = excluded.updated_at,
         deleted = excluded.deleted, server_ts = excluded.server_ts
       WHERE excluded.updated_at > records.updated_at`);
    const stmts = [];
    for (const c of changes) {
      if (!c || typeof c.id !== 'string' || !c.id || c.id.length > 100 || typeof c.kind !== 'string') continue;
      stmts.push(upsert.bind(c.id, c.kind, JSON.stringify(c.data ?? {}), Number(c.updated_at) || 0, c.deleted ? 1 : 0, now));
    }
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));

    const { results } = await env.DB.prepare(
      'SELECT id, kind, data, updated_at, deleted FROM records WHERE server_ts > ?1 ORDER BY server_ts').bind(since).all();
    return json({
      serverTime: now,
      changes: results.map(r => ({ id: r.id, kind: r.kind, data: JSON.parse(r.data), updated_at: r.updated_at, deleted: r.deleted })),
    });
  } catch (e) { return dbError(e); }
}
