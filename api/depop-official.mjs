import pg from 'pg';
import crypto from 'node:crypto';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
const clean = (v='') => String(v ?? '').trim();
const normalize = (v='') => clean(v).toLowerCase();
const REDIRECT_URI = 'https://artflowcreative.com/api/depop-official?op=callback';
const AUTH_URL = 'https://www.depop.com/settings/oauth/apps/';
const TOKEN_URL = 'https://partnerapi.depop.com/api/v1/oauth2/access-token/';
const API_BASE = 'https://partnerapi.depop.com/api/v1';

const depopClientId = () => clean(process.env.DEPOP_CLIENT_ID || process.env.DEPOP_OAUTH_CLIENT_ID);
const depopClientSecret = () => clean(process.env.DEPOP_CLIENT_SECRET || process.env.DEPOP_OAUTH_CLIENT_SECRET);

async function session(req){ return auth.api.getSession({ headers: fromNodeHeaders(req.headers) }); }
async function profile(client,user){
  const email=normalize(user?.email);
  const r=await client.query(`SELECT * FROM artflow.legacy_users WHERE auth_user_id=$1 OR lower(email)=$2 ORDER BY CASE WHEN auth_user_id=$1 THEN 0 ELSE 1 END LIMIT 1`,[user.id,email]);
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
async function ensureTables(client){
  await client.query(`CREATE TABLE IF NOT EXISTS artflow.marketplace_oauth_states (
    state text PRIMARY KEY,
    business_id text NOT NULL,
    platform text NOT NULL,
    code_verifier text NOT NULL,
    created_at timestamptz DEFAULT now(),
    expires_at timestamptz NOT NULL
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS artflow.marketplace_listings (
    id text PRIMARY KEY,business_id text NOT NULL,platform text NOT NULL,listing_id text,title text NOT NULL,price numeric DEFAULT 0,currency text DEFAULT 'USD',image_url text,listing_url text NOT NULL,status text DEFAULT 'Active',last_seen_at timestamptz DEFAULT now(),sync_source text,data jsonb DEFAULT '{}'::jsonb
  )`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_business_platform_url_idx ON artflow.marketplace_listings (business_id, platform, listing_url)`);
}
function tokenKey(){
  const base=clean(process.env.MARKETPLACE_TOKEN_SECRET || process.env.BETTER_AUTH_SECRET);
  if(!base) throw new Error('Server token encryption is not configured');
  return crypto.createHash('sha256').update(`artflow-marketplace-token-v1:${base}`).digest();
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
  if(!ivB64||!tagB64||!dataB64) throw new Error('Stored marketplace token is invalid');
  const decipher=crypto.createDecipheriv('aes-256-gcm',tokenKey(),Buffer.from(ivB64,'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64,'base64url')),decipher.final()]).toString('utf8');
}
function parseBody(req){
  if(req.body && typeof req.body==='object') return req.body;
  if(typeof req.body==='string'){ try{return JSON.parse(req.body)}catch{} }
  return {};
}
function pkce(){
  const verifier=crypto.randomBytes(48).toString('base64url');
  const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
async function exchangeToken(params){
  const body=new URLSearchParams(params);
  const r=await fetch(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body});
  const text=await r.text();
  let data={}; try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
  if(!r.ok) throw new Error(clean(data?.error_description || data?.error || data?.detail || text || `Depop token request failed (${r.status})`));
  return data;
}
async function saveOAuth(client,business,data){
  const next={...(business.data||{}),depop_oauth:{
    connected:true,
    username:data.username || business.data?.depop_oauth?.username || '',
    access_token_enc:data.access_token ? encrypt(data.access_token) : business.data?.depop_oauth?.access_token_enc,
    refresh_token_enc:data.refresh_token ? encrypt(data.refresh_token) : business.data?.depop_oauth?.refresh_token_enc,
    expires_at:data.expires_at || business.data?.depop_oauth?.expires_at || null,
    connected_at:business.data?.depop_oauth?.connected_at || new Date().toISOString(),
    updated_at:new Date().toISOString(),
  }};
  await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`,[business.base44_id,JSON.stringify(next)]);
  business.data=next;
}
async function validAccessToken(client,business){
  const oauth=business?.data?.depop_oauth||{};
  if(!oauth.refresh_token_enc) throw new Error('Depop is not connected');
  const expiresAt=oauth.expires_at ? new Date(oauth.expires_at).getTime() : 0;
  if(oauth.access_token_enc && expiresAt>Date.now()+60_000){
    return decrypt(oauth.access_token_enc);
  }
  const refreshed=await exchangeToken({
    grant_type:'refresh_token',
    refresh_token:decrypt(oauth.refresh_token_enc),
    client_id:depopClientId(),
    client_secret:depopClientSecret(),
  });
  const expiresAtIso=new Date(Date.now()+(Number(refreshed.expires_in)||3600)*1000).toISOString();
  await saveOAuth(client,business,{access_token:refreshed.access_token,refresh_token:refreshed.refresh_token||decrypt(oauth.refresh_token_enc),expires_at:expiresAtIso});
  return refreshed.access_token;
}
async function depopGet(path,accessToken){
  const r=await fetch(`${API_BASE}${path}`,{headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json'}});
  const text=await r.text();
  let data={}; try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
  if(!r.ok) throw new Error(clean(data?.errors?.[0]?.message || data?.error_description || data?.error || data?.detail || text || `Depop API ${r.status}`));
  return data;
}
function titleFor(product){
  const first=clean(product?.description).split(/\r?\n/).map(clean).find(Boolean);
  if(first) return first.slice(0,300);
  const slug=clean(product?.slug).replace(/-\d+$/,'').replace(/-/g,' ');
  return slug ? slug.slice(0,300) : `Depop listing ${product?.product_id||''}`.trim();
}
async function upsertProducts(client,businessId,products){
  const rows=[];
  for(const p of products){
    const slug=clean(p?.slug);
    if(!slug) continue;
    const url=`https://www.depop.com/products/${slug}`;
    rows.push({
      id:crypto.createHash('sha256').update(`${businessId}|Depop|${url}`).digest('hex'),
      listing_id:clean(p?.product_id),
      title:titleFor(p),
      price:Number(p?.current_price ?? p?.discount_price ?? p?.price_amount ?? 0)||0,
      currency:clean(p?.price_currency||'USD')||'USD',
      image_url:clean(p?.pictures?.[0]?.url)||null,
      listing_url:url,
      data:{source:'depop_official_oauth',sku:p?.sku||null,brand:p?.brand||null,status:p?.status||null},
    });
  }
  if(!rows.length) return [];
  await client.query(`
    WITH incoming AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,listing_id text,title text,price numeric,currency text,image_url text,listing_url text,data jsonb
      )
    )
    INSERT INTO artflow.marketplace_listings (id,business_id,platform,listing_id,title,price,currency,image_url,listing_url,status,last_seen_at,sync_source,data)
    SELECT id,$2,'Depop',listing_id,title,price,currency,image_url,listing_url,'Active',now(),'depop_official_oauth',data FROM incoming
    ON CONFLICT (business_id,platform,listing_url) DO UPDATE SET
      listing_id=EXCLUDED.listing_id,title=EXCLUDED.title,price=EXCLUDED.price,currency=EXCLUDED.currency,
      image_url=COALESCE(NULLIF(EXCLUDED.image_url,''),artflow.marketplace_listings.image_url),
      status=CASE
        WHEN artflow.marketplace_listings.status='Sold' THEN 'Sold'
        ELSE 'Active'
      END,
      last_seen_at=now(),sync_source='depop_official_oauth',data=EXCLUDED.data
  `,[JSON.stringify(rows),businessId]);
  return rows.map(r=>r.listing_url);
}
function redirect(res,kind,message=''){
  const q=new URLSearchParams({depop:kind});
  if(message) q.set('message',message.slice(0,180));
  res.statusCode=302;
  res.setHeader('Location',`/Account?${q.toString()}`);
  return res.end();
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const client=await pool.connect();
  try{
    await ensureTables(client);
    const op=clean(req.query?.op);

    if(req.method==='GET' && op==='health'){
      return res.status(200).json({configured:Boolean(depopClientId()&&depopClientSecret())});
    }

    if(req.method==='GET' && op==='callback'){
      const state=clean(req.query?.state), code=clean(req.query?.code), error=clean(req.query?.error);
      if(error) return redirect(res,'error',clean(req.query?.error_description||error));
      if(!state||!code) return redirect(res,'error','Missing Depop authorization response');
      const s=await client.query(`DELETE FROM artflow.marketplace_oauth_states WHERE state=$1 AND platform='Depop' AND expires_at>now() RETURNING *`,[state]);
      const saved=s.rows[0];
      if(!saved) return redirect(res,'error','Depop connection expired. Try Connect again.');
      if(!depopClientId()||!depopClientSecret()) return redirect(res,'error','Depop OAuth client is not configured in Art Flow.');
      const token=await exchangeToken({
        grant_type:'authorization_code',code,client_id:depopClientId(),client_secret:depopClientSecret(),redirect_uri:REDIRECT_URI,code_verifier:saved.code_verifier,
      });
      const br=await client.query(`SELECT base44_id,name,primary_email,data FROM artflow.businesses WHERE base44_id=$1 LIMIT 1`,[saved.business_id]);
      const business=br.rows[0];
      if(!business) return redirect(res,'error','Art Flow business workspace was not found.');
      const expiresAtIso=new Date(Date.now()+(Number(token.expires_in)||3600)*1000).toISOString();
      let username='';
      try{ const shop=await depopGet('/shop/',token.access_token); username=clean(shop?.username); }catch{}
      await saveOAuth(client,business,{access_token:token.access_token,refresh_token:token.refresh_token,expires_at:expiresAtIso,username});
      return redirect(res,'connected');
    }

    const s=await session(req).catch(()=>null);
    if(!s?.user) return res.status(401).json({error:'Unauthorized'});
    const p=await profile(client,s.user);
    const business=await businessForUser(client,p,s.user);
    if(!business) return res.status(404).json({error:'Business workspace not found'});
    const configured=Boolean(depopClientId()&&depopClientSecret());
    const oauth=business.data?.depop_oauth||{};

    if(req.method==='GET'){
      return res.status(200).json({configured,connected:Boolean(oauth.connected&&oauth.refresh_token_enc),username:clean(oauth.username),redirect_uri:REDIRECT_URI});
    }
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
    const body=parseBody(req), action=clean(body.action);

    if(action==='start'){
      if(!configured) return res.status(503).json({error:'Depop OAuth is not enabled yet. Art Flow needs a Depop Partner OAuth client ID and secret first.',needs_partner_access:true});
      const {verifier,challenge}=pkce();
      const state=crypto.randomBytes(32).toString('base64url');
      await client.query(`DELETE FROM artflow.marketplace_oauth_states WHERE expires_at<=now()`);
      await client.query(`INSERT INTO artflow.marketplace_oauth_states (state,business_id,platform,code_verifier,expires_at) VALUES ($1,$2,'Depop',$3,now()+interval '15 minutes')`,[state,business.base44_id,verifier]);
      const q=new URLSearchParams({response_type:'code',client_id:depopClientId(),redirect_uri:REDIRECT_URI,state,scope:'products_read+shop_read',code_challenge:challenge,code_challenge_method:'S256'});
      return res.status(200).json({authorization_url:`${AUTH_URL}?${q.toString()}`});
    }

    if(action==='disconnect'){
      const next={...(business.data||{})};
      delete next.depop_oauth;
      await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`,[business.base44_id,JSON.stringify(next)]);
      return res.status(200).json({ok:true});
    }

    if(action==='sync'){
      if(!configured) return res.status(503).json({error:'Depop OAuth client is not configured.'});
      const token=await validAccessToken(client,business);
      let cursor='',hasMore=true,pages=0;
      const products=[];
      while(hasMore && pages<5 && products.length<500){
        const q=new URLSearchParams({limit:'100',state:'selling',sort_by:'id_desc'});
        if(cursor) q.set('cursor',cursor);
        const data=await depopGet(`/products/?${q.toString()}`,token);
        const batch=Array.isArray(data?.data)?data.data:[];
        products.push(...batch);
        pages+=1;
        cursor=clean(data?.meta?.cursor);
        hasMore=data?.meta?.has_more===true && Boolean(cursor);
      }
      const urls=await upsertProducts(client,business.base44_id,products.slice(0,500));
      let deactivated=0;
      if(!hasMore){
        const r=urls.length
          ? await client.query(`UPDATE artflow.marketplace_listings SET status='Inactive',last_seen_at=now(),sync_source='depop_official_snapshot' WHERE business_id=$1 AND platform='Depop' AND status='Active' AND NOT (listing_url=ANY($2::text[]))`,[business.base44_id,urls])
          : await client.query(`UPDATE artflow.marketplace_listings SET status='Inactive',last_seen_at=now(),sync_source='depop_official_snapshot' WHERE business_id=$1 AND platform='Depop' AND status='Active'`,[business.base44_id]);
        deactivated=Number(r.rowCount||0);
      }
      return res.status(200).json({ok:true,saved:urls.length,deactivated,partial:hasMore,pages,message:`${urls.length} active Depop listing${urls.length===1?'':'s'} synced from Depop${deactivated?` · ${deactivated} no longer active`:''}${hasMore?' · first 500 loaded':''}.`});
    }

    return res.status(400).json({error:'Unknown action'});
  }catch(e){
    console.error('Depop official connection error',e?.message||e);
    return res.status(500).json({error:clean(e?.message||'Depop connection failed')||'Depop connection failed'});
  }finally{client.release();}
}
