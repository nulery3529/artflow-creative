const TARGET = '21a016a2-7521-42f3-887d-95f9aec5ec31';
const clean = (v='') => String(v ?? '').trim();

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  const key=clean(process.env.PARSE_API_KEY);
  if(!key) return res.status(503).json({configured:false});
  try{
    const r=await fetch('https://api.parse.bot/dispatch/tasks?limit=100',{headers:{Accept:'application/json','X-API-Key':key}});
    const text=await r.text(); let payload={}; try{payload=text?JSON.parse(text):{}}catch{}
    if(!r.ok) return res.status(r.status).json({error:'Parse task lookup failed',status:r.status});
    const tasks=Array.isArray(payload?.tasks)?payload.tasks:[];
    const summaries=tasks.map(t=>({
      id:t.id||'',
      status:t.status||'',
      url:t.url||'',
      task:t.task||'',
      result_scraper_id:t.result_scraper_id||t.generated_api?.scraper_id||'',
      result_marketplace_id:t.result_marketplace_id||t.generated_api?.marketplace_id||'',
      name:t.generated_api?.name||'',
      source_url:t.generated_api?.source_url||'',
      endpoints:(Array.isArray(t.generated_api?.endpoints)?t.generated_api.endpoints:[]).map(e=>({name:e.endpoint_name||e.name||'',method:e.method||'GET',description:e.description||'',input_params:Object.keys(e.input_params||{})}))
    }));
    const matching=summaries.filter(x=>x.id===TARGET||x.result_scraper_id===TARGET||/vinted/i.test(`${x.url} ${x.task} ${x.name} ${x.source_url}`));
    return res.status(200).json({target:TARGET,total:tasks.length,matching,all:summaries});
  }catch(e){return res.status(500).json({error:clean(e?.message||'Probe failed')});}
}
