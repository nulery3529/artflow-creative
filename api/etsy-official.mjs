import pg from 'pg';
import { pooledDatabaseUrl } from './_db.mjs';
import crypto from 'node:crypto';
import {
  clean, session, profile, businessForUser, encrypt, decrypt, parseBody,
  ensureOAuthStateTable, insertOrders, sizeFromTitle,
} from './_official-sync-shared.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: pooledDatabaseUrl(), ssl: { rejectUnauthorized: false }, max: 1 });

const REDIRECT_URI = 'https://artflowcreative.com/api/etsy-official?op=callback';
const AUTH_URL = 'https://www.etsy.com/oauth/connect';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const API_BASE = 'https://openapi.etsy.com/v3/application';
const SCOPES = 'transactions_r shops_r listings_r';

const etsyKey = () => clean(process.env.ETSY_API_KEY || process.env.ETSY_KEYSTRING);
const etsySecret = () => clean(process.env.ETSY_SHARED_SECRET || process.env.ETSY_CLIENT_SECRET);
const etsyApiHeader = () => `${etsyKey()}:${etsySecret()}`;

async function etsyToken(params){
  const r=await fetch(TOKEN_URL,{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
    body:new URLSearchParams(params),
  });
  const text=await r.text();
  let data={}; try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
  if(!r.ok) throw new Error(clean(data?.error||data?.error_description||text||`Etsy token request failed (${r.status})`));
  return data;
}

async function etsyGet(path,accessToken){
  const r=await fetch(`${API_BASE}${path}`,{
    headers:{Authorization:`Bearer ${accessToken}`,'x-api-key':etsyApiHeader(),Accept:'application/json'},
  });
  const text=await r.text();
  let data={}; try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
  if(!r.ok) throw new Error(clean(data?.error||data?.error_description||text||`Etsy API ${r.status}`));
  return data;
}

async function saveOAuth(client,business,patch){
  const oauth={...(business.data?.etsy_oauth||{}),...patch,updated_at:new Date().toISOString()};
  const next={...(business.data||{}),etsy_oauth:oauth};
  await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`,[business.base44_id,JSON.stringify(next)]);
  business.data=next;
}

async function validAccessToken(client,business){
  const oauth=business.data?.etsy_oauth||{};
  if(!oauth.refresh_token_enc) throw new Error('Etsy is not connected');
  const expiresAt=oauth.expires_at?new Date(oauth.expires_at).getTime():0;
  if(oauth.access_token_enc && expiresAt>Date.now()+60_000) return decrypt(oauth.access_token_enc);
  const refreshed=await etsyToken({
    grant_type:'refresh_token',
    client_id:etsyKey(),
    refresh_token:decrypt(oauth.refresh_token_enc),
  });
  const expiresAtIso=new Date(Date.now()+(Number(refreshed.expires_in)||3600)*1000).toISOString();
  await saveOAuth(client,business,{
    access_token_enc:refreshed.access_token?encrypt(refreshed.access_token):oauth.access_token_enc,
    refresh_token_enc:refreshed.refresh_token?encrypt(refreshed.refresh_token):oauth.refresh_token_enc,
    expires_at:expiresAtIso,
  });
  return refreshed.access_token;
}

function redirect(res,kind,message=''){
  const q=new URLSearchParams({etsy:kind});
  if(message) q.set('message',message.slice(0,180));
  res.statusCode=302;
  res.setHeader('Location',`/gallery?${q.toString()}`);
  return res.end();
}

function moneyValue(value){
  if(value && typeof value==='object'){
    const amount=Number(value.amount||0), divisor=Number(value.divisor||100)||100;
    return Number((amount/divisor).toFixed(2));
  }
  const n=Number(value||0);
  return Number.isFinite(n)?n:0;
}

async function ensureListingsTable(client){
  await client.query(`CREATE TABLE IF NOT EXISTS artflow.marketplace_listings (
    id text PRIMARY KEY,
    business_id text NOT NULL,
    platform text NOT NULL,
    listing_id text,
    title text NOT NULL,
    price numeric DEFAULT 0,
    currency text DEFAULT 'USD',
    image_url text,
    listing_url text NOT NULL,
    status text DEFAULT 'Active',
    last_seen_at timestamptz DEFAULT now(),
    sync_source text,
    data jsonb DEFAULT '{}'::jsonb
  )`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_business_platform_url_idx ON artflow.marketplace_listings (business_id, platform, listing_url)`);
}

