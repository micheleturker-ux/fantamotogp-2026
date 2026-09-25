'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getRiderMeta, TEAM_ORDER } from '../lib/riderMeta';

const TABS = ['Home', 'News', 'Calendario', 'Storico', 'Paddock', 'Pronostico', 'Account', 'Regolamento', 'Admin'];

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
  const [authMode, setAuthMode] = useState('login');
  const [nickname, setNickname] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [deletePhrase, setDeletePhrase] = useState('');
  const [accountState, setAccountState] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [leaderboard, setLeaderboard] = useState([]);
  const [riders, setRiders] = useState([]);
  const [gps, setGps] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [myPrediction, setMyPrediction] = useState(null);
  const [visiblePredictions, setVisiblePredictions] = useState([]);
  const [mondayReports, setMondayReports] = useState([]);
  const [pagelloneState, setPagelloneState] = useState('');
  const [myScores, setMyScores] = useState([]);
  const [scoresState, setScoresState] = useState('');

  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [form, setForm] = useState({ p1:'', p2:'', p3:'', p4:'', p5:'', fastest:'', crash:'' });
  const [saveState, setSaveState] = useState('');
  const [nowTs, setNowTs] = useState(Date.now());

  const [adminSessionId, setAdminSessionId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [resultForm, setResultForm] = useState({ p1:'', p2:'', p3:'', p4:'', p5:'', fastest:'', crash:'' });
  const [adminState, setAdminState] = useState('');

  const [news, setNews] = useState([]);
  const [newsState, setNewsState] = useState('');
  const [historyGpId, setHistoryGpId] = useState('');
  const [historyData, setHistoryData] = useState(null);
  const [historyState, setHistoryState] = useState('');

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('recovery');
        setAuthError('');
        setAuthMessage('Link verificato. Imposta una nuova password.');
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);


  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);


  useEffect(() => {
    if (tab === 'News' && news.length === 0) loadNews();
  }, [tab]);

  useEffect(() => {
    if (tab !== 'Storico' || !gps.length) return;
    const target = gps.find(g => String(g.id) === String(historyGpId)) || gps[0];
    if (target) loadHistory(target);
  }, [tab, historyGpId, gps.length]);

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

    const playerId = p.data?.player_id || session.user.id;
    const { data: scoreRows, error: scoreError } = await supabase
      .from('session_scores')
      .select('*')
      .eq('user_id', playerId)
      .order('session_id');
    setMyScores(scoreError ? [] : (scoreRows || []));
    setScoresState(scoreError ? scoreError.message : '');

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
      setHistoryGpId(String(upcoming.grand_prix_id));
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
      .eq('user_id', profile?.player_id || session.user.id)
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
      .select('*, players(display_name)')
      .eq('session_id', Number(id));
    setVisiblePredictions(all || []);
  }

  async function login(e) {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setAuthError(error.message);
  }

  async function signup(e) {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    const cleanNickname = nickname.trim();
    if (cleanNickname.length < 3 || cleanNickname.length > 24) {
      setAuthError('Il nickname deve contenere da 3 a 24 caratteri.');
      return;
    }
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setAuthError('La password deve avere almeno 10 caratteri, con lettere e numeri.');
      return;
    }
    if (password !== confirmPassword) {
      setAuthError('Le password non coincidono.');
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { nickname: cleanNickname },
        emailRedirectTo: `${window.location.origin}/`
      }
    });
    if (error) {
      setAuthError(error.message);
      return;
    }
    setPassword('');
    setConfirmPassword('');
    if (data.session) {
      setAuthMessage('Account creato. Benvenuto nel paddock.');
    } else {
      setAuthMessage('Registrazione ricevuta. Controlla la tua email e conferma l’account prima di accedere.');
      setAuthMode('login');
    }
  }

  async function requestPasswordReset(e) {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    if (!email.trim()) {
      setAuthError('Inserisci la tua email.');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/`
    });
    if (error) {
      setAuthError(error.message);
      return;
    }
    setAuthMessage('Se esiste un account associato a questa email, riceverai un link per reimpostare la password.');
  }

  async function finishPasswordRecovery(e) {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    if (recoveryPassword.length < 10 || !/[A-Za-z]/.test(recoveryPassword) || !/\d/.test(recoveryPassword)) {
      setAuthError('La nuova password deve avere almeno 10 caratteri, con lettere e numeri.');
      return;
    }
    if (recoveryPassword !== recoveryConfirm) {
      setAuthError('Le password non coincidono.');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: recoveryPassword });
    if (error) {
      setAuthError(error.message);
      return;
    }
    setRecoveryPassword('');
    setRecoveryConfirm('');
    setAuthMessage('Password aggiornata. Ora puoi continuare.');
    setAuthMode('login');
  }

  async function logout() {
    await supabase.auth.signOut();
    setTab('Home');
  }


  async function deleteAccount() {
    setAccountState('');
    if (profile?.role === 'admin') {
      setAccountState('L’account Admin non può essere eliminato dall’app.');
      return;
    }
    if (deletePhrase.trim() !== 'ELIMINA') {
      setAccountState('Scrivi ELIMINA per confermare.');
      return;
    }
    const confirmed = window.confirm('Eliminare definitivamente il tuo account? Lo storico sportivo verrà mantenuto in forma anonimizzata.');
    if (!confirmed) return;

    setDeletingAccount(true);
    setAccountState('Eliminazione account in corso…');
    try {
      const token = session?.access_token;
      if (!token) throw new Error('Sessione non valida. Accedi di nuovo.');
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Impossibile eliminare l’account.');

      await supabase.auth.signOut({ scope: 'local' });
      setSession(null);
      setProfile(null);
      setDeletePhrase('');
      setTab('Home');
      setAuthMode('login');
      setAuthError('');
      setAuthMessage('Account eliminato. Lo storico del campionato è stato conservato in forma anonimizzata.');
    } catch (err) {
      setAccountState(err.message || 'Errore durante l’eliminazione account.');
    } finally {
      setDeletingAccount(false);
    }
  }

  const leader = leaderboard[0];
  const me = leaderboard.find(x => x.user_id === (profile?.player_id || session?.user?.id));
  const currentSession = sessions.find(x => String(x.id) === selectedSessionId);
  const deadlineTs = currentSession?.deadline ? new Date(currentSession.deadline).getTime() : null;
  const isOpen = Boolean(currentSession && !currentSession.locked && deadlineTs && nowTs < deadlineTs);
  const countdown = getCountdown(deadlineTs, nowTs);
  const myPlayerId = profile?.player_id || session?.user?.id;
  const myRankIndex = leaderboard.findIndex(x => String(x.user_id) === String(myPlayerId));
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null;

  const myGpResults = useMemo(() => {
    const scoreBySession = new Map(myScores.map(row => [Number(row.session_id), row]));

    return gps
      .map(gp => {
        const gpSessions = sessions.filter(s => Number(s.grand_prix_id) === Number(gp.id));
        const sprintSession = gpSessions.find(s => s.session_type === 'sprint');
        const raceSession = gpSessions.find(s => s.session_type === 'race');
        const sprint = sprintSession ? scoreBySession.get(Number(sprintSession.id)) : null;
        const race = raceSession ? scoreBySession.get(Number(raceSession.id)) : null;
        const hasScore = Boolean(sprint || race);

        return {
          ...gp,
          sprint: sprint || null,
          race: race || null,
          hasScore,
          basePoints: Number(sprint?.base_points || 0) + Number(race?.base_points || 0),
          bonusPoints: Number(sprint?.bonus_points || 0) + Number(race?.bonus_points || 0),
          totalPoints: Number(sprint?.total_points || 0) + Number(race?.total_points || 0)
        };
      })
      .filter(gp => gp.hasScore)
      .sort((a, b) => Number(b.round) - Number(a.round));
  }, [myScores, sessions, gps]);

  const bestGp = myGpResults.reduce((best, gp) => !best || gp.totalPoints > best.totalPoints ? gp : best, null);
  const totalBonusPoints = myScores.reduce((sum, row) => sum + Number(row.bonus_points || 0), 0);
  const scoredSessions = myScores.length;


  useEffect(() => {
    if (!session?.user || !selectedSessionId || !deadlineTs) return;
    const delay = deadlineTs - Date.now();
    if (delay <= 0) return;
    const timer = setTimeout(() => loadPrediction(selectedSessionId), delay + 1200);
    return () => clearTimeout(timer);
  }, [deadlineTs, selectedSessionId, session?.user?.id]);

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

  async function loadNews() {
    setNewsState('Aggiornamento news…');
    try {
      const res = await fetch('/api/news', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'News non disponibili');
      setNews(body.items || []);
      setNewsState(body.updatedAt ? `Aggiornate alle ${new Date(body.updatedAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}` : 'Aggiornate');
    } catch (err) {
      setNewsState(err.message || 'Errore news');
    }
  }

  async function loadHistory(gp) {
    if (!gp) return;
    setHistoryState('Caricamento storico…');
    setHistoryData(null);
    try {
      const qs = new URLSearchParams({ circuit: gp.circuit || '', name: gp.name || '' });
      const res = await fetch(`/api/history?${qs.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Storico non disponibile');
      setHistoryData(body);
      setHistoryState('');
    } catch (err) {
      setHistoryState(err.message || 'Storico non disponibile');
    }
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

  if (loading) return (
    <main className="splash">
      <div className="appBrandMark">
        <img src="/app-icon-1024.png" alt="FMGP" />
      </div>
      <p>Accensione motori…</p>
    </main>
  );

  if (!session || authMode === 'recovery') {
    return (
      <main className="loginPage">
        <div className="loginGlow" />
        <div className="brand brandWithLogo">
          <img className="loginBrandLogo" src="/app-icon-1024.png" alt="FMGP" />
          <div className="brandCopy">
            <div className="brandOver">FANTA</div>
            <div className="brandMain">MOTOGP</div>
            <div className="brandYear">2026</div>
          </div>
        </div>
        <Card className="loginCard authCard">
          <Badge tone="red">PADDOCK ACCESS</Badge>

          {authMode === 'login' && <>
            <h1>Entra nel mondiale.</h1>
            <p className="muted">Accedi al tuo paddock personale.</p>
            {authMessage && <div className="success">{authMessage}</div>}
            <form onSubmit={login} className="stack">
              <label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
              <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
              {authError && <div className="error">{authError}</div>}
              <button className="primary">ENTRA NEL PADDOCK</button>
            </form>
            <div className="authActions">
              <button type="button" className="authLink" onClick={()=>{setAuthMode('signup');setAuthError('');setAuthMessage('')}}>Crea account</button>
              <button type="button" className="authLink" onClick={()=>{setAuthMode('forgot');setAuthError('');setAuthMessage('')}}>Password dimenticata?</button>
            </div>
          </>}

          {authMode === 'signup' && <>
            <h1>Entra in griglia.</h1>
            <p className="muted">Crea il tuo profilo. Dovrai confermare l’indirizzo email.</p>
            <form onSubmit={signup} className="stack">
              <label>Nickname<input type="text" autoComplete="nickname" maxLength={24} value={nickname} onChange={e=>setNickname(e.target.value)} required /></label>
              <label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
              <label>Password<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
              <label>Conferma password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required /></label>
              <small className="authHint">Minimo 10 caratteri, con lettere e numeri.</small>
              {authError && <div className="error">{authError}</div>}
              <button className="primary">CREA ACCOUNT</button>
            </form>
            <button type="button" className="authBack" onClick={()=>{setAuthMode('login');setAuthError('');setAuthMessage('')}}>← Torna al login</button>
          </>}

          {authMode === 'forgot' && <>
            <h1>Recupera accesso.</h1>
            <p className="muted">Ti invieremo un link sicuro per scegliere una nuova password.</p>
            {authMessage && <div className="success">{authMessage}</div>}
            <form onSubmit={requestPasswordReset} className="stack">
              <label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
              {authError && <div className="error">{authError}</div>}
              <button className="primary">INVIA LINK DI RECUPERO</button>
            </form>
            <button type="button" className="authBack" onClick={()=>{setAuthMode('login');setAuthError('');setAuthMessage('')}}>← Torna al login</button>
          </>}

          {authMode === 'recovery' && <>
            <h1>Nuova password.</h1>
            <p className="muted">Il link è stato verificato. Scegli una nuova password.</p>
            {authMessage && <div className="success">{authMessage}</div>}
            <form onSubmit={finishPasswordRecovery} className="stack">
              <label>Nuova password<input type="password" autoComplete="new-password" value={recoveryPassword} onChange={e=>setRecoveryPassword(e.target.value)} required /></label>
              <label>Conferma nuova password<input type="password" autoComplete="new-password" value={recoveryConfirm} onChange={e=>setRecoveryConfirm(e.target.value)} required /></label>
              <small className="authHint">Minimo 10 caratteri, con lettere e numeri.</small>
              {authError && <div className="error">{authError}</div>}
              <button className="primary">AGGIORNA PASSWORD</button>
            </form>
          </>}
        </Card>
      </main>
    );
  }

  return (
    <main className={`appShell theme-${tab.toLowerCase()}`}>
      <header className="topbar">
        <div className="topbarBrand">
          <img src="/app-icon-1024.png" alt="FMGP" className="topbarLogo" />
          <div className="topbarBrandText">
            <span className="miniLogo">FANTA</span>
            <b>MOTOGP</b>
            <span className="season">26</span>
          </div>
        </div>
        <div className="topbarActions">
          <button type="button" className="playerQuickAvatar" onClick={()=>setTab('Campionato')} aria-label="Apri il mio campionato" title="Il mio campionato">
            <span>{(profile?.nickname || 'P').slice(0,1).toUpperCase()}</span>
          </button>
          <button className="ghost" onClick={logout}>Esci</button>
        </div>
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
            <Countdown countdown={countdown} isOpen={isOpen} compact />
            <button className="primary" onClick={()=>setTab('Pronostico')}>{isOpen?'COMPILA PRONOSTICO':'VEDI SESSIONE'}</button>
          </Card> : <Card>Nessuna sessione configurata.</Card>}
        </>}

        {tab === 'Pronostico' && <>
          <div className="pageTitle"><Badge tone="orange">PIT WALL</Badge><h1>Pronostico</h1><p>Componi la tua Top 5 in modo rapido. Tocca una posizione e scegli il pilota.</p></div>

          <Card className="predictionSessionCard">
            <label>Sessione
              <select value={selectedSessionId} onChange={e=>setSelectedSessionId(e.target.value)}>
                {sessions.map(s=><option key={s.id} value={s.id}>#{s.grands_prix?.round} {s.grands_prix?.name} · {s.session_type.toUpperCase()}</option>)}
              </select>
            </label>
            <div className="sessionMeta"><Badge tone={isOpen?'green':'neutral'}>{isOpen?'APERTA':'CHIUSA'}</Badge><span>{formatDeadline(currentSession?.deadline)}</span></div>
            <Countdown countdown={countdown} isOpen={isOpen} />
          </Card>

          <form onSubmit={submitPrediction} className="stack predictionForm">
            <Card className="predictionTop5Card">
              <div className="predictionSectionHead">
                <div>
                  <span className="predictionEyebrow">GRIGLIA PERSONALE</span>
                  <h3>Top 5</h3>
                </div>
                <span className="predictionHint">5 piloti diversi</span>
              </div>

              <div className="predictionSlotList">
                {[1,2,3,4,5].map(n=><RiderSelect
                  key={n}
                  label={`${n}° posizione`}
                  position={n}
                  value={form[`p${n}`]}
                  onChange={v=>setForm({...form,[`p${n}`]:v})}
                  riders={riders}
                  disabled={!isOpen}
                  showCard
                  compact
                />)}
              </div>
            </Card>

            <Card className="predictionBonusCard">
              <div className="predictionSectionHead">
                <div>
                  <span className="predictionEyebrow">EXTRA</span>
                  <h3>Bonus</h3>
                </div>
                <span className="predictionHint">+ punti decisivi</span>
              </div>

              <div className="predictionBonusGrid">
                <RiderSelect label="⚡ Giro veloce" value={form.fastest} onChange={v=>setForm({...form,fastest:v})} riders={riders} disabled={!isOpen} showCard compact/>
                <RiderSelect label="💥 Caduta" value={form.crash} onChange={v=>setForm({...form,crash:v})} riders={riders} disabled={!isOpen} showCard compact/>
              </div>
            </Card>

            <div className="predictionSaveBar">
              <button className="primary predictionSaveButton" disabled={!isOpen}>{myPrediction?'AGGIORNA PRONOSTICO':'SALVA PRONOSTICO'} 🔒</button>
              {saveState && <div className="predictionSaveState">{saveState}</div>}
            </div>
          </form>

          {visiblePredictions.length > 1 && <><h2 className="sectionTitle">Pronostici sbloccati</h2>
            {visiblePredictions.map(p=><Card key={p.id}><b>{p.players?.display_name || 'Giocatore'}</b><p className="muted">Pronostico visibile dopo la chiusura.</p></Card>)}</>}
        </>}

        {tab === 'News' && <>
          <div className="pageTitle"><Badge tone="red">LIVE FEED</Badge><h1>News MotoGP</h1><p>Ultime notizie, Practice, qualifiche, Sprint e paddock.</p></div>
          <div className="newsToolbar">
            <span>{newsState || 'Feed Motorsport.com MotoGP'}</span>
            <button className="secondary smallButton" onClick={loadNews}>↻ AGGIORNA</button>
          </div>
          {news.length ? <div className="newsList">{news.map((n,i)=><a className="newsCard" href={n.link} target="_blank" rel="noreferrer" key={`${n.link}-${i}`}>
            <div className="newsMeta"><Badge tone={i===0?'red':'neutral'}>{i===0?'ULTIMA':'NEWS'}</Badge><span>{n.pubDate ? new Date(n.pubDate).toLocaleString('it-IT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : ''}</span></div>
            <h3>{n.title}</h3>
            {n.summary && <p>{n.summary}</p>}
            <div className="newsSource">Motorsport.com Italia <b>→</b></div>
          </a>)}</div> : <Card><p className="muted">{newsState || 'Caricamento news…'}</p></Card>}
          <Card className="officialLinkCard"><div><small>FONTE UFFICIALE</small><b>MotoGP™ Latest News</b></div><a href="https://www.motogp.com/it/news/latest-news" target="_blank" rel="noreferrer">APRI ↗</a></Card>
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


        {tab === 'Storico' && <>
          <div className="pageTitle"><Badge tone="orange">TRACK INTELLIGENCE</Badge><h1>Storico pista</h1><p>Ultimi cinque anni: chi ha funzionato davvero su questo circuito.</p></div>
          <Card>
            <label>Circuito
              <select value={historyGpId} onChange={e=>setHistoryGpId(e.target.value)}>
                {gps.map(g=><option key={g.id} value={g.id}>#{g.round} {g.name} · {g.circuit}</option>)}
              </select>
            </label>
          </Card>
          {historyState && <div className="notice">{historyState}</div>}
          {historyData?.intelligence && <div className="intelGrid">
            <Card><small>PIÙ VITTORIE</small><strong>{historyData.intelligence.mostWins || '—'}</strong></Card>
            <Card><small>PIÙ PODI</small><strong>{historyData.intelligence.mostPodiums || '—'}</strong></Card>
            <Card><small>COSTRUTTORE</small><strong>{historyData.intelligence.topConstructor || '—'}</strong></Card>
          </div>}
          {historyData?.years?.length ? <div className="historyYears">{historyData.years.map(y=><Card key={y.year} className="historyCard">
            <div className="historyHead"><strong>{y.year}</strong><span>{y.circuit || historyData.circuit}</span></div>
            {y.top5?.length ? <div className="historyTop5">{y.top5.map(r=><div key={`${y.year}-${r.position}`}><b>{r.position}</b><span><strong>{r.rider}</strong><small>{r.team} · {r.constructor}</small></span></div>)}</div> : <p className="muted">GP non disputato / dati non disponibili.</p>}
          </Card>)}</div> : (!historyState && <Card><p className="muted">Seleziona una pista per caricare lo storico.</p></Card>)}
          <p className="sourceNote">Dati storici: risultati MotoGP™. La sezione è informativa e non genera pronostici.</p>
        </>}



        {tab === 'Campionato' && <>
          <div className="pageTitle mySeasonTitle">
            <button type="button" className="profileBackButton" onClick={()=>setTab('Home')}>← HOME</button>
            <Badge tone="orange">RIDER DATA</Badge>
            <h1>Il mio campionato</h1>
            <p>Tutti i punti ottenuti, GP dopo GP.</p>
          </div>

          <Card className="mySeasonHero">
            <div className="mySeasonAvatar" aria-hidden="true">
              <span>{(profile?.nickname || 'P').slice(0,1).toUpperCase()}</span>
              <i>FM</i>
            </div>
            <div className="mySeasonIdentity">
              <small>FANTAMOTOGP 2026</small>
              <h2>{profile?.nickname || 'Pilota'}</h2>
              <p>{myRank ? `${myRank}° in classifica` : 'Posizione non disponibile'} · {fmt(me?.total_points || 0)} punti</p>
            </div>
            <div className="mySeasonRank"><span>#</span>{myRank || '—'}</div>
          </Card>

          <div className="mySeasonStats">
            <Card><small>PUNTI CLASSIFICA</small><strong>{fmt(me?.total_points || 0)}</strong><span>stagione</span></Card>
            <Card><small>GP CON PUNTEGGIO</small><strong>{myGpResults.length}</strong><span>su {gps.length || 22}</span></Card>
            <Card><small>MIGLIOR GP</small><strong>{bestGp ? fmt(bestGp.totalPoints) : '—'}</strong><span>{bestGp?.name || 'nessun dato'}</span></Card>
            <Card><small>BONUS</small><strong>{fmt(totalBonusPoints)}</strong><span>{scoredSessions} sessioni registrate</span></Card>
          </div>

          <div className="mySeasonSectionHead">
            <div><span>STORICO</span><h2>Risultati GP</h2></div>
            <small>{myGpResults.length} GP registrati</small>
          </div>

          {scoresState && <div className="notice">Storico punteggi non disponibile: {scoresState}</div>}

          {myGpResults.length ? <div className="gpResultsList">
            {myGpResults.map(gp => <details className="gpResultCard" key={gp.id}>
              <summary>
                <div className="gpResultRound">{String(gp.round).padStart(2,'0')}</div>
                <div className="gpResultIdentity">
                  <b>{gp.name}</b>
                  <span>{gp.circuit} · {gp.gp_date ? new Date(`${gp.gp_date}T12:00:00`).toLocaleDateString('it-IT',{day:'2-digit',month:'short'}) : '—'}</span>
                </div>
                <div className="gpResultTotal"><strong>{fmt(gp.totalPoints)}</strong><small>PT</small></div>
                <span className="gpResultChevron">⌄</span>
              </summary>

              <div className="gpResultDetails">
                <ScoreBreakdown label="Sprint" score={gp.sprint} />
                <ScoreBreakdown label="Gara" score={gp.race} />
              </div>

              <div className="gpResultFooter">
                <span>Base <b>{fmt(gp.basePoints)}</b></span>
                <span>Bonus <b>+{fmt(gp.bonusPoints)}</b></span>
                <span>Totale GP <b>{fmt(gp.totalPoints)}</b></span>
              </div>
            </details>)}
          </div> : !scoresState && <Card className="mySeasonEmpty"><h3>Nessun risultato ancora disponibile.</h3><p className="muted">Quando verranno calcolati i punteggi, compariranno qui GP per GP.</p></Card>}
        </>}

        {tab === 'Account' && <>
          <div className="pageTitle"><Badge tone="neutral">ACCOUNT</Badge><h1>Profilo</h1><p>Gestisci accesso, identità e privacy del tuo account.</p></div>

          <Card className="accountCard">
            <div className="accountRow"><span>Nickname</span><b>{profile?.nickname || '—'}</b></div>
            <div className="accountRow"><span>Email</span><b>{session?.user?.email || '—'}</b></div>
            <div className="accountRow"><span>Ruolo</span><b>{profile?.role === 'admin' ? 'Admin' : 'Player'}</b></div>
          </Card>

          <Card className="privacyCard">
            <h3>Privacy e storico</h3>
            <p className="muted">Se elimini l’account, email, credenziali e profilo di accesso vengono rimossi. Pronostici e punteggi già registrati restano nello storico del campionato con una nuova identità tecnica e un nome anonimizzato.</p>
          </Card>

          <Card className="dangerZone">
            <Badge tone="red">DANGER ZONE</Badge>
            <h3>Elimina account</h3>
            {profile?.role === 'admin' ? <>
              <p className="muted">Per sicurezza l’account Admin non può essere eliminato direttamente dall’app.</p>
            </> : <>
              <p className="muted">Questa operazione è definitiva. Per confermare scrivi <b>ELIMINA</b>.</p>
              <input value={deletePhrase} onChange={e=>setDeletePhrase(e.target.value)} placeholder="Scrivi ELIMINA" autoComplete="off" />
              <button className="dangerButton" type="button" disabled={deletingAccount || deletePhrase.trim() !== 'ELIMINA'} onClick={deleteAccount}>{deletingAccount ? 'ELIMINAZIONE…' : 'ELIMINA DEFINITIVAMENTE'}</button>
            </>}
            {accountState && <div className="notice">{accountState}</div>}
          </Card>
        </>}

        {tab === 'Regolamento' && <>
          <div className="pageTitle"><Badge tone="red">RULE BOOK</Badge><h1>Regolamento</h1><p>Una sola versione ufficiale. Quella dell'app.</p></div>
          <Card className="ruleHero"><div className="ruleNo">01</div><div><h3>Deadline</h3><p>Il pronostico si può inserire e modificare fino all'ora limite indicata dal countdown. Dal minuto successivo è bloccato. Il countdown dell'app fa fede.</p></div></Card>
          <div className="ruleGrid">
            <Card><span>🥇</span><b>1° esatto</b><strong>coeff. ×5</strong></Card>
            <Card><span>🥈</span><b>2° esatto</b><strong>coeff. ×3</strong></Card>
            <Card><span>🥉</span><b>3° esatto</b><strong>coeff. ×2</strong></Card>
            <Card><span>4️⃣</span><b>4° esatto</b><strong>coeff. ×1,5</strong></Card>
            <Card><span>5️⃣</span><b>5° esatto</b><strong>coeff. ×1,5</strong></Card>
          </div>
          <Card className="ruleList"><h3>Bonus & malus</h3><p>⚡ Giro veloce corretto <b>+1</b></p><p>💥 Caduta corretta <b>+1</b></p><p>🎯 Prime 4 posizioni tutte esatte <b>+4</b></p><p>✨ Golden: Top 4 + giro veloce + caduta <b>+5</b></p><p>☠️ Nessuno dei 5 pronosticati nella Top 5 reale <b>−5</b></p><p>↔️ Pilota nei primi 5 ma in posizione diversa: vale il <b>coefficiente base</b>.</p></Card>
          <h2 className="sectionTitle">Coefficienti piloti 2026</h2>
          <div className="coeffGrid">{riders.map(r=>{const m=getRiderMeta(r.name); return <div className={`coeffCard ${m.teamClass}`} key={r.id}><div className="riderNo">#{m.number || '—'}</div><div><b>{r.name}</b><span>{m.team || 'MotoGP'} · {m.bike || ''}</span></div><strong>x{String(r.coefficient).replace('.',',')}</strong></div>})}</div>
          <h2 className="sectionTitle">Griglia MotoGP 2026</h2>
          <div className="teamGrid">{TEAM_ORDER.map(t=><Card key={t.team} className={`teamCard ${t.teamClass}`}><div className="teamBike">{t.bike}</div><h3>{t.team}</h3><p>{t.riders.join(' · ')}</p></Card>)}</div>
        </>}

        {tab === 'Calendario' && <>
          <div className="pageTitle"><Badge tone="neutral">22 ROUND</Badge><h1>Calendario</h1></div>
          <div className="calendarList">
            {gps.map(g=><Card key={g.id} className="gpCard"><div className="round">{String(g.round).padStart(2,'0')}</div><div className="gpIdentity"><div className="gpNameLine"><b>{g.name}</b><span className="circuitPill">📍 {g.circuit}</span></div><span className="gpSubline">ROUND {String(g.round).padStart(2,'0')} · MOTOGP 2026</span></div><time>{g.gp_date ? new Date(`${g.gp_date}T12:00:00`).toLocaleDateString('it-IT',{day:'2-digit',month:'short'}) : '—'}</time></Card>)}
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
        {TABS.filter(x=>x!=='Admin' || profile?.role==='admin').map(x=><button key={x} data-tab={x.toLowerCase()} className={tab===x?'active':''} onClick={()=>setTab(x)}><span>{navIcon(x)}</span>{x}</button>)}
      </nav>
    </main>
  );
}

function ScoreBreakdown({ label, score }) {
  if (!score) {
    return <div className="scoreBreakdown missing"><div><span>{label}</span><small>Nessun punteggio registrato</small></div><strong>—</strong></div>;
  }

  return <div className="scoreBreakdown">
    <div>
      <span>{label}</span>
      <small>Base {fmt(score.base_points)} · Bonus +{fmt(score.bonus_points)}</small>
    </div>
    <strong>{fmt(score.total_points)} <small>PT</small></strong>
  </div>;
}

function RiderSelect({ label, value, onChange, riders, disabled=false, showCard=false, compact=false, position=null }) {
  const selected = riders.find(r => String(r.id) === String(value));
  const meta = selected ? getRiderMeta(selected.name) : null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  if (!showCard) {
    return <label className="riderSelect">{label}<select disabled={disabled} value={value} onChange={e=>onChange(e.target.value)}><option value="">Seleziona pilota</option>{riders.map(r=>{const m=getRiderMeta(r.name); return <option key={r.id} value={r.id}>#{m.number || '—'} {r.name} · {m.bike || 'MotoGP'} · x{String(r.coefficient).replace('.',',')}</option>})}</select></label>;
  }

  const filtered = riders.filter(r => {
    const m = getRiderMeta(r.name);
    const haystack = `${r.name} ${m.team} ${m.bike} ${m.number}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return <div className={`riderPickerField ${compact?'riderPickerFieldCompact':''}`}>
    <div className="riderPickerLabel">{label}</div>
    <button type="button" className={`riderPickerButton ${selected ? 'hasRider' : ''} ${compact?'compact':''}`} disabled={disabled} onClick={()=>!disabled && setOpen(true)}>
      {selected
        ? (compact
            ? <RiderCompactSelected rider={selected} meta={meta} position={position} />
            : <RiderShowcase rider={selected} meta={meta} />)
        : (compact
            ? <div className="riderCompactEmpty"><span className="compactPosition">{position || '＋'}</span><div><b>Scegli pilota</b><small>Tocca per aprire la lista</small></div><span className="riderEmptyArrow">＋</span></div>
            : <div className="riderEmpty"><span className="riderEmptyFlag">🏁</span><div><b>SCEGLI PILOTA</b><small>Apri il garage MotoGP</small></div><span className="riderEmptyArrow">＋</span></div>)}
    </button>

    {open && <div className="riderPickerOverlay" role="dialog" aria-modal="true">
      <button type="button" className="riderPickerBackdrop" aria-label="Chiudi" onClick={()=>setOpen(false)} />
      <section className={`riderPickerSheet ${compact?'riderPickerSheetCompact':''}`}>
        <div className="riderPickerHead"><div><span className="pickerEyebrow">MOTOGP 2026 · RIDER GARAGE</span><h2>{label}</h2></div><button type="button" className="pickerClose" onClick={()=>setOpen(false)}>×</button></div>
        <div className="riderSearch"><span>⌕</span><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cerca pilota, team o numero…" /></div>
        <div className={`riderPickerGrid ${compact?'riderPickerGridCompact':''}`}>
          {filtered.map(r=>{const m=getRiderMeta(r.name); const active=String(r.id)===String(value); return <button type="button" key={r.id} className={`riderChoice ${compact?'riderChoiceCompact':''} ${m.teamClass || ''} ${active?'selected':''}`} style={riderVars(m)} data-pattern={m.pattern || 'slash'} onClick={()=>{onChange(String(r.id));setOpen(false);setQuery('')}}>
            <RiderArt meta={m} compact />
            <div className="choiceInfo"><div className="choiceTop"><span>{m.flag || '🏁'} #{m.number || '—'}</span><strong>x{String(r.coefficient).replace('.',',')}</strong></div><b>{r.name}</b><small>{m.team || 'MotoGP'}</small><em>{m.bike || 'MotoGP'}</em></div>
          </button>})}
        </div>
        {!filtered.length && <div className="riderNoResults">Nessun pilota trovato.</div>}
      </section>
    </div>}
  </div>;
}

function RiderCompactSelected({ rider, meta, position }) {
  return <div className={`riderCompactSelected ${meta?.teamClass || ''}`} style={riderVars(meta)} data-pattern={meta?.pattern || 'slash'}>
    <div className="riderCompactArt"><RiderArt meta={meta} compact /></div>
    <div className="riderCompactInfo">
      <div className="riderCompactTop"><span>{position ? `${position}°` : (meta?.flag || '🏁')}</span><small>#{meta?.number || '—'} · x{String(rider.coefficient).replace('.',',')}</small></div>
      <b>{rider.name}</b>
      <span>{meta?.team || 'MotoGP'}</span>
    </div>
    <div className="riderCompactChange">CAMBIA</div>
  </div>;
}

function RiderShowcase({ rider, meta }) {
  return <div className={`riderShowcase ${meta?.teamClass || ''}`} style={riderVars(meta)} data-pattern={meta?.pattern || 'slash'}>
    <RiderArt meta={meta} />
    <div className="riderShowcaseInfo">
      <div className="riderShowcaseTop"><span>{meta?.flag || '🏁'} #{meta?.number || '—'}</span><strong>x{String(rider.coefficient).replace('.',',')}</strong></div>
      <h4>{rider.name}</h4>
      <p>{meta?.team || 'MotoGP'}</p>
      <div className="riderMachine"><span>FACTORY MACHINE</span><b>{meta?.bike || 'MotoGP'}</b></div>
    </div>
    <div className="changeRider">CAMBIA</div>
  </div>;
}

function RiderArt({ meta, compact=false }) {
  const no = meta?.number || '—';
  return <div className={`riderArt ${meta?.teamClass || ''} ${compact?'compact':''}`} style={riderVars(meta)} data-pattern={meta?.pattern || 'slash'}>
    <svg viewBox="0 0 240 150" aria-hidden="true">
      <defs><linearGradient id={`fade-${meta?.teamClass || 'r'}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".98"/><stop offset="1" stopColor="currentColor" stopOpacity=".22"/></linearGradient></defs>
      <path className="speedLine" d="M18 112 C62 97 100 93 141 96" />
      <circle className="wheel" cx="65" cy="112" r="24"/><circle className="wheel" cx="184" cy="112" r="24"/>
      <circle className="rim" cx="65" cy="112" r="11"/><circle className="rim" cx="184" cy="112" r="11"/>
      <path className="bikeBody" d="M61 100 L91 74 L143 72 L173 94 L190 99 L178 109 L145 101 L108 102 L83 111 Z"/>
      <path className="bikeWing" d="M137 70 L171 58 L180 62 L158 78 Z"/>
      <path className="riderBody" d="M105 73 C111 51 130 42 149 49 C160 54 166 66 166 78 L143 80 L128 69 Z"/>
      <circle className="helmet" cx="125" cy="48" r="18"/>
      <path className="visor" d="M114 44 Q127 35 141 43 L137 51 L115 51 Z"/>
    </svg>
    <span className="artNumber">{no}</span><span className="artStripe"/><span className="artPulse"/><span className="artBadge">{meta?.bike || 'MotoGP'}</span><span className="artTag">{meta?.riderTag || meta?.country || 'FACTORY'}</span>
  </div>;
}

function riderVars(meta) {
  return {
    '--riderA': meta?.primary || '#6b7686',
    '--riderB': meta?.secondary || '#202938',
    '--riderGlow': meta?.glow || meta?.primary || '#6b7686',
    '--team': meta?.primary || '#6b7686'
  };
}

function navIcon(x) {
  return ({Home:'🏠',News:'📰',Calendario:'🗓️',Storico:'🧠',Paddock:'🏆',Pronostico:'🎯',Account:'👤',Regolamento:'📜',Admin:'🛠️'})[x];
}


function getCountdown(deadlineTs, nowTs) {
  if (!deadlineTs) return null;
  const diff = Math.max(0, deadlineTs - nowTs);
  const total = Math.floor(diff / 1000);
  return {
    expired: diff <= 0,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    totalMs: diff
  };
}

function Countdown({ countdown, isOpen, compact=false }) {
  if (!countdown) return <div className={`countdown ${compact?'compact':''} missing`}>Deadline da impostare</div>;
  const pad = n => String(n).padStart(2, '0');
  const urgent = isOpen && countdown.totalMs <= 60 * 60 * 1000;
  return <div className={`countdown ${compact?'compact':''} ${urgent?'urgent':''} ${!isOpen?'expired':''}`}>
    <div className="countdownLabel">{isOpen ? 'CHIUSURA PRONOSTICI' : 'PRONOSTICI CHIUSI'}</div>
    {isOpen ? <div className="countdownClock">
      <span><b>{pad(countdown.days)}</b><small>GG</small></span>
      <i>:</i><span><b>{pad(countdown.hours)}</b><small>HH</small></span>
      <i>:</i><span><b>{pad(countdown.minutes)}</b><small>MM</small></span>
      <i>:</i><span><b>{pad(countdown.seconds)}</b><small>SS</small></span>
    </div> : <div className="countdownClosed">🔒 In attesa del via</div>}
  </div>;
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

  const isLeader = rank === 1;
  const isLast = rank === 3;
  const role = isLeader ? 'IMPERATORE' : isLast ? 'FANALINO DI CODA' : 'CACCIATORE';
  const subtitle = isLeader
    ? 'Corona salda. Gli altri inseguono.'
    : isLast
      ? 'Il paddock ha già ordinato le rotelle.'
      : 'Nel mirino c’è solo il trono.';
  const accessory = isLeader ? '👑' : isLast ? '🛟' : '🎯';
  const prop = isLeader ? '🏆' : isLast ? '🦆' : '⚔️';
  const title = isLeader ? 'Re del Campionato' : isLast ? 'Ultimo, ma con stile discutibile' : 'Pretendente al Trono';

  return <Card className={`avatarCard avatarLevel${level} ${isLeader?'avatarLeader':''} ${isLast?'avatarLast':''}`}>
    <div className="avatarRole">{role}</div>
    <div className="riderPortrait" aria-hidden="true">
      <div className="portraitHalo" />
      <div className="helmet">
        <div className="helmetTop">{accessory}</div>
        <div className="visor" />
        <div className="helmetMark">{player.nickname?.slice(0,1)}</div>
      </div>
      <div className="riderBody">
        <div className="suitStripe" />
        <div className="chestMark">FM</div>
      </div>
      <div className="avatarProp">{prop}</div>
      {isLast && <div className="shameTag">3°</div>}
    </div>
    <div className="avatarIdentity">
      <small>LVL {level} · {title}</small>
      <h3>{player.nickname}</h3>
      <p>{subtitle}</p>
    </div>
    <div className="gearLine"><span>{isLeader?'Livrea oro + corona':isLast?'Paperella + salvagente':'Visiera da caccia + mirino'}</span><strong>{fmt(pts)} PT</strong></div>
    <div className="xpTrack"><i style={{width:`${Math.min(100, Math.max(8,(pts%100)))}%`}} /></div>
    <div className="avatarStats"><span>{wins} vittorie</span><span>{isLeader?'👑 Leader':`-${fmt(gap)} dal leader`}</span></div>
  </Card>;
}
