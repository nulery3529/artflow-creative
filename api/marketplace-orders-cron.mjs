import pg from 'pg';
import { pooledDatabaseUrl } from './_db.mjs';
import { syncConnectedEbayOrders } from './ebay-official.mjs';

const { Pool } = pg;
const PRIMARY_VERCEL_PROJECT_ID = 'prj_DROTZuTXWIqP0aCXDtJ0xMkWAitz';
const pool = new Pool({
  connectionString: pooledDatabaseUrl(),
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const clean = (value = '') => String(value ?? '').trim();

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const vercelSchedule = String(req.headers['x-vercel-cron-schedule'] || '');
  return secret ? provided === secret : vercelSchedule === "10 * * * *";
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req)) return res.status(401).json({error:'Unauthorized'});
  if (process.env.VERCEL_PROJECT_ID && process.env.VERCEL_PROJECT_ID !== PRIMARY_VERCEL_PROJECT_ID) {
    return res.status(200).json({ ok: true, skipped: 'secondary_vercel_project' });
  }

  const client=await pool.connect();
  const summary={
    ebay:{accounts:0,saved:0,checked:0,failed:0},
  };

  try{
    const ebayBusinesses=await client.query(`
      SELECT base44_id,name,primary_email,created_by_id,data
        FROM artflow.businesses
       WHERE COALESCE((data->'ebay_oauth'->>'connected')::boolean,false)=true
         AND COALESCE(data->'ebay_oauth'->>'refresh_token_enc','')<>''
    `);
    for(const business of ebayBusinesses.rows){
      summary.ebay.accounts+=1;
      try{
        const result=await syncConnectedEbayOrders(client,business);
        summary.ebay.saved+=Number(result.saved||0);
        summary.ebay.checked+=Number(result.checked||0);
      }catch(error){
        summary.ebay.failed+=1;
        console.warn('Background eBay order sync failed',business.base44_id,error?.message||error);
      }
    }



    return res.status(200).json({ok:true,...summary});
  }catch(error){
    console.error('Marketplace orders cron failed',error?.message||error);
    return res.status(500).json({error:error?.message||'Marketplace order sync failed',...summary});
  }finally{
    client.release();
  }
}
