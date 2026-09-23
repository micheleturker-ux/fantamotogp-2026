import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body, status = 200) {
  return Response.json(body, { status });
}

export async function POST(request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) return json({ error: 'Sessione non valida.' }, 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('Missing Supabase server environment variables');
    return json({ error: 'Configurazione server incompleta.' }, 500);
  }

  const admin = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;

  if (userError || !user) return json({ error: 'Sessione scaduta. Accedi di nuovo.' }, 401);

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role, player_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Profile lookup failed', profileError.message);
    return json({ error: 'Impossibile verificare il profilo.' }, 500);
  }

  if (profile?.role === 'admin') {
    return json({ error: 'L’account Admin non può essere eliminato dall’app.' }, 403);
  }

  // Idempotente: se il retirement e gia avvenuto, ritenta solo la cancellazione Auth.
  if (profile) {
    const { error: retireError } = await admin.rpc('retire_account_history', {
      p_auth_user_id: user.id
    });

    if (retireError) {
      console.error('History retirement failed', retireError.message);
      return json({ error: 'Impossibile anonimizzare lo storico. Nessun account Auth è stato eliminato.' }, 500);
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

  if (deleteError) {
    console.error('Auth deletion failed', deleteError.message);
    return json({
      error: 'Profilo disattivato, ma la rimozione finale delle credenziali non è riuscita. Riprova.'
    }, 500);
  }

  return json({ ok: true });
}
