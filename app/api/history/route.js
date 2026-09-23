export const revalidate = 21600;
const BASE = 'https://api.motogp.pulselive.com/motogp/v1';
const YEARS = [2025,2024,2023,2022,2021];
const stop = new Set(['circuit','international','internazionale','del','della','di','de','the','raceway','motor','world']);
function norm(s=''){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
function tokens(s=''){return norm(s).split(' ').filter(x=>x.length>2&&!stop.has(x))}
function score(a,b){const A=tokens(a),B=new Set(tokens(b));return A.reduce((n,x)=>n+(B.has(x)?2:0),0)+(norm(a).includes(norm(b))||norm(b).includes(norm(a))?4:0)}
async function j(url){const r=await fetch(url,{next:{revalidate:21600},headers:{'User-Agent':'FantaMotoGP/1.0'}});if(!r.ok)throw new Error(`${r.status}`);return r.json()}
async function yearData(year,circuit,name){
  try{
    const seasons=await j(`${BASE}/results/seasons`); const season=seasons.find(s=>Number(s.year)===year); if(!season)return {year,top5:[]};
    const events=await j(`${BASE}/results/events?seasonUuid=${season.id}`);
    const ranked=events.map(e=>({e,s:Math.max(score(e.circuit?.name||'',circuit),score(e.name||e.sponsored_name||'',name))})).sort((a,b)=>b.s-a.s);
    const event=ranked[0]?.s>0?ranked[0].e:null; if(!event)return {year,top5:[]};
    const cats=await j(`${BASE}/results/categories?eventUuid=${event.id}`); const cat=cats.find(c=>Number(c.legacy_id)===3)||cats.find(c=>String(c.name).includes('MotoGP')); if(!cat)return {year,top5:[]};
    const sessions=await j(`${BASE}/results/sessions?eventUuid=${event.id}&categoryUuid=${cat.id}`);
    const race=sessions.find(s=>String(s.type).toUpperCase()==='RAC') || sessions.find(s=>/race/i.test(s.name||s.session_name||'')); if(!race)return {year,circuit:event.circuit?.name,top5:[]};
    const cl=await j(`${BASE}/results/session/${race.id}/classification?seasonYear=${year}&test=false`);
    const top5=(cl.classification||[]).filter(x=>Number(x.position)>0).sort((a,b)=>a.position-b.position).slice(0,5).map(x=>({position:x.position,rider:x.rider?.full_name||'',team:x.team?.name||'',constructor:x.constructor?.name||''}));
    return {year,circuit:event.circuit?.name||circuit,top5};
  }catch(e){return {year,top5:[]}}
}
function intelligence(years){
  const wins={},podiums={},ctors={};
  years.forEach(y=>y.top5?.forEach((r,i)=>{if(i===0)wins[r.rider]=(wins[r.rider]||0)+1;if(i<3)podiums[r.rider]=(podiums[r.rider]||0)+1;if(i<3&&r.constructor)ctors[r.constructor]=(ctors[r.constructor]||0)+1}));
  const best=o=>Object.entries(o).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
  return {mostWins:best(wins),mostPodiums:best(podiums),topConstructor:best(ctors)};
}
export async function GET(req){
  const {searchParams}=new URL(req.url); const circuit=searchParams.get('circuit')||''; const name=searchParams.get('name')||'';
  if(!circuit&&!name)return Response.json({error:'Circuito mancante'},{status:400});
  const years=await Promise.all(YEARS.map(y=>yearData(y,circuit,name)));
  return Response.json({circuit,name,years,intelligence:intelligence(years),updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'public, s-maxage=21600, stale-while-revalidate=86400'}});
}
