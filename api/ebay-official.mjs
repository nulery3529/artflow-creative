import pg from 'pg';
import { pooledDatabaseUrl } from './_db.mjs';
import crypto from 'node:crypto';
import {
  clean, session, profile, businessForUser, encrypt, decrypt, parseBody,
  ensureOAuthStateTable, insertOrders, sizeFromTitle,
} from './_official-sync-shared.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: pooledDatabaseUrl(), ssl: { rejectUnauthorized: false }, max: 1 });

const REDIRECT_ENDPOINT = 'https://artflowcreative.com/api/ebay-official?op=callback';
const AUTH_URL = 'https://auth.ebay.com/oauth2/authorize';
const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const ORDERS_URL = 'https://api.ebay.com/sell/fulfillment/v1/order';
const IDENTITY_URL = 'https://api.ebay.com/commerce/identity/v1/user/';
const SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
];

const ebayClientId = () => clean(process.env.EBAY_CLIENT_ID);
const ebayClientSecret = () => clean(process.env.EBAY_CLIENT_SECRET);
const ebayRuName = () => clean(process.env.EBAY_RUNAME || process.env.EBAY_REDIRECT_URI);
const configured = () => Boolean(ebayClientId() && ebayClientSecret() && ebayRuName());

async function ebayToken(params, authHeader){
  const headers={'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'};
  if(authHeader) headers.Authorization=authHeader;
  const r=await fetch(TOKEN_URL,{method:'POST',headers,body:new URLSearchParams(params)});
  const text=await r.text();
  let data={}; try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
  if(!r.ok) throw new Error(clean(data?.errors?.[0]?.message||data?.error_description||data?.error||text||`eBay token request failed (${r.status})`));
  return data;
}

async function ebayGet(url,accessToken){
  const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json'}});
  const text=await r.text();
  let data={}; try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
  if(!r.ok) throw new Error(clean(data?.errors?.[0]?.message||data?.error_description||data?.error||text||`eBay API ${r.status}`));
  return data;
}

