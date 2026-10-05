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
const TRADING_URL = 'https://api.ebay.com/ws/api.dll';
const TRADING_VERSION = '1477';
const SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
];

const ebayClientId = () => clean(process.env.EBAY_CLIENT_ID);
const ebayClientSecret = () => clean(process.env.EBAY_CLIENT_SECRET);
const ebayRuName = () => clean(process.env.EBAY_RUNAME || process.env.EBAY_REDIRECT_URI);
const validRuName = () => Boolean(ebayRuName() && !/^https?:\/\//i.test(ebayRuName()));
const configured = () => Boolean(ebayClientId() && ebayClientSecret() && validRuName());

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

function xmlDecode(value=''){
  return String(value||'')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'");
}
function xmlTag(xml,tag){
  const escaped=tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const m=String(xml||'').match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`,'i'));
  return m?xmlDecode(m[1].replace(/<[^>]+>/g,'').trim()):'';
}
function xmlBlocks(xml,tag){
  const escaped=tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return [...String(xml||'').matchAll(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`,'gi'))].map(m=>m[1]);
}
function httpsUrl(value=''){
  const url=clean(value);
  return url.replace(/^http:\/\//i,'https://');
}

async function connectedSellerUsername(accessToken){
  const r=await fetch(TRADING_URL,{method:'POST',headers:{
    'Content-Type':'text/xml','X-EBAY-API-CALL-NAME':'GetUser','X-EBAY-API-SITEID':'0',
    'X-EBAY-API-COMPATIBILITY-LEVEL':TRADING_VERSION,'X-EBAY-API-IAF-TOKEN':accessToken,
  },body:'<?xml version="1.0" encoding="utf-8"?><GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents"><OutputSelector>User.UserID</OutputSelector></GetUserRequest>'});
  const xml=await r.text();
  if(!r.ok || /<Ack>(Failure|PartialFailure)<\/Ack>/i.test(xml)){
    throw new Error(xmlTag(xml,'LongMessage')||xmlTag(xml,'ShortMessage')||'Unable to verify eBay seller');
  }
  const username=xmlTag(xml,'UserID');
  if(!username) throw new Error('eBay did not return the connected seller username');
  return username;
}

async function ensureListingsTable(client){
  await client.query(`CREATE TABLE IF NOT EXISTS artflow.marketplace_listings (
    id text PRIMARY KEY,business_id text NOT NULL,platform text NOT NULL,listing_id text,title text NOT NULL,
    price numeric DEFAULT 0,currency text DEFAULT 'USD',image_url text,listing_url text NOT NULL,status text DEFAULT 'Active',
    last_seen_at timestamptz DEFAULT now(),sync_source text,data jsonb DEFAULT '{}'::jsonb
  )`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_business_platform_url_idx ON artflow.marketplace_listings (business_id, platform, listing_url)`);
}
async function ebayActivePage(accessToken,pageNumber=1,listName='ActiveList'){
  if(!['ActiveList','SoldList'].includes(listName)) throw new Error('Invalid eBay list');
  const body=`<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <DetailLevel>ReturnAll</DetailLevel>
  <${listName}><Include>true</Include>${listName==='SoldList'?'<DurationInDays>60</DurationInDays>':''}<Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${pageNumber}</PageNumber></Pagination></${listName}>
</GetMyeBaySellingRequest>`;
  const r=await fetch(TRADING_URL,{method:'POST',headers:{
    'Content-Type':'text/xml','X-EBAY-API-CALL-NAME':'GetMyeBaySelling','X-EBAY-API-SITEID':'0',
    'X-EBAY-API-COMPATIBILITY-LEVEL':TRADING_VERSION,'X-EBAY-API-IAF-TOKEN':accessToken,
  },body});
  const xml=await r.text();
  if(!r.ok || /<Ack>(Failure|PartialFailure)<\/Ack>/i.test(xml)){
    const message=xmlTag(xml,'LongMessage')||xmlTag(xml,'ShortMessage')||`eBay Trading API ${r.status}`;
    throw new Error(message);
  }
  const active=xml.match(new RegExp(`<${listName}>([\\s\\S]*?)<\\/${listName}>`,'i'))?.[1]||'';
  const items=xmlBlocks(active,'Item').map(item=>{
    const listingId=xmlTag(item,'ItemID');
    const title=xmlTag(item,'Title')||`eBay listing ${listingId}`;
    const listingUrl=xmlTag(item,'ViewItemURL')||xmlTag(item,'ViewItemURLForNaturalSearch')||`https://www.ebay.com/itm/${listingId}`;
    const imageUrl=httpsUrl(xmlTag(item,'GalleryURL')||xmlTag(item,'PictureURL'));
    const price=Number(xmlTag(item,'CurrentPrice')||xmlTag(item,'BuyItNowPrice')||0)||0;
    const currency=(item.match(/<CurrentPrice[^>]*currencyID="([^"]+)"/i)?.[1]||'USD').toUpperCase();
    const quantity=Math.max(0,Number(xmlTag(item,'QuantityAvailable')||xmlTag(item,'Quantity')||0)||0);
    return {listingId,title,listingUrl,imageUrl,price,currency,quantity};
  }).filter(item=>item.listingId);
  const totalPages=Math.max(1,Number(xmlTag(active,'TotalNumberOfPages')||1)||1);
  return {items,totalPages};
}
async function syncEbayListings(client,business,accessToken){
  await ensureListingsTable(client);
  const urls=[];
  let saved=0,page=1,totalPages=1;
  do{
    const result=await ebayActivePage(accessToken,page);
    totalPages=result.totalPages;
    for(const listing of result.items){
      const id=crypto.createHash('sha256').update(`${business.base44_id}|eBay|${listing.listingUrl}`).digest('hex');
      await client.query(
        `INSERT INTO artflow.marketplace_listings (id,business_id,platform,listing_id,title,price,currency,image_url,listing_url,status,last_seen_at,sync_source,data)
         VALUES ($1,$2,'eBay',$3,$4,$5,$6,$7,$8,'Active',now(),'ebay_official_oauth',jsonb_build_object('quantity',$9,'ebay_official',true))
         ON CONFLICT (business_id,platform,listing_url) DO UPDATE SET listing_id=EXCLUDED.listing_id,title=EXCLUDED.title,price=EXCLUDED.price,currency=EXCLUDED.currency,
           image_url=COALESCE(NULLIF(EXCLUDED.image_url,''),artflow.marketplace_listings.image_url),status='Active',last_seen_at=now(),sync_source='ebay_official_oauth',
           data=COALESCE(artflow.marketplace_listings.data,'{}'::jsonb)||EXCLUDED.data`,
        [id,business.base44_id,listing.listingId,listing.title,listing.price,listing.currency,listing.imageUrl||null,listing.listingUrl,listing.quantity]
      );
      urls.push(listing.listingUrl); saved+=1;
    }
    page+=1;
  }while(page<=totalPages && page<=25);
  const complete=page>totalPages;
  if(complete){
    if(urls.length) await client.query(`UPDATE artflow.marketplace_listings SET status='Inactive',last_seen_at=now(),sync_source='ebay_official_snapshot' WHERE business_id=$1 AND platform='eBay' AND status='Active' AND NOT (listing_url=ANY($2::text[]))`,[business.base44_id,urls]);
    else await client.query(`UPDATE artflow.marketplace_listings SET status='Inactive',last_seen_at=now(),sync_source='ebay_official_snapshot' WHERE business_id=$1 AND platform='eBay' AND status='Active'`,[business.base44_id]);
  }
  return {saved,more:!complete};
}




