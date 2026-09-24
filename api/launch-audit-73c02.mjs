import { pool } from './_gmail-sales-core.mjs';

const KEY = 'afc-launch-9f4c72d8e1';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(String(req.query?.key||'')!==KEY) return res.status(401).json({error:'Unauthorized'});
  const client=await pool.connect();
  try{
    const rows=await client.query(`
      SELECT business_id,
             platform,
             count(*)::int AS orders,
             count(DISTINCT NULLIF(order_id,''))::int AS order_ids,
             count(DISTINCT NULLIF(split_part(source_email_id, ':', 1),''))::int AS source_emails,
             round(COALESCE(sum(sale_total),0)::numeric,2) AS gross
        FROM artflow.orders
       WHERE archived IS NOT TRUE
         AND left(COALESCE(sale_date,''),4)=to_char(CURRENT_DATE,'YYYY')
       GROUP BY business_id,platform
       ORDER BY business_id,platform
    `);
    return res.status(200).json({ok:true,rows:rows.rows});
  }finally{client.release();}
}
