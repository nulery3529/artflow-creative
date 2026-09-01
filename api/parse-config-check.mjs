export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  return res.status(200).json({parse_key_configured:Boolean(String(process.env.PARSE_API_KEY||'').trim())});
}