async function ebayEndedPhotoPage(accessToken,from,to,pageNumber=1){
  const r=await fetch(TRADING_URL,{method:'POST',headers:{
    'Content-Type':'text/xml','X-EBAY-API-CALL-NAME':'GetSellerList','X-EBAY-API-SITEID':'0',
    'X-EBAY-API-COMPATIBILITY-LEVEL':TRADING_VERSION,'X-EBAY-API-IAF-TOKEN':accessToken,
  },body:`<?xml version="1.0" encoding="utf-8"?><GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
    <GranularityLevel>Fine</GranularityLevel><EndTimeFrom>${from}</EndTimeFrom><EndTimeTo>${to}</EndTimeTo>
    <Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${pageNumber}</PageNumber></Pagination>
    </GetSellerListRequest>`});
  const xml=await r.text();
  if(!r.ok || /<Ack>(Failure|PartialFailure)<\/Ack>/i.test(xml))
    throw new Error(xmlTag(xml,'LongMessage')||'Unable to retrieve historical eBay item photos');
  return {
    items:xmlBlocks(xml,'Item').map(item=>({
      listingId:xmlTag(item,'ItemID'),title:xmlTag(item,'Title'),
      imageUrl:httpsUrl(xmlTag(item,'PictureURL')||xmlTag(item,'GalleryURL')),
      listingUrl:xmlTag(item,'ViewItemURL')||`https://www.ebay.com/itm/${xmlTag(item,'ItemID')}`,
    })).filter(item=>item.listingId&&item.imageUrl),
    totalPages:Math.max(1,Number(xmlTag(xml,'TotalNumberOfPages')||1)),
  };
}

