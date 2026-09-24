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
             COALESCE(sync_source,'') AS sync_source,
             count(*)::int AS orders,
             count(DISTINCT NULLIF(order_id,''))::int AS order_ids,
             count(DISTINCT NULLIF(split_part(source_email_id, ':', 1),''))::int AS source_emails,
             round(COALESCE(sum(sale_total),0)::numeric,2) AS gross
        FROM artflow.orders
       WHERE archived IS NOT TRUE
         AND left(COALESCE(sale_date,''),4)=to_char(CURRENT_DATE,'YYYY')
       GROUP BY business_id,platform,COALESCE(sync_source,'')
       ORDER BY business_id,platform,orders DESC
    `);
    const dupes=await client.query(`
      SELECT business_id,platform,sale_date,lower(COALESCE(product_name,'')) AS product_name,
             round(COALESCE(sale_total,0)::numeric,2) AS sale_total,
             count(*)::int AS copies
        FROM artflow.orders
       WHERE archived IS NOT TRUE
         AND left(COALESCE(sale_date,''),4)=to_char(CURRENT_DATE,'YYYY')
       GROUP BY business_id,platform,sale_date,lower(COALESCE(product_name,'')),round(COALESCE(sale_total,0)::numeric,2)
      HAVING count(*)>1
       ORDER BY copies DESC
       LIMIT 100
    `);
    return res.status(200).json({ok:true,rows:rows.rows,dupes:dupes.rows});
  }finally{client.release();}
}
