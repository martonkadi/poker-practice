import { createClient } from 'jsr:@supabase/supabase-js@2.117.2';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
  const bearer = request.headers.get('authorization');
  if (!bearer?.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401, headers });
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return new Response('Server configuration unavailable', { status: 503, headers });
  const publicClient = createClient(url, anon);
  const { data, error } = await publicClient.auth.getUser(bearer.slice(7));
  if (error || !data.user) return new Response('Unauthorized', { status: 401, headers });
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const deletion = await admin.auth.admin.deleteUser(data.user.id);
  if (deletion.error) return new Response('Deletion failed', { status: 500, headers });
  return Response.json({ deleted: true }, { headers });
});
