const SCRAPER_ID = '21a016a2-7521-42f3-887d-95f9aec5ec31';
const clean = (v='') => String(v ?? '').trim();

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  const key = clean(process.env.PARSE_API_KEY);
  if(!key) return res.status(503).json({configured:false});
  try{
    const r = await fetch(`https://api.parse.bot/scraper/${SCRAPER_ID}`, {headers:{Accept:'application/json','X-API-Key':key}});
    const text = await r.text();
    let payload={}; try{payload=text?JSON.parse(text):{}}catch{payload={raw:text}}
    if(!r.ok) return res.status(r.status).json({error:'Parse scraper metadata failed',status:r.status,detail:clean(payload?.detail||payload?.message||payload?.error||'')});
    const source = payload?.generated_api || payload?.api || payload;
    const endpoints = (Array.isArray(source?.endpoints)?source.endpoints:[]).map(e=>({name:e.endpoint_name||e.name||'',method:e.method||'GET',description:e.description||'',input_params:Object.keys(e.input_params||e.parameters||{})}));
    return res.status(200).json({found:true,scraper_id:SCRAPER_ID,name:source?.name||'',source_url:source?.source_url||'',endpoints});
  }catch(e){return res.status(500).json({error:clean(e?.message||'Probe failed')});}
}
