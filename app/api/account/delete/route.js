import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body, status = 200) {
  return Response.json(body, { status });
}

export async function POST(request) {
  const authHeader = request.headers.get('authorization') || '';

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!token) {
    return json({ error: 'Sessione non valida.' }, 401);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const secretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !secretKey) {
    console.error('Missing Supabase server environment variables');

    return json(
      { error: 'Configurazione server incompleta.' },
      500
    );
  }

  // Client usato esclusivamente per verificare
  // l'identità dell'utente che sta facendo la richiesta.
  const userClient = createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  const {
    data: userData,
    error: userError
  } = await userClient.auth.getUser();

  if (userError || !userData?.user) {
    console.error(
      'User token verification failed:',
      userError?.message || 'user missing'
    );

    return json(
      { error: 'Sessione non valida. Accedi di nuovo.' },
      401
    );
  }

  const user = userData.user;

  // Client privilegiato: rimane esclusivamente lato server.
  const admin = createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  const {
    data: profile,
    error: profileError
  } = await admin
    .from('profiles')
    .select('id, role, player_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error(
      'Profile lookup failed:',
      profileError.message
    );

    return json(
      { error: 'Impossibile verificare il profilo.' },
      500
    );
  }

  // Protezione aggiuntiva:
  // l'account Admin non può essere eliminato dall'app.
  if (profile?.role === 'admin') {
    return json(
      {
        error:
          'L’account Admin non può essere eliminato dall’app.'
      },
      403
    );
  }

  // Prima conserviamo lo storico sportivo
  // separandolo dall'identità Auth dell'utente.
  if (profile) {
    const {
      error: retireError
    } = await admin.rpc(
      'retire_account_history',
      {
        p_auth_user_id: user.id
      }
    );

    if (retireError) {
      console.error(
        'History retirement failed:',
        retireError.message
      );

      return json(
        {
          error:
            'Impossibile anonimizzare lo storico. L’account Auth non è stato eliminato.'
        },
        500
      );
    }
  }

  // Solo dopo l'anonimizzazione dello storico
  // eliminiamo l'utente da Supabase Auth.
  const {
    error: deleteError
  } = await admin.auth.admin.deleteUser(user.id);

  if (deleteError) {
    console.error(
      'Auth deletion failed:',
      deleteError.message
    );

    return json(
      {
        error:
          'Profilo disattivato, ma la rimozione finale delle credenziali non è riuscita.'
      },
      500
    );
  }

  return json({
    ok: true
  });
}