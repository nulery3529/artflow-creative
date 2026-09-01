const TOKEN = 'af-depop-500-20260901-3d7f1a';
const clean = (v='') => String(v ?? '').trim();

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  if(clean(req.query?.token) !== TOKEN) return res.status(404).json({error:'Not found'});
  const key=clean(process.env.PARSE_API_KEY);
  if(!key) return res.status(503).json({error:'Parse API key missing'});
  const mode=clean(req.query?.mode || 'create');
  try{
    if(mode === 'test'){
      const r=await fetch('https://api.parse.bot/scraper/e781fdf1-07fd-44a5-abc9-cfbbe53a5243/get_seller_listings?username=vintage_finds&limit=100&max_results=5',{headers:{Accept:'application/json','X-API-Key':key}});
      const text=await r.text(); let payload={}; try{payload=text?JSON.parse(text):{}}catch{payload={raw:text}}
      const data=payload?.data&&typeof payload.data==='object'?payload.data:payload;
      const products=Array.isArray(data?.products)?data.products:(Array.isArray(data?.listings)?data.listings:[]);
      return res.status(r.status).json({ok:r.ok,status:r.status,top_keys:Object.keys(payload||{}),data_keys:Object.keys(data||{}),count:products.length,has_more:data?.has_more??data?.meta?.has_more??null,total_count:data?.total_count??data?.meta?.total_count??null,error:payload?.error||null,available_endpoints:payload?.available_endpoints||payload?.endpoints||null});
    }
    if(mode === 'status'){
      const r=await fetch('https://api.parse.bot/dispatch/tasks?limit=100',{headers:{Accept:'application/json','X-API-Key':key}});
      const text=await r.text(); let payload={}; try{payload=text?JSON.parse(text):{}}catch{}
      if(!r.ok) return res.status(r.status).json({error:'Parse task lookup failed'});
      const tasks=Array.isArray(payload?.tasks)?payload.tasks:[];
      const matches=tasks.filter(t=>/Art Flow.*Depop|500 active seller listings|depop\.com/i.test(`${t.task||''} ${t.url||''}`)).map(t=>({id:t.id||'',status:t.status||'',result_scraper_id:t.result_scraper_id||t.generated_api?.scraper_id||'',result_marketplace_id:t.result_marketplace_id||t.generated_api?.marketplace_id||'',endpoints:(Array.isArray(t.generated_api?.endpoints)?t.generated_api.endpoints:[]).map(e=>({name:e.endpoint_name||e.name||'',method:e.method||'GET',description:e.description||'',input_params:Object.keys(e.input_params||{})}))}));
      return res.status(200).json({matches});
    }
    const r=await fetch('https://api.parse.bot/dispatch',{
      method:'POST',
      headers:{Accept:'application/json','Content-Type':'application/json','X-API-Key':key},
      body:JSON.stringify({
        url:'https://www.depop.com',
        task:'Art Flow Depop bulk seller listings: Create an endpoint named get_seller_listings_all that accepts a Depop username and optional max_results up to 500. It must internally paginate through the seller active listings endpoint until it has collected all active listings or max_results, rather than requiring the caller to manage cursors. Return one flat products array with listing id, slug, title or description, price/pricing, currency, image or preview image URLs, status, sold flag, listing URL, plus total_count, returned_count, has_more, and next_cursor when more than max_results exist. This endpoint must reliably return up to 500 active seller listings for a shop in one call.'
      })
    });
    const text=await r.text(); let payload={}; try{payload=text?JSON.parse(text):{}}catch{payload={raw:text}}
    return res.status(r.status).json(payload);
  }catch(e){return res.status(500).json({error:clean(e?.message||'Parse request failed')});}
}