async function repairConnectedEbayPhotos(client,business,accessToken){
  const result=await client.query(`SELECT base44_id,product_name,data FROM artflow.orders
    WHERE business_id=$1 AND lower(platform)='ebay' AND archived IS NOT TRUE
      AND left(COALESCE(sale_date,''),4)=to_char(CURRENT_DATE,'YYYY') LIMIT 500`,[business.base44_id]);
  if(!result.rows.length) return 0;
  const items=new Map();
  for(const listName of ['ActiveList','SoldList']){
    let page=1,totalPages=1;
    do{
      const batch=await ebayActivePage(accessToken,page,listName);
      totalPages=batch.totalPages;
      for(const item of batch.items) if(item.imageUrl) items.set(item.listingId,item);
      page+=1;
    }while(page<=totalPages && page<=25);
  }
  const now=new Date();
  let from=new Date(Date.UTC(now.getUTCFullYear(),0,1));
  while(from<now){
    const to=new Date(Math.min(now.getTime(),from.getTime()+119*86400000));
    let page=1,totalPages=1;
    do{
      const batch=await ebayEndedPhotoPage(accessToken,from.toISOString(),to.toISOString(),page).catch(error=>{
        console.warn('Historical eBay photo lookup failed',error?.message||error);
        return {items:[],totalPages:1};
      });
      totalPages=batch.totalPages;
      for(const item of batch.items) items.set(item.listingId,item);
      page+=1;
    }while(page<=totalPages && page<=10);
    from=new Date(to.getTime()+1000);
  }
  const titleKey=value=>clean(value).toLowerCase().replace(/^title:\s*/i,'').replace(/[^a-z0-9]+/g,'');
  let repaired=0;
  for(const order of result.rows){
    const key=titleKey(order.product_name);
    if(key.length<20) continue;
    const exact=[...items.values()].filter(item=>titleKey(item.title)===key);
    const matches=exact.length?exact:[...items.values()].filter(item=>{
      const other=titleKey(item.title);
      return key.length>=30 && other.startsWith(key);
    });
    // A truncated email title must identify one item, never a guessed artwork.
    if(matches.length!==1) continue;
    const item=matches[0];
    if(clean(order.data?.image_url)===item.imageUrl) continue;
    await client.query(`UPDATE artflow.orders SET data=COALESCE(data,'{}'::jsonb)
      || jsonb_build_object('image_url',$2::text,'ebay_item_id',$3::text,
        'source_url',$4::text,'source_image_source','ebay_seller_item',
        'source_image_parser_version',8),updated_date=now()
      WHERE base44_id=$1 AND business_id=$5`,
      [order.base44_id,item.imageUrl,item.listingId,item.listingUrl,business.base44_id]);
    repaired+=1;
  }
  return repaired;
}