async function saveOAuth(client,business,patch){
  const oauth={...(business.data?.ebay_oauth||{}),...patch,updated_at:new Date().toISOString()};
  const next={...(business.data||{}),ebay_oauth:oauth};
  await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`,[business.base44_id,JSON.stringify(next)]);
  business.data=next;
}

async function validAccessToken(client,business){
  const oauth=business.data?.ebay_oauth||{};
  if(!oauth.refresh_token_enc) throw new Error('eBay is not connected');
  const expiresAt=oauth.expires_at?new Date(oauth.expires_at).getTime():0;
  if(oauth.access_token_enc && expiresAt>Date.now()+60_000) return decrypt(oauth.access_token_enc);
  const basic=Buffer.from(`${ebayClientId()}:${ebayClientSecret()}`).toString('base64');
  const refreshed=await ebayToken({
    grant_type:'refresh_token',
    refresh_token:decrypt(oauth.refresh_token_enc),
    scope:SCOPES.join(' '),
  },`Basic ${basic}`);
  const expiresAtIso=new Date(Date.now()+(Number(refreshed.expires_in)||7200)*1000).toISOString();
  await saveOAuth(client,business,{
    access_token_enc:refreshed.access_token?encrypt(refreshed.access_token):oauth.access_token_enc,
    expires_at:expiresAtIso,
  });
  return refreshed.access_token;
}

function redirect(res,kind,message=''){
  const q=new URLSearchParams({ebay:kind});
  if(message) q.set('message',message.slice(0,180));
  res.statusCode=302;
  res.setHeader('Location',`/account?${q.toString()}`);
  return res.end();
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
      if(!state||!code) return redirect(res,'error','Missing eBay authorization response');
      const s=await client.query(`DELETE FROM artflow.marketplace_oauth_states WHERE state=$1 AND platform='eBay' AND expires_at>now() RETURNING *`,[state]);
      const saved=s.rows[0];
      if(!saved) return redirect(res,'error','eBay connection expired. Try Connect again.');
      if(!configured()) return redirect(res,'error','eBay credentials are not configured in Art Flow.');
      const basic=Buffer.from(`${ebayClientId()}:${ebayClientSecret()}`).toString('base64');
      const token=await ebayToken({
        grant_type:'authorization_code',
        code,
        redirect_uri:ebayRuName(),
      },`Basic ${basic}`);
      const br=await client.query(`SELECT base44_id,name,primary_email,data FROM artflow.businesses WHERE base44_id=$1 LIMIT 1`,[saved.business_id]);
      const business=br.rows[0];
      if(!business) return redirect(res,'error','Art Flow business workspace was not found.');
      const expiresAtIso=new Date(Date.now()+(Number(token.expires_in)||7200)*1000).toISOString();
      let username='';
      try{
        const me=await ebayGet(IDENTITY_URL,token.access_token);
        username=clean(me?.username);
      }catch{}
      await saveOAuth(client,business,{
        connected:true,
        access_token_enc:encrypt(token.access_token),
        refresh_token_enc:token.refresh_token?encrypt(token.refresh_token):business.data?.ebay_oauth?.refresh_token_enc,
        expires_at:expiresAtIso,
        username,
        connected_at:business.data?.ebay_oauth?.connected_at||new Date().toISOString(),
      });
      return redirect(res,'connected');
    }

    const s=await session(req).catch(()=>null);
    if(!s?.user) return res.status(401).json({error:'Unauthorized'});
    const p=await profile(client,s.user);
    const business=await businessForUser(client,p,s.user);
    if(!business) return res.status(404).json({error:'Business workspace not found'});
    const oauth=business.data?.ebay_oauth||{};

    if(req.method==='GET'){
      return res.status(200).json({
        configured:configured(),
        connected:Boolean(oauth.connected&&oauth.refresh_token_enc),
        username:clean(oauth.username),
        redirect_uri:REDIRECT_ENDPOINT,
      });
    }
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
    const body=parseBody(req), action=clean(body.action);

    if(action==='start'){
      if(!configured()) return res.status(503).json({error:'eBay credentials are not configured yet. Add EBAY_CLIENT_ID, EBAY_CLIENT_SECRET and EBAY_RUNAME to the server environment.'});
      const state=crypto.randomBytes(32).toString('base64url');
      await client.query(`DELETE FROM artflow.marketplace_oauth_states WHERE expires_at<=now()`);
      await client.query(`INSERT INTO artflow.marketplace_oauth_states (state,business_id,platform,code_verifier,expires_at) VALUES ($1,$2,'eBay','',now()+interval '15 minutes')`,[state,business.base44_id]);
      const q=[
        'response_type=code',
        `client_id=${encodeURIComponent(ebayClientId())}`,
        `redirect_uri=${encodeURIComponent(ebayRuName())}`,
        `state=${encodeURIComponent(state)}`,
        `scope=${encodeURIComponent(SCOPES.join(' '))}`,
      ].join('&');
      return res.status(200).json({authorization_url:`${AUTH_URL}?${q}`});
    }

    if(action==='disconnect'){
      const next={...(business.data||{})};
      delete next.ebay_oauth;
      await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`,[business.base44_id,JSON.stringify(next)]);
      return res.status(200).json({ok:true});
    }

    if(action==='sync'){
      if(!configured()) return res.status(503).json({error:'eBay credentials are not configured.'});
      const token=await validAccessToken(client,business);
      const rows=[];
      const seen=new Set();
      let more=false;
      for(const status of ['COMPLETED','IN_PROGRESS']){
        let pages=0, continuation='';
        while(pages<3){
          const url=continuation
            ? `https://api.ebay.com${continuation}`
            : `${ORDERS_URL}?filter=orderfulfillmentstatus:${encodeURIComponent(`{${status}}`)}&limit=50`;
          const data=await ebayGet(url,token);
          const orders=Array.isArray(data?.orders)?data.orders:[];
          for(const order of orders){
            if(order?.orderPaymentStatus!=='PAID') continue;
            const orderId=clean(order?.orderId);
            if(!orderId || seen.has(orderId)) continue;
            seen.add(orderId);
            const lineItems=Array.isArray(order?.lineItems)?order.lineItems:[];
            const title=lineItems.map(li=>clean(li?.title)).filter(Boolean).join(' + ')||`eBay order ${orderId}`;
            const quantity=lineItems.reduce((sum,li)=>sum+(Number(li?.quantity)||0),0)||1;
            const total=Number(Number(order?.orderTotal?.value||0).toFixed(2));
            if(total<=0) continue;
            rows.push({
              platform:'eBay',
              product_name:title,
              quantity,
              size:sizeFromTitle(title),
              unit_price:Number((total/quantity).toFixed(2)),
              sale_total:total,
              buyer:clean(order?.buyer?.username),
              order_id:orderId,
              sale_date:clean(order?.creationDate),
            });
          }
          pages+=1;
          continuation=clean(data?.next||'');
          if(!continuation) break;
          if(pages===3) more=true;
        }
      }
      const saved=await insertOrders(client,business.base44_id,rows,'ebay_official_oauth');
      return res.status(200).json({
        ok:true,
        saved,
        checked:rows.length,
        more_possible:more,
        message:`${saved} new eBay sale${saved===1?'':'s'} imported${rows.length?` from ${rows.length} paid order${rows.length===1?'':'s'}`:''}.`,
      });
    }

    return res.status(400).json({error:'Unknown action'});
  }catch(e){
    console.error('eBay official connection error',e?.message||e);
    return res.status(500).json({error:clean(e?.message||'eBay connection failed')||'eBay connection failed'});
  }finally{client.release();}
}