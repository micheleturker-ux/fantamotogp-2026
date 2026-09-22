import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server credentials missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase public credentials missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function authorize(request) {
  const auth = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return { type: 'cron' };

  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const pub = publicClient();
  const { data: { user }, error } = await pub.auth.getUser(token);
  if (error || !user) return null;

  const admin = serviceClient();
  const { data: profile } = await admin.from('profiles').select('id, nickname, role').eq('id', user.id).maybeSingle();
  if (!profile || profile.role !== 'admin') return null;
  return { type: 'admin', user: profile };
}

async function buildWeekendSnapshot(sb) {
  const { data: sessions, error: sessionError } = await sb
    .from('sessions')
    .select('id, session_type, grand_prix_id, locked, grands_prix(id, round, name, circuit, gp_date)')
    .order('id', { ascending: false });
  if (sessionError) throw sessionError;

  const { data: scores, error: scoreError } = await sb
    .from('session_scores')
    .select('session_id, user_id, base_points, bonus_points, total_points');
  if (scoreError) throw scoreError;

  const scoredSessionIds = new Set((scores || []).map(x => x.session_id));
  const latest = (sessions || []).find(s => scoredSessionIds.has(s.id));
  if (!latest?.grands_prix?.id) throw new Error('Nessun weekend completato trovato');
  const gpId = latest.grands_prix.id;
  const gpSessions = (sessions || []).filter(s => s.grand_prix_id === gpId);
  const gpSessionIds = new Set(gpSessions.map(s => s.id));
  const gpScores = (scores || []).filter(s => gpSessionIds.has(s.session_id));

  const { data: profiles, error: profileError } = await sb.from('profiles').select('id, nickname');
  if (profileError) throw profileError;
  const names = Object.fromEntries((profiles || []).map(p => [p.id, p.nickname]));

  const { data: lb, error: lbError } = await sb.from('leaderboard').select('*').order('position');
  if (lbError) throw lbError;

  const byPlayer = {};
  for (const p of profiles || []) {
    byPlayer[p.id] = { nickname: p.nickname, sprint: null, race: null, weekend: 0, absence: [] };
  }
  for (const s of gpSessions) {
    for (const p of profiles || []) {
      const hit = gpScores.find(x => x.session_id === s.id && x.user_id === p.id);
      if (hit) {
        byPlayer[p.id][s.session_type] = Number(hit.total_points || 0);
        byPlayer[p.id].weekend += Number(hit.total_points || 0);
      } else {
        byPlayer[p.id].absence.push(s.session_type);
      }
    }
  }

  const standings = (lb || []).map(x => {
    const weekend = byPlayer[x.user_id]?.weekend || 0;
    return {
      nickname: x.nickname,
      current_points: Number(x.total_points || 0),
      points_before_weekend: Number(x.total_points || 0) - weekend,
      current_position: Number(x.position || 0),
      victories: Number(x.victories || 0),
      gap: Number(x.gap || 0),
      sprint: byPlayer[x.user_id]?.sprint,
      race: byPlayer[x.user_id]?.race,
      weekend,
      missed: byPlayer[x.user_id]?.absence || []
    };
  });

  return {
    gp: latest.grands_prix,
    sessions: gpSessions.map(s => ({ id: s.id, type: s.session_type })),
    standings
  };
}

function parseJsonLoose(text) {
  const clean = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(clean);
}

async function generateReport(snapshot) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `Sei il cronista ufficiale di un FantaMotoGP privato tra tre amici. Scrivi in italiano un PAGELLONE DEL LUNEDÌ divertente, teatrale e cattivo ma affettuoso.\n\nPersonaggi ricorrenti:\n- Micbiukennon: il Re / il Regno. Quando è leader usa metafore regali, ma se fa male dagli un voto insufficiente senza propaganda.\n- Andreius: il Faraone / l'Egiziano. Prendilo in giro con metafore egizie e del deserto, ma riconosci i meriti reali.\n- Scartato: il Non Morto / l'Assente / il caos. Se manca un pronostico evidenzialo con ironia.\n\nRegole editoriali:\n- Basati SOLTANTO sui dati forniti. Non inventare risultati MotoGP, cause, episodi o punti.\n- Dai un voto 1-10 a ciascuno coerente con il weekend.\n- Distingui il vincitore Sprint dal vincitore Gara usando i punteggi Fanta.\n- Commenta come cambia il campionato confrontando punti prima/dopo il weekend.\n- Se qualcuno non ha una sessione registrata, descrivila come assenza/zero, senza inventare il motivo.\n- Tono epico-trash simile a un editoriale sportivo.\n- Lunghezza circa 700-1100 parole.\n- Chiudi con una frase finale memorabile.\n\nRestituisci SOLO JSON valido, senza markdown, nella forma:\n{"title":"...","subtitle":"...","content":"..."}\n\nDATI WEEKEND:\n${JSON.stringify(snapshot, null, 2)}`;

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
    reasoning: { effort: 'low' },
    input: prompt
  });
  return parseJsonLoose(response.output_text);
}

async function run(request) {
  try {
    const who = await authorize(request);
    if (!who) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sb = serviceClient();
    const snapshot = await buildWeekendSnapshot(sb);
    const report = await generateReport(snapshot);

    const payload = {
      season: 2026,
      grand_prix_id: snapshot.gp.id,
      title: report.title || 'Pagellone del lunedì',
      subtitle: report.subtitle || null,
      content: report.content || '',
      generated_at: new Date().toISOString(),
      published: true,
      generated_by: who.type === 'cron' ? 'automatic' : 'admin'
    };

    const { data, error } = await sb
      .from('monday_reports')
      .upsert(payload, { onConflict: 'grand_prix_id' })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, gp: snapshot.gp.name, report: data });
  } catch (error) {
    console.error('Pagellone error', error);
    return NextResponse.json({ error: error?.message || 'Errore generazione' }, { status: 500 });
  }
}

export async function GET(request) { return run(request); }
export async function POST(request) { return run(request); }
