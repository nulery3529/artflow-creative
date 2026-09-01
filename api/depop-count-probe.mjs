import pg from 'pg';
const { Pool } = pg;
const TOKEN='af-depop-count-20260901-91c4';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  if(String(req.query?.token||'')!==TOKEN) return res.status(404).json({error:'Not found'});
  const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:1});
  const client=await pool.connect();
  try{
    const r=await client.query(`
      SELECT b.base44_id,b.name,b.data->>'depop_username' AS username,
             count(*) FILTER (WHERE ml.platform='Depop') AS depop_total,
             count(*) FILTER (WHERE ml.platform='Depop' AND ml.status='Active') AS depop_active,
             count(*) FILTER (WHERE ml.platform='Depop' AND ml.status='Inactive') AS depop_inactive,
             count(*) FILTER (WHERE ml.platform='Depop' AND ml.sync_source='parse_depop_refresh') AS parse_refresh_rows
      FROM artflow.businesses b
      LEFT JOIN artflow.marketplace_listings ml ON ml.business_id=b.base44_id
      WHERE COALESCE(b.data->>'depop_username','')<>''
      GROUP BY b.base44_id,b.name,b.data->>'depop_username'
      ORDER BY depop_active DESC
    `);
    const key=String(process.env.PARSE_API_KEY||'').trim();
    if(String(req.query?.mode||'')==='pagination' && key){
      const username=String(r.rows?.[0]?.username||'').trim();
      const test=async(paramName)=>{
        let cursor=''; const all=[]; const pages=[]; const seen=new Set();
        for(let page=1;page<=5;page++){
          const qs=new URLSearchParams({username,limit:'100'});
          if(cursor) qs.set(paramName,cursor);
          const fr=await fetch(`https://api.parse.bot/scraper/e781fdf1-07fd-44a5-abc9-cfbbe53a5243/get_seller_listings?${qs.toString()}`,{headers:{Accept:'application/json','X-API-Key':key}});
          const text=await fr.text(); let p={}; try{p=text?JSON.parse(text):{}}catch{}
          const d=p?.data&&typeof p.data==='object'?p.data:p;
          const products=Array.isArray(d?.products)?d.products:[];
          const ids=products.map(x=>String(x?.id||x?.product_id||x?.slug||'')).filter(Boolean);
          const uniquePage=new Set(ids);
          const before=seen.size; ids.forEach(id=>seen.add(id));
          all.push(...ids);
          const next=String(d?.last_offset_id||d?.meta?.last_offset_id||'').trim();
          pages.push({page,status:fr.status,count:products.length,unique_page:uniquePage.size,new_unique:seen.size-before,end:d?.end===true||d?.meta?.end===true,next_present:Boolean(next)});
          if(!fr.ok||!next||next===cursor) break;
          cursor=next;
        }
        return {param:paramName,total_responses:all.length,unique_ids:seen.size,pages};
      };
      return res.status(200).json({rows:r.rows,tests:[await test('cursor'),await test('last_offset_id')]});
    }
    return res.status(200).json({rows:r.rows});
  }finally{client.release();await pool.end();}
}
