import pg from 'pg';
import { pooledDatabaseUrl } from './_db.mjs';
import { syncYahooExpenses } from './yahoo-mail.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: pooledDatabaseUrl(), ssl:{rejectUnauthorized:false}, max:1 });

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const client=await pool.connect();
  const summary={accounts:0,checked:0,imported:0,skipped:0,remaining:0,failed:0};
  try{
    const businesses=await client.query(`
      SELECT base44_id,name,primary_email,created_by_id,data
      FROM artflow.businesses
      WHERE COALESCE((data->'yahoo_mail'->>'connected')::boolean,false)=true
        AND COALESCE(data->'yahoo_mail'->>'app_password_enc','')<>''
      ORDER BY base44_id
    `);
    for(const business of businesses.rows){
      summary.accounts+=1;
      try{
        const result=await syncYahooExpenses(client,business);
        summary.checked+=Number(result.checked||0);
        summary.imported+=Number(result.imported||0);
        summary.skipped+=Number(result.skipped||0);
        summary.remaining+=Number(result.remaining||0);
      }catch(error){
        summary.failed+=1;
      }
    }
    const reasons = await client.query(`
      SELECT COALESCE(data->>'details','') AS reason, COUNT(*)::int AS count
      FROM artflow.email_import_messages
      WHERE import_type='expense'
        AND platform='Yahoo'
      GROUP BY COALESCE(data->>'details','')
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `);
    return res.status(200).json({ok:true,...summary,reasons:reasons.rows});
  } finally { client.release(); }
}
