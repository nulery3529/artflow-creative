import { pool } from './_gmail-sales-core.mjs';

const KEY = 'afc-clean-4f91a8';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(String(req.query?.key||'')!==KEY) return res.status(401).json({error:'Unauthorized'});
  const client=await pool.connect();
  try{
    const result=await client.query(`
      WITH ranked AS (
        SELECT ctid,
               row_number() OVER (
                 PARTITION BY business_id,platform,sale_date,lower(COALESCE(product_name,'')),
                              round(COALESCE(sale_total,0)::numeric,2),COALESCE(quantity,1)
                 ORDER BY created_date NULLS LAST, base44_id
               ) AS rn
          FROM artflow.orders
         WHERE archived IS NOT TRUE
           AND sync_source='google_sheet_master'
           AND left(COALESCE(sale_date,''),4)=to_char(CURRENT_DATE,'YYYY')
      )
      DELETE FROM artflow.orders o
       USING ranked r
       WHERE o.ctid=r.ctid
         AND r.rn>1
       RETURNING o.platform,o.base44_id
    `);
    const byPlatform={};
    for(const row of result.rows) byPlatform[row.platform]=(byPlatform[row.platform]||0)+1;
    return res.status(200).json({ok:true,removed:Number(result.rowCount||0),by_platform:byPlatform});
  } finally {
    client.release();
  }
}
