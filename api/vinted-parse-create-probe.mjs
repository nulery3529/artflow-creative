const TOKEN = 'af-vinted-us-20260901-7f4c92';
const clean = (v='') => String(v ?? '').trim();

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  if(clean(req.query?.token) !== TOKEN) return res.status(404).json({error:'Not found'});
  const key=clean(process.env.PARSE_API_KEY);
  if(!key) return res.status(503).json({error:'Parse API key missing'});
  try{
    const r=await fetch('https://api.parse.bot/dispatch',{
      method:'POST',
      headers:{Accept:'application/json','Content-Type':'application/json','X-API-Key':key},
      body:JSON.stringify({
        url:'https://www.vinted.com',
        task:'Create an endpoint named get_user_profile that accepts a Vinted member/profile URL or username and returns that seller profile plus all current active wardrobe listings. Each listing must include id, title, price, currency, url, thumbnail or image URL, status, brand and size when available. If the wardrobe is paginated, support pagination or return all active listings in one call. Target vinted.com, not vinted.pl, vinted.fi, vinted.fr, vinted.de, or vinted.co.uk.'
      })
    });
    const text=await r.text(); let payload={}; try{payload=text?JSON.parse(text):{}}catch{payload={raw:text}}
    return res.status(r.status).json(payload);
  }catch(e){return res.status(500).json({error:clean(e?.message||'Create failed')});}
}
