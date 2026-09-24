import pg from 'pg';
import { pooledDatabaseUrl } from './_db.mjs';
import { syncConnectedEbayOrders } from './ebay-official.mjs';
import { syncConnectedEtsyOrders } from './etsy-official.mjs';

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
    etsy:{accounts:0,saved:0,checked:0,failed:0},
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

    const etsyProfiles=await client.query(`
      SELECT DISTINCT ON (COALESCE(auth_user_id,base44_id))
             base44_id,email,full_name,role,active_business_id,disabled,auth_user_id,created_date,updated_date,data
        FROM artflow.legacy_users
       WHERE COALESCE((data->'etsy_oauth'->>'connected')::boolean,false)=true
         AND COALESCE(data->'etsy_oauth'->>'refresh_token_enc','')<>''
         AND COALESCE(active_business_id,data->>'active_business_id','')<>''
       ORDER BY COALESCE(auth_user_id,base44_id),updated_date DESC NULLS LAST
    `);

    const syncedEtsy=new Set();
    for(const profile of etsyProfiles.rows){
      const businessId=clean(profile.active_business_id || profile.data?.active_business_id);
      const shopId=clean(profile.data?.etsy_oauth?.shop_id);
      const key=`${businessId}|${shopId}`;
      if(!businessId || syncedEtsy.has(key)) continue;
      syncedEtsy.add(key);

      const br=await client.query(
        `SELECT base44_id,name,primary_email,created_by_id,data FROM artflow.businesses WHERE base44_id=$1 LIMIT 1`,
        [businessId]
      );
      const business=br.rows[0];
      if(!business) continue;

      summary.etsy.accounts+=1;
      try{
        const result=await syncConnectedEtsyOrders(client,profile,business);
        summary.etsy.saved+=Number(result.saved||0);
        summary.etsy.checked+=Number(result.checked||0);
      }catch(error){
        summary.etsy.failed+=1;
        console.warn('Background Etsy order sync failed',businessId,error?.message||error);
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