export async function syncConnectedEbayOrders(client,business){
  if(!business?.base44_id) return {saved:0,checked:0,more_possible:false};
  if(!configured()) throw new Error('eBay connection is temporarily unavailable.');
  const oauth=business.data?.ebay_oauth||{};
  if(!oauth.connected || !oauth.refresh_token_enc) return {saved:0,checked:0,more_possible:false,skipped:true};

  const token=await validAccessToken(client,business);
  const rows=[];
  const seen=new Set();
  let more=false;

  // eBay supports these paired fulfillment filters, not single-value sets.
  for(const status of ['NOT_STARTED|IN_PROGRESS','FULFILLED|IN_PROGRESS']){
    let pages=0, continuation='';
    while(pages<20){
      const url=continuation
        ? new URL(continuation, ORDERS_URL).href
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
        const legacyItemId = lineItems.map((li) => clean(li?.legacyItemId)).find(Boolean) || '';
        const publicListingUrl = /^\d{8,14}$/.test(legacyItemId)
          ? `https://www.ebay.com/itm/${legacyItemId}`
          : '';
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
          source_url:`https://www.ebay.com/sh/ord/details?orderid=${encodeURIComponent(orderId)}`,
          image_url: publicListingUrl
            ? `/api/listing-image?listing=${encodeURIComponent(publicListingUrl)}`
            : '',
        });
      }
      pages+=1;
      continuation=clean(data?.next||'');
      if(!continuation) break;
      if(pages===20) more=true;
    }
  }

  const imageCandidates=rows.filter((row)=>clean(row.image_url)).length;
  const saved=await insertOrders(client,business.base44_id,rows,'ebay_official_oauth');
  const photosRepaired=await repairConnectedEbayPhotos(client,business,token);
  return {saved,checked:rows.length,more_possible:more,image_candidates:imageCandidates,photos_repaired:photosRepaired};
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
      if(!configured()) return redirect(res,'error','eBay connection is temporarily unavailable. Please try again later.');
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
      try{
        await syncConnectedEbayOrders(client,business);
      }catch(error){
        console.warn('Initial eBay order sync failed',error?.message||error);
      }
      return redirect(res,'connected');
    }

    const s=await session(req).catch(()=>null);
    if(!s?.user) return res.status(401).json({error:'Unauthorized'});
    const p=await profile(client,s.user);
    const business=await businessForUser(client,p,s.user);
    if(!business) return res.status(404).json({error:'Business workspace not found'});
    const oauth=business.data?.ebay_oauth||{};

    if(req.method==='GET'){
      if(oauth.connected && oauth.refresh_token_enc && !clean(oauth.username)){
        try{
          const username=await connectedSellerUsername(await validAccessToken(client,business));
          await saveOAuth(client,business,{username});
          oauth.username=username;
        }catch(error){ console.warn('eBay seller verification failed',error?.message||error); }
      }
      const connectionStatus={
        configured:configured(),
        connected:Boolean(oauth.connected&&oauth.refresh_token_enc),
        username:clean(oauth.username),
        redirect_uri:REDIRECT_ENDPOINT,
        runame_configured:Boolean(ebayRuName()),
        runame_valid:validRuName(),
      };
      console.log('eBay connection status', JSON.stringify({
        configured:connectionStatus.configured,
        connected:connectionStatus.connected,
        username_present:Boolean(connectionStatus.username),
        runame_valid:connectionStatus.runame_valid,
      }));
      return res.status(200).json(connectionStatus);
    }
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
    const body=parseBody(req), action=clean(body.action);

    if(action==='start'){
      if(!configured()) return res.status(503).json({
        error: ebayRuName() && !validRuName()
          ? 'eBay OAuth is misconfigured: eBay requires the Production RuName, not a callback URL.'
          : 'eBay connection is temporarily unavailable. Please try again later.'
      });
      const state=crypto.randomBytes(32).toString('base64url');
      await client.query(`DELETE FROM artflow.marketplace_oauth_states WHERE expires_at<=now()`);
      await client.query(`INSERT INTO artflow.marketplace_oauth_states (state,business_id,platform,code_verifier,expires_at) VALUES ($1,$2,'eBay','',now()+interval '15 minutes')`,[state,business.base44_id]);
      const q=[
        'response_type=code',
        `client_id=${encodeURIComponent(ebayClientId())}`,
        `redirect_uri=${encodeURIComponent(ebayRuName())}`,
        `state=${encodeURIComponent(state)}`,
        `scope=${encodeURIComponent(SCOPES.join(' '))}`,
        'locale=en-US',
        'prompt=login',
      ].join('&');
      const authorizationUrl=`${AUTH_URL}?${q}`;

      // eBay occasionally returns a raw OAuth 500 ("temporarily_unavailable")
      // before the user can even reach the consent screen. Detect that here so
      // Art Flow can keep the user in-app and fall back to public seller imports.
      try {
        const controller=new AbortController();
        const timeout=setTimeout(()=>controller.abort(),8000);
        const probe=await fetch(authorizationUrl,{
          method:'GET',
          redirect:'manual',
          signal:controller.signal,
          headers:{'User-Agent':'ArtFlowCreative/1.0'},
        }).finally(()=>clearTimeout(timeout));
        if(probe.status>=500){
          await client.query(`DELETE FROM artflow.marketplace_oauth_states WHERE state=$1`,[state]);
          return res.status(503).json({
            error:'eBay sign-in is temporarily unavailable on eBay. Your public eBay listings can still be imported from your seller profile.',
            reason:'ebay_oauth_temporarily_unavailable',
          });
        }
      }catch{
        // If the probe itself cannot complete, still allow the normal browser
        // OAuth attempt rather than blocking a connection that may work.
      }

      return res.status(200).json({authorization_url:authorizationUrl});
    }

    if(action==='disconnect'){
      const next={...(business.data||{})};
      delete next.ebay_oauth;
      await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`,[business.base44_id,JSON.stringify(next)]);
      return res.status(200).json({ok:true});
    }

    if(action==='sync'){
      if(!configured()) return res.status(503).json({error:'eBay connection is temporarily unavailable. Please try again later.'});
      const result=await syncConnectedEbayOrders(client,business);
      console.log('eBay order sync summary', JSON.stringify({
        connected:Boolean(business.data?.ebay_oauth?.connected && business.data?.ebay_oauth?.refresh_token_enc),
        skipped:Boolean(result.skipped),
        checked:Number(result.checked||0),
        saved:Number(result.saved||0),
        more_possible:Boolean(result.more_possible),
        image_candidates:Number(result.image_candidates||0),
        photos_repaired:Number(result.photos_repaired||0),
      }));
      return res.status(200).json({
        ok:true,
        ...result,
        message:result.saved>0
          ? `eBay synced: ${result.saved} new sale${result.saved===1?'':'s'} imported.`
          : result.photos_repaired>0
            ? `Updated ${result.photos_repaired} eBay order photos.`
          : result.skipped
            ? 'eBay is not connected yet.'
            : 'eBay orders are up to date.',
      });
    }

    return res.status(400).json({error:'Unknown action'});
  }catch(e){
    console.error('eBay official connection error',e?.message||e);
    return res.status(500).json({error:clean(e?.message||'eBay connection failed')||'eBay connection failed'});
  }finally{client.release();}
}
