'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const TABS = ['Home', 'Pronostico', 'Classifica', 'Paddock', 'Calendario', 'Admin'];

function fmt(n) {
  if (n === null || n === undefined) return '—';
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(1).replace('.', ',');
}

function formatDeadline(v) {
  if (!v) return 'Da impostare';
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  }).format(new Date(v));
}

function Card({ children, className = '' }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState('Home');
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [leaderboard, setLeaderboard] = useState([]);
  const [riders, setRiders] = useState([]);
  const [gps, setGps] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [myPrediction, setMyPrediction] = useState(null);
  const [visiblePredictions, setVisiblePredictions] = useState([]);
  const [mondayReports, setMondayReports] = useState([]);
  const [pagelloneState, setPagelloneState] = useState('');

  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [form, setForm] = useState({ p1:'', p2:'', p3:'', p4:'', p5:'', fastest:'', crash:'' });
  const [saveState, setSaveState] = useState('');

  const [adminSessionId, setAdminSessionId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [resultForm, setResultForm] = useState({ p1:'', p2:'', p3:'', p4:'', p5:'', fastest:'', crash:'' });
  const [adminState, setAdminState] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    bootstrap();
  }, [session?.user?.id]);

  async function bootstrap() {
    setLoading(true);
    const [p, l, r, g, s, mr] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', session.user.id).single(),
      supabase.from('leaderboard').select('*').order('position'),
      supabase.from('riders').select('*').eq('active', true).order('coefficient').order('name'),
      supabase.from('grands_prix').select('*').eq('season', 2026).order('round'),
      supabase.from('sessions').select('*, grands_prix(*)').order('id'),
      supabase.from('monday_reports').select('*, grands_prix(name)').order('generated_at', { ascending: false }).limit(8)
    ]);
    setProfile(p.data || null);
    setLeaderboard(l.data || []);
    setRiders(r.data || []);
    setGps(g.data || []);
    setMondayReports(mr.error ? [] : (mr.data || []));
    const ss = s.data || [];
    setSessions(ss);

    const now = Date.now();
    const upcoming = ss
      .filter(x => !x.locked)
      .sort((a,b) => {
        const aa = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        const bb = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        return aa - bb;
      })[0];
    if (upcoming) {
      setSelectedSessionId(String(upcoming.id));
      setAdminSessionId(String(upcoming.id));
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!session?.user || !selectedSessionId) return;
    loadPrediction(selectedSessionId);
  }, [selectedSessionId, session?.user?.id]);

  async function loadPrediction(id) {
    const { data } = await supabase
      .from('predictions')
      .select('*')
      .eq('session_id', Number(id))
      .eq('user_id', session.user.id)
      .maybeSingle();
    setMyPrediction(data || null);
    if (data) {
      setForm({
        p1: String(data.p1_rider_id || ''), p2: String(data.p2_rider_id || ''),
        p3: String(data.p3_rider_id || ''), p4: String(data.p4_rider_id || ''),
        p5: String(data.p5_rider_id || ''), fastest: String(data.fastest_lap_rider_id || ''),
        crash: String(data.crash_rider_id || '')
      });
    } else {
      setForm({ p1:'', p2:'', p3:'', p4:'', p5:'', fastest:'', crash:'' });
    }
    const { data: all } = await supabase
      .from('predictions')
      .select('*, profiles(nickname)')
      .eq('session_id', Number(id));
    setVisiblePredictions(all || []);
  }

  async function login(e) {
    e.preventDefault();
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
  }

  async function logout() {
    await supabase.auth.signOut();
    setTab('Home');
  }

  const leader = leaderboard[0];
  const me = leaderboard.find(x => x.user_id === session?.user?.id);
  const currentSession = sessions.find(x => String(x.id) === selectedSessionId);
  const isOpen = currentSession && !currentSession.locked && currentSession.deadline && Date.now() < new Date(currentSession.deadline).getTime();

  async function submitPrediction(e) {
    e.preventDefault();
    setSaveState('Salvataggio...');
    const vals = Object.values(form);
    if (vals.some(v => !v)) {
      setSaveState('Completa tutti i campi.');
      return;
    }
    const top = [form.p1,form.p2,form.p3,form.p4,form.p5];
    if (new Set(top).size !== 5) {
      setSaveState('La Top 5 deve contenere 5 piloti diversi.');
      return;
    }
    const { error } = await supabase.rpc('submit_prediction', {
      p_session_id: Number(selectedSessionId),
      p1: Number(form.p1), p2: Number(form.p2), p3: Number(form.p3),
      p4: Number(form.p4), p5: Number(form.p5),
      p_fastest: Number(form.fastest), p_crash: Number(form.crash)
    });
    if (error) setSaveState(error.message);
    else {
      setSaveState('Pronostico salvato 🔒');
      await loadPrediction(selectedSessionId);
    }
  }

  async function setSessionDeadline(e) {
    e.preventDefault();
    setAdminState('Aggiornamento...');
    if (!adminSessionId || !deadline) return setAdminState('Seleziona sessione e deadline.');
    const iso = new Date(deadline).toISOString();
    const { error } = await supabase.from('sessions').update({ deadline: iso, locked: false }).eq('id', Number(adminSessionId));
    setAdminState(error ? error.message : 'Deadline aggiornata ✅');
    if (!error) await bootstrap();
  }

  async function generatePagellone() {
    setPagelloneState('Generazione in corso…');
    const token = session?.access_token;
    const res = await fetch('/api/generate-pagellone', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPagelloneState(body.error || 'Errore durante la generazione');
      return;
    }
    setPagelloneState(`Pagellone ${body.gp || ''} pubblicato ✅`);
    await bootstrap();
  }

  async function saveResult(e) {
    e.preventDefault();
    setAdminState('Calcolo punteggi...');
    const vals = Object.values(resultForm);
    if (vals.some(v => !v)) return setAdminState('Completa tutti i risultati.');
    const { error } = await supabase.rpc('save_result_and_score', {
      p_session_id: Number(adminSessionId),
      p1: Number(resultForm.p1), p2: Number(resultForm.p2), p3: Number(resultForm.p3),
      p4: Number(resultForm.p4), p5: Number(resultForm.p5),
      p_fastest: Number(resultForm.fastest), p_crash: Number(resultForm.crash)
    });
    setAdminState(error ? error.message : 'Risultato salvato. Classifica aggiornata 🏁');
    if (!error) await bootstrap();
  }

  if (loading) return <main className="splash"><div className="logoMark">FM</div><p>Accensione motori…</p></main>;

  if (!session) {
    return (
      <main className="loginPage">
        <div className="loginGlow" />
        <div className="brand">
          <div className="brandOver">FANTA</div>
          <div className="brandMain">MOTOGP</div>
          <div className="brandYear">2026</div>
        </div>
        <Card className="loginCard">
          <Badge tone="red">PADDOCK ACCESS</Badge>
          <h1>Entra nel mondiale.</h1>
          <p className="muted">Tre giocatori. Un regolamento. Una corona.</p>
          <form onSubmit={login} className="stack">
            <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
            <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
            {authError && <div className="error">{authError}</div>}
            <button className="primary">ENTRA NEL PADDOCK</button>
          </form>
        </Card>
      </main>
    );
  }

  return (
    <main className="appShell">
      <header className="topbar">
        <div><span className="miniLogo">FANTA</span><b>MOTOGP</b><span className="season">26</span></div>
        <button className="ghost" onClick={logout}>Esci</button>
      </header>

      <div className="content">
        {tab === 'Home' && <>
          <div className="hero heroClean">
            <div>
              <Badge tone="red">MONDIALE 2026</Badge>
              <h1>Ciao, {profile?.nickname || 'pilota'}.</h1>
              <p>Il campionato entra nella zona rossa.</p>
            </div>
          </div>

          <Card className="kingdom">
            <div className="eyebrow">👑 IL REGNO</div>
            <div className="kingRow">
              <div><small>Leader</small><strong>{leader?.nickname || '—'}</strong></div>
              <div><small>Punti</small><strong>{fmt(leader?.total_points || 0)}</strong></div>
              <div><small>Gap tuo</small><strong>{me ? fmt(me.gap) : '—'}</strong></div>
            </div>
          </Card>

          <h2 className="sectionTitle">Classifica</h2>
          <div className="podiumList">
            {leaderboard.map((x,i)=><div className={`rankRow rank${i+1}`} key={x.user_id}>
              <div className="rankPos">{i+1}</div>
              <div className="rankName"><b>{x.nickname}</b><span>{fmt(x.victories)} vittorie · {fmt(x.win_percentage)}%</span></div>
              <div className="rankPts">{fmt(x.total_points)}<small>{i===0?'LEADER':`${fmt(x.gap)} GAP`}</small></div>
            </div>)}
          </div>

          <h2 className="sectionTitle">Prossima sessione</h2>
          {currentSession ? <Card>
            <div className="sessionHead">
              <div><Badge tone={currentSession.session_type==='sprint'?'orange':'red'}>{currentSession.session_type.toUpperCase()}</Badge>
                <h3>{currentSession.grands_prix?.name}</h3>
                <p>{currentSession.grands_prix?.circuit}</p>
              </div>
              <div className={`status ${isOpen?'open':'closed'}`}>{isOpen?'APERTO':'CHIUSO'}</div>
            </div>
            <div className="deadline">Deadline: <b>{formatDeadline(currentSession.deadline)}</b></div>
            <button className="primary" onClick={()=>setTab('Pronostico')}>{isOpen?'COMPILA PRONOSTICO':'VEDI SESSIONE'}</button>
          </Card> : <Card>Nessuna sessione configurata.</Card>}
        </>}

        {tab === 'Pronostico' && <>
          <div className="pageTitle"><Badge tone="orange">PIT WALL</Badge><h1>Pronostico</h1><p>Prima della deadline ognuno vede soltanto il proprio.</p></div>
          <Card>
            <label>Sessione
              <select value={selectedSessionId} onChange={e=>setSelectedSessionId(e.target.value)}>
                {sessions.map(s=><option key={s.id} value={s.id}>#{s.grands_prix?.round} {s.grands_prix?.name} · {s.session_type.toUpperCase()}</option>)}
              </select>
            </label>
            <div className="sessionMeta"><Badge tone={isOpen?'green':'neutral'}>{isOpen?'APERTA':'CHIUSA'}</Badge><span>{formatDeadline(currentSession?.deadline)}</span></div>
          </Card>
          <form onSubmit={submitPrediction} className="stack">
            <Card>
              <h3>Top 5</h3>
              {[1,2,3,4,5].map(n=><RiderSelect key={n} label={`${n}° posizione`} value={form[`p${n}`]} onChange={v=>setForm({...form,[`p${n}`]:v})} riders={riders} disabled={!isOpen}/>) }
            </Card>
            <Card>
              <h3>Bonus</h3>
              <RiderSelect label="⚡ Giro veloce" value={form.fastest} onChange={v=>setForm({...form,fastest:v})} riders={riders} disabled={!isOpen}/>
              <RiderSelect label="💥 Caduta" value={form.crash} onChange={v=>setForm({...form,crash:v})} riders={riders} disabled={!isOpen}/>
            </Card>
            <button className="primary" disabled={!isOpen}>{myPrediction?'AGGIORNA PRONOSTICO':'SALVA PRONOSTICO'} 🔒</button>
            {saveState && <div className="notice">{saveState}</div>}
          </form>

          {visiblePredictions.length > 1 && <><h2 className="sectionTitle">Pronostici sbloccati</h2>
            {visiblePredictions.map(p=><Card key={p.id}><b>{p.profiles?.nickname || 'Giocatore'}</b><p className="muted">Pronostico visibile dopo la chiusura.</p></Card>)}</>}
        </>}

        {tab === 'Classifica' && <>
          <div className="pageTitle"><Badge tone="red">WORLD CHAMPIONSHIP</Badge><h1>Classifica</h1></div>
          <div className="championHero"><span>LEADER</span><strong>{leader?.nickname}</strong><em>{fmt(leader?.total_points)}</em></div>
          <div className="podiumList">
            {leaderboard.map((x,i)=><div className={`rankRow rank${i+1}`} key={x.user_id}>
              <div className="rankPos">{i+1}</div><div className="rankName"><b>{x.nickname}</b><span>{x.sessions_played} sessioni · {x.victories} vittorie</span></div><div className="rankPts">{fmt(x.total_points)}<small>{i===0?'👑':fmt(x.gap)}</small></div>
            </div>)}
          </div>
        </>}


        {tab === 'Paddock' && <>
          <div className="pageTitle"><Badge tone="orange">CLUBHOUSE</Badge><h1>Paddock</h1><p>Pagellone, rivalità e avatar che evolvono con il campionato.</p></div>

          <h2 className="sectionTitle">Avatar evolutivi</h2>
          <div className="avatarGrid">
            {leaderboard.map((x,i)=><AvatarCard key={x.user_id} player={x} rank={i+1} leaderPoints={Number(leader?.total_points || 0)} />)}
          </div>

          <h2 className="sectionTitle">🏁🔥 Pagellone del lunedì</h2>
          {profile?.role === 'admin' && <div className="reportActions"><button className="secondary" onClick={generatePagellone}>✨ GENERA / RIGENERA PAGELLONE</button>{pagelloneState && <span>{pagelloneState}</span>}</div>}
          {mondayReports.length ? mondayReports.map(r=><Card key={r.id} className="reportCard">
            <div className="reportMeta"><Badge tone="red">{r.grands_prix?.name || 'GP'}</Badge><span>{r.generated_at ? new Date(r.generated_at).toLocaleDateString('it-IT') : ''}</span></div>
            <h3>{r.title || 'Pagellone del lunedì'}</h3>
            {r.subtitle && <p className="reportSubtitle">{r.subtitle}</p>}
            <div className="reportText">{r.content}</div>
          </Card>) : <Card className="reportEmpty">
            <div className="reportBig">🏁🔥</div>
            <h3>Il prossimo Pagellone nascerà qui.</h3>
            <p className="muted">Il lunedì mattina l'app potrà leggere i punteggi del weekend e pubblicare automaticamente il resoconto.</p>
            <div className="reportPreview">“Il Re resiste. Il Faraone assalta. Scartato controlla se ha impostato la sveglia.”</div>
          </Card>}
        </>}

        {tab === 'Calendario' && <>
          <div className="pageTitle"><Badge tone="neutral">22 ROUND</Badge><h1>Calendario</h1></div>
          <div className="calendarList">
            {gps.map(g=><Card key={g.id} className="gpCard"><div className="round">{String(g.round).padStart(2,'0')}</div><div><b>{g.name}</b><span>{g.circuit}</span></div><time>{g.gp_date ? new Date(`${g.gp_date}T12:00:00`).toLocaleDateString('it-IT',{day:'2-digit',month:'short'}) : '—'}</time></Card>)}
          </div>
        </>}

        {tab === 'Admin' && profile?.role === 'admin' && <>
          <div className="pageTitle"><Badge tone="red">RACE CONTROL</Badge><h1>Admin</h1><p>Gestisci deadline e risultati. I pronostici restano blindati.</p></div>
          <Card>
            <h3>Sessione</h3>
            <select value={adminSessionId} onChange={e=>setAdminSessionId(e.target.value)}>
              {sessions.map(s=><option key={s.id} value={s.id}>#{s.grands_prix?.round} {s.grands_prix?.name} · {s.session_type.toUpperCase()}</option>)}
            </select>
          </Card>
          <form onSubmit={setSessionDeadline} className="stack">
            <Card><h3>Deadline</h3><label>Chiusura pronostici<input type="datetime-local" value={deadline} onChange={e=>setDeadline(e.target.value)} /></label></Card>
            <button className="secondary">SALVA DEADLINE</button>
          </form>
          <form onSubmit={saveResult} className="stack adminResult">
            <Card><h3>Risultato reale</h3>
              {[1,2,3,4,5].map(n=><RiderSelect key={n} label={`${n}° reale`} value={resultForm[`p${n}`]} onChange={v=>setResultForm({...resultForm,[`p${n}`]:v})} riders={riders}/>) }
              <RiderSelect label="⚡ Giro veloce" value={resultForm.fastest} onChange={v=>setResultForm({...resultForm,fastest:v})} riders={riders}/>
              <RiderSelect label="💥 Caduta" value={resultForm.crash} onChange={v=>setResultForm({...resultForm,crash:v})} riders={riders}/>
            </Card>
            <button className="primary">SALVA + CALCOLA CLASSIFICA</button>
          </form>
          {adminState && <div className="notice">{adminState}</div>}
        </>}
      </div>

      <nav className="bottomNav">
        {TABS.filter(x=>x!=='Admin' || profile?.role==='admin').map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}><span>{navIcon(x)}</span>{x}</button>)}
      </nav>
    </main>
  );
}

function RiderSelect({ label, value, onChange, riders, disabled=false }) {
  return <label className="riderSelect">{label}<select disabled={disabled} value={value} onChange={e=>onChange(e.target.value)}><option value="">Seleziona pilota</option>{riders.map(r=><option key={r.id} value={r.id}>{r.name} · x{String(r.coefficient).replace('.',',')}</option>)}</select></label>;
}

function navIcon(x) {
  return ({Home:'⌂',Pronostico:'🏁',Classifica:'▥',Paddock:'🏆',Calendario:'◫',Admin:'⚙'})[x];
}


function AvatarCard({ player, rank, leaderPoints }) {
  const pts = Number(player.total_points || 0);
  const wins = Number(player.victories || 0);
  const gap = Math.max(0, leaderPoints - pts);
  let level = 1;
  if (pts >= 100 || wins >= 3) level = 2;
  if (pts >= 200 || wins >= 6) level = 3;
  if (pts >= 300 || wins >= 9) level = 4;
  if (rank === 1 && pts >= 300) level = 5;
  const gear = [
    ['🪖','Rookie','Casco base'],
    ['🏍️','Rider','Moto + tuta'],
    ['🔥','Pro','Visiera racing + guanti'],
    ['🏆','Elite','Trofeo + livrea premium'],
    ['👑','Imperatore','Corona + armatura del leader']
  ][level-1];
  return <Card className={`avatarCard avatarLevel${level}`}>
    <div className="avatarTop"><div className="avatarOrb"><span>{gear[0]}</span><b>{player.nickname?.slice(0,1)}</b></div><div><small>LVL {level}</small><h3>{player.nickname}</h3><p>{gear[1]}</p></div></div>
    <div className="gearLine"><span>{gear[2]}</span><strong>{fmt(pts)} PT</strong></div>
    <div className="xpTrack"><i style={{width:`${Math.min(100, Math.max(8,(pts%100)))}%`}} /></div>
    <div className="avatarStats"><span>{wins} vittorie</span><span>{rank===1?'👑 Leader':`-${fmt(gap)} dal leader`}</span></div>
  </Card>;
}
