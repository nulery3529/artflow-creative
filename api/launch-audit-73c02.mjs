import { pool } from './_gmail-sales-core.mjs';

const KEY = 'afc-launch-9f4c72d8e1';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(String(req.query?.key||'')!==KEY) return res.status(401).json({error:'Unauthorized'});
  const client=await pool.connect();
  try{
    if(String(req.query?.action||'')==='clean-ebay-current-year'){
      const cleaned=await client.query(`
        DELETE FROM artflow.orders
         WHERE archived IS NOT TRUE
           AND lower(COALESCE(platform,''))='ebay'
           AND left(COALESCE(sale_date,''),4)=to_char(CURRENT_DATE,'YYYY')
         RETURNING base44_id
      `);
      return res.status(200).json({ok:true,removed:Number(cleaned.rowCount||0)});
    }

    if(String(req.query?.action||'')==='fix-poshmark-cancels'){
      const ids=['6aa45ffa0826402f6551ab6f','6a712189875d6500024b50ad','6a473f610d155f6b21af7a31'];
      const fixed=await client.query(`
        UPDATE artflow.orders
           SET archived=true,
               updated_date=now(),
               data=COALESCE(data,'{}'::jsonb)||jsonb_build_object('poshmark_canceled',true,'launch_cleanup',true)
         WHERE platform='Poshmark'
           AND order_id = ANY($1::text[])
           AND archived IS NOT TRUE
         RETURNING order_id
      `,[ids]);
      return res.status(200).json({ok:true,archived:Number(fixed.rowCount||0),order_ids:fixed.rows.map(r=>r.order_id)});
    }

    if(String(req.query?.action||'')==='clean-poshmark-repair'){
      const cleaned=await client.query(`
        DELETE FROM artflow.orders
         WHERE archived IS NOT TRUE
           AND platform='Poshmark'
           AND sync_source LIKE 'gmail_repair_%'
           AND left(COALESCE(sale_date,''),4)=to_char(CURRENT_DATE,'YYYY')
         RETURNING base44_id,order_id,sale_total
      `);
      return res.status(200).json({ok:true,removed:Number(cleaned.rowCount||0)});
    }

    if(String(req.query?.action||'')==='clean-exact-sheet-gmail-dupes'){
      const cleaned=await client.query(`
        DELETE FROM artflow.orders s
         WHERE s.archived IS NOT TRUE
           AND s.sync_source='google_sheet_master'
           AND left(COALESCE(s.sale_date,''),4)=to_char(CURRENT_DATE,'YYYY')
           AND EXISTS (
             SELECT 1 FROM artflow.orders g
              WHERE g.business_id=s.business_id
                AND g.archived IS NOT TRUE
                AND g.sync_source LIKE 'gmail%'
                AND g.platform=s.platform
                AND g.sale_date=s.sale_date
                AND lower(COALESCE(g.product_name,''))=lower(COALESCE(s.product_name,''))
                AND COALESCE(g.quantity,1)=COALESCE(s.quantity,1)
                AND abs(COALESCE(g.sale_total,0)-COALESCE(s.sale_total,0))<0.01
           )
         RETURNING s.platform,s.base44_id
      `);
      const byPlatform={};
      for(const row of cleaned.rows) byPlatform[row.platform]=(byPlatform[row.platform]||0)+1;
      return res.status(200).json({ok:true,removed:Number(cleaned.rowCount||0),by_platform:byPlatform});
    }

    if(String(req.query?.action||'')==='clean-unique-sheet-gmail-dupes'){
      const cleaned=await client.query(`
        WITH sheet_keys AS (
          SELECT business_id,platform,sale_date,round(COALESCE(sale_total,0)::numeric,2) AS sale_total,
                 COALESCE(quantity,1) AS quantity,count(*)::int AS c
            FROM artflow.orders
           WHERE archived IS NOT TRUE
             AND sync_source='google_sheet_master'
             AND left(COALESCE(sale_date,''),4)=to_char(CURRENT_DATE,'YYYY')
           GROUP BY business_id,platform,sale_date,round(COALESCE(sale_total,0)::numeric,2),COALESCE(quantity,1)
        ), gmail_keys AS (
          SELECT business_id,platform,sale_date,round(COALESCE(sale_total,0)::numeric,2) AS sale_total,
                 COALESCE(quantity,1) AS quantity,count(*)::int AS c
            FROM artflow.orders
           WHERE archived IS NOT TRUE
             AND sync_source LIKE 'gmail%'
             AND left(COALESCE(sale_date,''),4)=to_char(CURRENT_DATE,'YYYY')
           GROUP BY business_id,platform,sale_date,round(COALESCE(sale_total,0)::numeric,2),COALESCE(quantity,1)
        ), unique_keys AS (
          SELECT s.business_id,s.platform,s.sale_date,s.sale_total,s.quantity
            FROM sheet_keys s
            JOIN gmail_keys g USING (business_id,platform,sale_date,sale_total,quantity)
           WHERE s.c=1 AND g.c=1
        )
        DELETE FROM artflow.orders o
         USING unique_keys k
         WHERE o.business_id=k.business_id
           AND o.platform=k.platform
           AND o.sale_date=k.sale_date
           AND round(COALESCE(o.sale_total,0)::numeric,2)=k.sale_total
           AND COALESCE(o.quantity,1)=k.quantity
           AND o.sync_source='google_sheet_master'
         RETURNING o.platform,o.base44_id
      `);
      const byPlatform={};
      for(const row of cleaned.rows) byPlatform[row.platform]=(byPlatform[row.platform]||0)+1;
      return res.status(200).json({ok:true,removed:Number(cleaned.rowCount||0),by_platform:byPlatform});
    }

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
             count(*)::int AS copies,
             array_agg(COALESCE(sync_source,'') ORDER BY sync_source) AS sync_sources,
             array_agg(COALESCE(source_email_id,'') ORDER BY sync_source) AS source_email_ids
        FROM artflow.orders
       WHERE archived IS NOT TRUE
         AND left(COALESCE(sale_date,''),4)=to_char(CURRENT_DATE,'YYYY')
       GROUP BY business_id,platform,sale_date,lower(COALESCE(product_name,'')),round(COALESCE(sale_total,0)::numeric,2)
      HAVING count(*)>1
       ORDER BY copies DESC
       LIMIT 100
    `);
    const overlaps=await client.query(`
      SELECT s.platform,
             count(*)::int AS sheet_rows_with_gmail_match
        FROM artflow.orders s
       WHERE s.archived IS NOT TRUE
         AND s.sync_source='google_sheet_master'
         AND left(COALESCE(s.sale_date,''),4)=to_char(CURRENT_DATE,'YYYY')
         AND EXISTS (
           SELECT 1 FROM artflow.orders g
            WHERE g.business_id=s.business_id
              AND g.archived IS NOT TRUE
              AND g.platform=s.platform
              AND g.sync_source LIKE 'gmail%'
              AND g.sale_date=s.sale_date
              AND abs(COALESCE(g.sale_total,0)-COALESCE(s.sale_total,0))<0.01
              AND COALESCE(g.quantity,1)=COALESCE(s.quantity,1)
         )
       GROUP BY s.platform
       ORDER BY s.platform
    `);
    const uniqueOverlaps=await client.query(`
      WITH sheet AS (
        SELECT business_id,platform,sale_date,round(COALESCE(sale_total,0)::numeric,2) AS sale_total,COALESCE(quantity,1) AS quantity,count(*)::int AS c
          FROM artflow.orders
         WHERE archived IS NOT TRUE
           AND sync_source='google_sheet_master'
           AND left(COALESCE(sale_date,''),4)=to_char(CURRENT_DATE,'YYYY')
         GROUP BY business_id,platform,sale_date,round(COALESCE(sale_total,0)::numeric,2),COALESCE(quantity,1)
      ), gmail AS (
        SELECT business_id,platform,sale_date,round(COALESCE(sale_total,0)::numeric,2) AS sale_total,COALESCE(quantity,1) AS quantity,count(*)::int AS c
          FROM artflow.orders
         WHERE archived IS NOT TRUE
           AND sync_source LIKE 'gmail%'
           AND left(COALESCE(sale_date,''),4)=to_char(CURRENT_DATE,'YYYY')
         GROUP BY business_id,platform,sale_date,round(COALESCE(sale_total,0)::numeric,2),COALESCE(quantity,1)
      )
      SELECT s.platform,count(*)::int AS one_to_one_keys
        FROM sheet s
        JOIN gmail g USING (business_id,platform,sale_date,sale_total,quantity)
       WHERE s.c=1 AND g.c=1
       GROUP BY s.platform
       ORDER BY s.platform
    `);
    return res.status(200).json({ok:true,rows:rows.rows,dupes:dupes.rows,overlaps:overlaps.rows,unique_overlaps:uniqueOverlaps.rows});
  }finally{client.release();}
}
