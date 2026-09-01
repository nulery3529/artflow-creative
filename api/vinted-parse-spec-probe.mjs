const TASK_ID = '3797bda5-abcc-4c8a-92ef-fbec345c3241';
const clean = (v='') => String(v ?? '').trim();

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  const key=clean(process.env.PARSE_API_KEY);
  if(!key) return res.status(503).json({configured:false});
  try{
    const r=await fetch(`https://api.parse.bot/dispatch/tasks/${TASK_ID}`,{headers:{Accept:'application/json','X-API-Key':key}});
    const text=await r.text(); let payload={}; try{payload=text?JSON.parse(text):{}}catch{payload={raw:text}}
    if(!r.ok) return res.status(r.status).json({error:'Parse task detail failed',status:r.status});
    const g=payload?.generated_api||{};
    return res.status(200).json({
      status:payload?.status||'',
      task_id:TASK_ID,
      scraper_id:g.scraper_id||payload?.result_scraper_id||'',
      marketplace_id:g.marketplace_id||payload?.result_marketplace_id||'',
      execution_base_url:g.execution_base_url||'',
      name:g.name||'',
      source_url:g.source_url||'',
      endpoints:(Array.isArray(g.endpoints)?g.endpoints:[]).map(e=>({name:e.endpoint_name||e.name||'',method:e.method||'GET',description:e.description||'',input_params:e.input_params||{},return_schema:e.return_schema||{}}))
    });
  }catch(e){return res.status(500).json({error:clean(e?.message||'Probe failed')});}
}
