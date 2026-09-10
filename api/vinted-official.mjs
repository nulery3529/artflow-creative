import pg from 'pg';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';
import {
  clean,
  encryptVintedToken,
  splitToken,
  syncImportedListings,
  vintedRequest,
} from './_vinted-pro-core.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
const normalize = (v='') => clean(v).toLowerCase();

async function session(req){ return auth.api.getSession({ headers: fromNodeHeaders(req.headers) }); }
async function profile(client,user){
  const email=normalize(user?.email);
  const r=await client.query(`SELECT * FROM artflow.legacy_users WHERE auth_user_id=$1 OR lower(email)=$2 ORDER BY CASE WHEN active_business_id IS NOT NULL THEN 0 ELSE 1 END, CASE WHEN auth_user_id=$1 THEN 0 ELSE 1 END LIMIT 1`,[user.id,email]);
  return r.rows[0]||null;
}
function businessEmails(row){
  const d=row?.data||{};
  return [row?.primary_email,d.primary_email,...(d.member_emails||[]),...(d.sales_emails||[]),...(d.expense_emails||[])].map(normalize).filter(Boolean);
}
async function businessForUser(client,p,user){
  const active=p?.active_business_id || p?.data?.active_business_id || null;
  const email=normalize(user?.email);
  const r=await client.query(`SELECT base44_id,name,primary_email,data FROM artflow.businesses ORDER BY name NULLS LAST`);
  const activeRow=r.rows.find(x=>active && x.base44_id===active)||null;
  const emailRows=r.rows.filter(x=>email && businessEmails(x).includes(email));
  const placeholder=(row)=>{
    if(!row) return false;
    const d=row.data||{};
    return businessEmails(row).length===0 && !d.spreadsheet_id && !d.spreadsheetId && /^my business$/i.test(String(row.name||'').trim());
  };
  const canonical=emailRows.find(row=>{
    const d=row.data||{};
    return Boolean(d.spreadsheet_id || d.spreadsheetId || (Array.isArray(d.tracked_marketplaces)&&d.tracked_marketplaces.length));
  }) || emailRows[0] || null;
  return placeholder(activeRow)&&canonical ? canonical : (activeRow||canonical||null);
}
function parseBody(req){
  if(req.body && typeof req.body==='object') return req.body;
  if(typeof req.body==='string'){ try{return JSON.parse(req.body)}catch{} }
  return {};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  const s=await session(req).catch(()=>null);
  if(!s?.user) return res.status(401).json({error:'Unauthorized'});
  const client=await pool.connect();
  try{
    const p=await profile(client,s.user);
    const business=await businessForUser(client,p,s.user);
    if(!business) return res.status(404).json({error:'Business workspace not found'});
    const pro=business.data?.vinted_pro||{};
    const connected=Boolean(pro.connected && pro.access_token_enc);
    if(req.method==='GET'){
      return res.status(200).json({connected,connected_at:pro.connected_at||null,mode:'vinted_pro',allowlisted_required:true});
    }

    const body=parseBody(req), action=clean(body.action);
    if(action==='connect'){
      const token=clean(body.access_token);
      splitToken(token);
      await vintedRequest(token,'GET','/api/v1/items?limit=1');
      const next={...(business.data||{}),vinted_pro:{connected:true,access_token_enc:encryptVintedToken(token),connected_at:new Date().toISOString(),updated_at:new Date().toISOString()}};
      await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`,[business.base44_id,JSON.stringify(next)]);
      return res.status(200).json({ok:true,connected:true});
    }
    if(action==='disconnect'){
      const next={...(business.data||{})};
      delete next.vinted_pro;
      await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`,[business.base44_id,JSON.stringify(next)]);
      return res.status(200).json({ok:true,connected:false});
    }
    if(action==='sync_imported'){
      // Autosync calls this for every login, so a missing connection is a
      // clean skip rather than an error.
      if(!connected) return res.status(200).json({ok:true,connected:false,saved:0,message:'Vinted Pro is not connected.'});
      const result=await syncImportedListings(client,{base44_id:business.base44_id,data:business.data});
      return res.status(200).json({ok:true,...result});
    }
    return res.status(400).json({error:'Unknown action'});
  }catch(e){
    console.error('Vinted official connection error',e?.message||e);
    const msg=clean(e?.message||'Vinted Pro connection failed')||'Vinted Pro connection failed';
    const status=/unauthor|invalid|token|signature/i.test(msg)?401:500;
    return res.status(status).json({error:msg});
  }finally{client.release();}
}