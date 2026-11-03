// Cloudflare Pages Function: POST /api/sync
// Body: { since: <ms>, changes: [{id, kind, data, updated_at, deleted}] }
// Stores each change (last write wins by updated_at) and returns everything the server
// received after `since`, so every device ends up with the same data.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });

function authorised(request, env) {
  const expected = env.SYNC_TOKEN;
  if (!expected) return false;
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

export async function onRequestGet({ request, env }) {
  if (!authorised(request, env)) return json({ error: 'unauthorised' }, 401);
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM records WHERE deleted = 0').first();
  return json({ ok: true, records: row.n, serverTime: Date.now() });
}

export async function onRequestPost({ request, env }) {
  if (!authorised(request, env)) return json({ error: 'unauthorised' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const since = Number(body.since) || 0;
  const changes = Array.isArray(body.changes) ? body.changes : [];
  const now = Date.now();

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
}
