import pg from 'pg';
import crypto from 'node:crypto';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
const API_BASE = 'https://pro.svc.vinted.com';
const clean = (v='') => String(v ?? '').trim();
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
function tokenKey(){
  const base=clean(process.env.MARKETPLACE_TOKEN_SECRET || process.env.BETTER_AUTH_SECRET);
  if(!base) throw new Error('Server token encryption is not configured');
  return crypto.createHash('sha256').update(`artflow-vinted-pro-token-v1:${base}`).digest();
}
function encrypt(value){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',tokenKey(),iv);
  const encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return [iv,tag,encrypted].map(b=>b.toString('base64url')).join('.');
}
function decrypt(value){
  const [ivB64,tagB64,dataB64]=String(value||'').split('.');
  if(!ivB64||!tagB64||!dataB64) throw new Error('Stored Vinted token is invalid');
  const decipher=crypto.createDecipheriv('aes-256-gcm',tokenKey(),Buffer.from(ivB64,'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64,'base64url')),decipher.final()]).toString('utf8');
}
function parseBody(req){
  if(req.body && typeof req.body==='object') return req.body;
  if(typeof req.body==='string'){ try{return JSON.parse(req.body)}catch{} }
  return {};
}
function splitToken(token){
  const raw=clean(token);
  const idx=raw.indexOf(',');
  if(idx<=0 || idx===raw.length-1) throw new Error('Vinted Pro access token must contain the access key and signing key separated by a comma.');
  const accessKey=raw.slice(0,idx).trim();
  const signingKey=raw.slice(idx+1).trim();
  if(!accessKey || !signingKey) throw new Error('Vinted Pro access token is incomplete.');
  return {accessKey,signingKey};
}
async function vintedRequest(token,method,path,body=''){
  const {accessKey,signingKey}=splitToken(token);
  const timestamp=Math.floor(Date.now()/1000).toString();
  const bodyText=body ? (typeof body==='string' ? body : JSON.stringify(body)) : '';
  const payload=[timestamp,method.toUpperCase(),path,accessKey,bodyText].join('.');
  const signature=crypto.createHmac('sha256',signingKey).update(payload).digest('hex');
  const headers={
    'Accept':'application/json',
    'X-Vpi-Access-Key':accessKey,
    'X-Vpi-Hmac-Sha256':`t=${timestamp},v1=${signature}`,
  };
  const options={method:method.toUpperCase(),headers};
  if(bodyText){ headers['Content-Type']='application/json'; options.body=bodyText; }
  const r=await fetch(`${API_BASE}${path}`,options);
  const text=await r.text();
  let data={}; try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
  if(!r.ok) throw new Error(clean(data?.error || data?.message || data?.detail || text || `Vinted Pro API ${r.status}`));
  return data;
}
async function ensureListingTable(client){
  await client.query(`CREATE TABLE IF NOT EXISTS artflow.marketplace_listings (
    id text PRIMARY KEY,business_id text NOT NULL,platform text NOT NULL,listing_id text,title text NOT NULL,price numeric DEFAULT 0,currency text DEFAULT 'USD',image_url text,listing_url text NOT NULL,status text DEFAULT 'Active',last_seen_at timestamptz DEFAULT now(),sync_source text,data jsonb DEFAULT '{}'::jsonb
  )`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_business_platform_url_idx ON artflow.marketplace_listings (business_id, platform, listing_url)`);
}
async function upsertImported(client,businessId,items){
  const rows=[];
  for(const item of items){
    const url=clean(item?.url);
    const title=clean(item?.title).slice(0,300);
    if(!url || !title) continue;
    const status=clean(item?.status).toUpperCase();
    if(status && status!=='ACTIVE') continue;
    rows.push({
      id:crypto.createHash('sha256').update(`${businessId}|Vinted|${url}`).digest('hex'),
      listing_id:clean(item?.id),
      title,
      listing_url:url,
      data:{source:'vinted_pro_imported',status:item?.status||null,description:item?.description||null},
    });
  }
  if(!rows.length) return [];
  await client.query(`
    WITH incoming AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id text,listing_id text,title text,listing_url text,data jsonb)
    )
    INSERT INTO artflow.marketplace_listings (id,business_id,platform,listing_id,title,price,currency,image_url,listing_url,status,last_seen_at,sync_source,data)
    SELECT id,$2,'Vinted',listing_id,title,0,'USD',NULL,listing_url,'Active',now(),'vinted_pro_imported',data FROM incoming
    ON CONFLICT (business_id,platform,listing_url) DO UPDATE SET
      listing_id=EXCLUDED.listing_id,
      title=EXCLUDED.title,
      status=CASE
        WHEN artflow.marketplace_listings.status='Sold' THEN 'Sold'
        ELSE 'Active'
      END,
      last_seen_at=now(),
      sync_source='vinted_pro_imported',
      data=COALESCE(artflow.marketplace_listings.data,'{}'::jsonb) || EXCLUDED.data
  `,[JSON.stringify(rows),businessId]);
  return rows.map(r=>r.listing_url);
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
      const next={...(business.data||{}),vinted_pro:{connected:true,access_token_enc:encrypt(token),connected_at:new Date().toISOString(),updated_at:new Date().toISOString()}};
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
      if(!connected) return res.status(400).json({error:'Connect a Vinted Pro access token first.'});
      const token=decrypt(pro.access_token_enc);
      await ensureListingTable(client);
      const all=[];
      let after='';
      for(let page=0; page<5 && all.length<500; page+=1){
        const q=new URLSearchParams({limit:'100'});
        if(after) q.set('after_item_id',after);
        const data=await vintedRequest(token,'GET',`/api/v1/items/imported?${q.toString()}`);
        const batch=Array.isArray(data?.items)?data.items:[];
        all.push(...batch);
        if(batch.length<100) break;
        after=clean(batch.at(-1)?.id);
        if(!after) break;
      }
      const urls=await upsertImported(client,business.base44_id,all.slice(0,500));
      return res.status(200).json({ok:true,saved:urls.length,total_returned:all.length,message:`${urls.length} active imported Vinted listing${urls.length===1?'':'s'} synced from Vinted Pro.`});
    }
    return res.status(400).json({error:'Unknown action'});
  }catch(e){
    console.error('Vinted official connection error',e?.message||e);
    const msg=clean(e?.message||'Vinted Pro connection failed')||'Vinted Pro connection failed';
    const status=/unauthor|invalid|token|signature/i.test(msg)?401:500;
    return res.status(status).json({error:msg});
  }finally{client.release();}
}
