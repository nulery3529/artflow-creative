const SCRAPER_ID = '21a016a2-7521-42f3-887d-95f9aec5ec31';
const clean = (v='') => String(v ?? '').trim();

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  const key = clean(process.env.PARSE_API_KEY);
  if(!key) return res.status(503).json({configured:false});
  try{
    const r = await fetch('https://api.parse.bot/dispatch/tasks?limit=100&status=completed', {headers:{Accept:'application/json','X-API-Key':key}});
    const text = await r.text();
    let payload={}; try{payload=text?JSON.parse(text):{}}catch{}
    if(!r.ok) return res.status(r.status).json({error:'Parse task lookup failed',status:r.status});
    const tasks = Array.isArray(payload?.tasks)?payload.tasks:[];
    const task = tasks.find(t=>t?.result_scraper_id===SCRAPER_ID || t?.generated_api?.scraper_id===SCRAPER_ID);
    const spec = task?.generated_api || null;
    if(!spec) return res.status(404).json({found:false,task_count:tasks.length});
    const endpoints = (Array.isArray(spec.endpoints)?spec.endpoints:[]).map(e=>({name:e.endpoint_name||e.name||'',method:e.method||'GET',description:e.description||'',input_params:Object.keys(e.input_params||{})}));
    return res.status(200).json({found:true,scraper_id:SCRAPER_ID,endpoints});
  }catch(e){return res.status(500).json({error:clean(e?.message||'Probe failed')});}
}
