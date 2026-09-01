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
    return res.status(200).json({rows:r.rows});
  }finally{client.release();await pool.end();}
}
