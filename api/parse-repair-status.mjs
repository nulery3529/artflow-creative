const TASK_ID='f61e8fd0-3cc7-4ee1-8cbc-fea1595e2653';
const clean=(v='')=>String(v??'').trim();
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const key=clean(process.env.PARSE_API_KEY);
  if(!key) return res.status(503).json({error:'Parse API key missing'});
  try{
    const r=await fetch('https://api.parse.bot/dispatch/tasks?limit=100',{headers:{Accept:'application/json','X-API-Key':key}});
    const text=await r.text(); let payload={}; try{payload=text?JSON.parse(text):{}}catch{}
    if(!r.ok) return res.status(r.status).json({error:'Parse task status lookup failed',status:r.status});
    const tasks=Array.isArray(payload?.tasks)?payload.tasks:[];
    const t=tasks.find(x=>x?.id===TASK_ID);
    if(!t) return res.status(404).json({found:false,task_id:TASK_ID});
    return res.status(200).json({found:true,task_id:TASK_ID,status:t.status||'',result_scraper_id:t.result_scraper_id||t.generated_api?.scraper_id||'',result_marketplace_id:t.result_marketplace_id||t.generated_api?.marketplace_id||'',error:t.error||t.failure_reason||null});
  }catch(e){return res.status(500).json({error:clean(e?.message||'Status lookup failed')});}
}