async function syncEtsyListings(client,business,accessToken){
  await ensureListingsTable(client);
  const shopId=business.data?.etsy_oauth?.shop_id;
  if(!shopId) throw new Error('Etsy shop link is missing. Disconnect and connect Etsy again.');

  const urls=[];
  let saved=0, offset=0, pages=0, more=false;
  while(pages<5){
    const data=await etsyGet(`/shops/${shopId}/listings?state=active&limit=100&offset=${offset}&includes=Images`,accessToken);
    const results=Array.isArray(data?.results)?data.results:[];
    for(const listing of results){
      const listingId=String(listing?.listing_id||'');
      if(!listingId) continue;
      const listingUrl=clean(listing?.url)||`https://www.etsy.com/listing/${listingId}`;
      const images=Array.isArray(listing?.images)?listing.images:[];
      const firstImage=[...images].sort((a,b)=>Number(a?.rank||0)-Number(b?.rank||0))[0]||{};
      const imageUrl=clean(firstImage?.url_570xN||firstImage?.url_fullxfull||firstImage?.url_170x135);
      const title=clean(listing?.title)||`Etsy listing ${listingId}`;
      const price=moneyValue(listing?.price);
      const currency=clean(listing?.price?.currency_code||'USD').toUpperCase()||'USD';
      const quantity=Math.max(0,Number(listing?.quantity)||0);
      const id=crypto.createHash('sha256').update(`${business.base44_id}|Etsy|${listingUrl}`).digest('hex');
      await client.query(
        `INSERT INTO artflow.marketplace_listings (id,business_id,platform,listing_id,title,price,currency,image_url,listing_url,status,last_seen_at,sync_source,data)
         VALUES ($1,$2,'Etsy',$3,$4,$5,$6,$7,$8,'Active',now(),'etsy_official_oauth',jsonb_build_object('quantity',$9,'etsy_official',true))
         ON CONFLICT (business_id,platform,listing_url) DO UPDATE SET
           listing_id=EXCLUDED.listing_id,
           title=EXCLUDED.title,
           price=EXCLUDED.price,
           currency=EXCLUDED.currency,
           image_url=COALESCE(NULLIF(EXCLUDED.image_url,''),artflow.marketplace_listings.image_url),
           status='Active',last_seen_at=now(),sync_source='etsy_official_oauth',
           data=COALESCE(artflow.marketplace_listings.data,'{}'::jsonb) || EXCLUDED.data`,
        [id,business.base44_id,listingId,title,price,currency,imageUrl||null,listingUrl,quantity]
      );
      urls.push(listingUrl);
      saved+=1;
    }
    pages+=1;
    offset+=100;
    const count=Number(data?.count||0);
    if(results.length<100 || (count && offset>=count)) break;
    if(pages===5) more=true;
  }

  if(!more){
    if(urls.length){
      await client.query(`UPDATE artflow.marketplace_listings SET status='Inactive',last_seen_at=now(),sync_source='etsy_official_snapshot' WHERE business_id=$1 AND platform='Etsy' AND status='Active' AND NOT (listing_url=ANY($2::text[]))`,[business.base44_id,urls]);
    }else{
      await client.query(`UPDATE artflow.marketplace_listings SET status='Inactive',last_seen_at=now(),sync_source='etsy_official_snapshot' WHERE business_id=$1 AND platform='Etsy' AND status='Active'`,[business.base44_id]);
    }
  }
  return {saved,more};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const client=await pool.connect();
  try{
    await ensureOAuthStateTable(client);
    const op=clean(req.query?.op);

    if(req.method==='GET' && op==='callback'){
      const state=clean(req.query?.state), code=clean(req.query?.code), error=clean(req.query?.error);
      if(error) return redirect(res,'error',clean(req.query?.error_description||error));
      if(!state||!code) return redirect(res,'error','Missing Etsy authorization response');
      const s=await client.query(`DELETE FROM artflow.marketplace_oauth_states WHERE state=$1 AND platform='Etsy' AND expires_at>now() RETURNING *`,[state]);
      const saved=s.rows[0];
      if(!saved) return redirect(res,'error','Etsy connection expired. Try Connect again.');
      if(!etsyKey()||!etsySecret()) return redirect(res,'error','Etsy credentials are not configured in Art Flow.');
      const token=await etsyToken({grant_type:'authorization_code',client_id:etsyKey(),redirect_uri:REDIRECT_URI,code});
      const br=await client.query(`SELECT base44_id,name,primary_email,data FROM artflow.businesses WHERE base44_id=$1 LIMIT 1`,[saved.business_id]);
      const business=br.rows[0];
      if(!business) return redirect(res,'error','Art Flow business workspace was not found.');
      const expiresAtIso=new Date(Date.now()+(Number(token.expires_in)||3600)*1000).toISOString();
      let shopId=null, shopName='';
      try{
        const me=await etsyGet('/users/me',token.access_token);
        shopId=me?.shop_id||null;
        if(shopId){
          const shop=await etsyGet(`/shops/${shopId}`,token.access_token);
          shopName=clean(shop?.shop_name);
        }
      }catch{}
      await saveOAuth(client,business,{
        connected:true,
        access_token_enc:encrypt(token.access_token),
        refresh_token_enc:token.refresh_token?encrypt(token.refresh_token):business.data?.etsy_oauth?.refresh_token_enc,
        expires_at:expiresAtIso,
        shop_id:shopId,
        shop_name:shopName,
        connected_at:business.data?.etsy_oauth?.connected_at||new Date().toISOString(),
      });
      return redirect(res,'connected');
    }

    const s=await session(req).catch(()=>null);
    if(!s?.user) return res.status(401).json({error:'Unauthorized'});
    const p=await profile(client,s.user);
    const business=await businessForUser(client,p,s.user);
    if(!business) return res.status(404).json({error:'Business workspace not found'});
    const configured=Boolean(etsyKey()&&etsySecret());
    const oauth=business.data?.etsy_oauth||{};

    if(req.method==='GET'){
      return res.status(200).json({
        configured,
        connected:Boolean(oauth.connected&&oauth.refresh_token_enc),
        shop_name:clean(oauth.shop_name),
        redirect_uri:REDIRECT_URI,
      });
    }
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
    const body=parseBody(req), action=clean(body.action);

    if(action==='start'){
      if(!configured) return res.status(503).json({error:'Etsy credentials are not configured yet. Add ETSY_API_KEY and ETSY_SHARED_SECRET to the server environment.'});
      const state=crypto.randomBytes(32).toString('base64url');
      await client.query(`DELETE FROM artflow.marketplace_oauth_states WHERE expires_at<=now()`);
      await client.query(`INSERT INTO artflow.marketplace_oauth_states (state,business_id,platform,code_verifier,expires_at) VALUES ($1,$2,'Etsy','',now()+interval '15 minutes')`,[state,business.base44_id]);
      const q=[
        'response_type=code',
        `client_id=${encodeURIComponent(etsyKey())}`,
        `redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
        `state=${encodeURIComponent(state)}`,
        `scope=${encodeURIComponent(SCOPES)}`,
      ].join('&');
      return res.status(200).json({authorization_url:`${AUTH_URL}?${q}`});
    }

    if(action==='disconnect'){
      const next={...(business.data||{})};
      delete next.etsy_oauth;
      await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`,[business.base44_id,JSON.stringify(next)]);
      return res.status(200).json({ok:true});
    }

    if(action==='sync'){
      if(!configured) return res.status(503).json({error:'Etsy credentials are not configured.'});
      const token=await validAccessToken(client,business);
      const shopId=business.data?.etsy_oauth?.shop_id;
      if(!shopId) return res.status(400).json({error:'Etsy shop link is missing. Disconnect and connect Etsy again.'});
      const rows=[];
      let offset=0,pages=0,more=false;
      while(pages<3){
        const data=await etsyGet(`/shops/${shopId}/receipts?limit=100&offset=${offset}`,token);
        const results=Array.isArray(data?.results)?data.results:[];
        for(const receipt of results){
          if(receipt?.was_paid===false) continue;
          const saleDate=Number(receipt?.creation_tsz)*1000 || new Date().toISOString();
          const fallbackTitle=`Etsy order ${clean(receipt?.receipt_id)}`;
          const transactions=Array.isArray(receipt?.transactions)&&receipt.transactions.length
            ? receipt.transactions
            : [{title:fallbackTitle,transaction_id:receipt?.receipt_id,quantity:1,price:receipt?.grandtotal}];
          for(const t of transactions){
            const qty=Math.max(1,Number(t?.quantity)||1);
            const unitPrice=Number(Number(t?.price||0)/100);
            const total=Number((unitPrice*qty).toFixed(2));
            if(total<=0) continue;
            const title=clean(t?.title)||fallbackTitle;
            rows.push({
              platform:'Etsy',
              product_name:title,
              quantity:qty,
              size:sizeFromTitle(title),
              unit_price:unitPrice,
              sale_total:total,
              buyer:String(receipt?.buyer_user_id||''),
              order_id:String(t?.transaction_id||receipt?.receipt_id||''),
              sale_date:saleDate,
            });
          }
        }
        pages+=1; offset+=100;
        if(results.length<100) break;
        if(pages===3) more=true;
      }
      const saved=await insertOrders(client,business.base44_id,rows,'etsy_official_oauth');
      return res.status(200).json({
        ok:true,
        saved,
        checked:rows.length,
        more_possible:more,
        message:`${saved} new Etsy sale${saved===1?'':'s'} imported${rows.length?` from ${rows.length} paid order${rows.length===1?'':'s'}`:''}.`,
      });
    }

    return res.status(400).json({error:'Unknown action'});
  }catch(e){
    console.error('Etsy official connection error',e?.message||e);
    return res.status(500).json({error:clean(e?.message||'Etsy connection failed')||'Etsy connection failed'});
  }finally{client.release();}
}