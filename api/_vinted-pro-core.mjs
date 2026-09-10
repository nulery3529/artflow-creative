// Shared Vinted Pro sync core.
// Used by /api/vinted-official for the manual "Sync imported" button and by
// the daily cron so every connected Vinted Pro business autosyncs without
// anyone pressing the button.
import crypto from 'node:crypto';

const API_BASE = 'https://pro.svc.vinted.com';
export const clean = (v='') => String(v ?? '').trim();

function tokenKey(){
  const base=clean(process.env.MARKETPLACE_TOKEN_SECRET || process.env.BETTER_AUTH_SECRET);
  if(!base) throw new Error('Server token encryption is not configured');
  return crypto.createHash('sha256').update(`artflow-vinted-pro-token-v1:${base}`).digest();
}
export function encryptVintedToken(value){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',tokenKey(),iv);
  const encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return [iv,tag,encrypted].map(b=>b.toString('base64url')).join('.');
}
export function decryptVintedToken(value){
  const [ivB64,tagB64,dataB64]=String(value||'').split('.');
  if(!ivB64||!tagB64||!dataB64) throw new Error('Stored Vinted token is invalid');
  const decipher=crypto.createDecipheriv('aes-256-gcm',tokenKey(),Buffer.from(ivB64,'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64,'base64url')),decipher.final()]).toString('utf8');
}
export function splitToken(token){
  const raw=clean(token);
  const idx=raw.indexOf(',');
  if(idx<=0 || idx===raw.length-1) throw new Error('Vinted Pro access token must contain the access key and signing key separated by a comma.');
  const accessKey=raw.slice(0,idx).trim();
  const signingKey=raw.slice(idx+1).trim();
  if(!accessKey || !signingKey) throw new Error('Vinted Pro access token is incomplete.');
  return {accessKey,signingKey};
}
export async function vintedRequest(token,method,path,body=''){
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
export async function ensureListingTable(client){
  await client.query(`CREATE TABLE IF NOT EXISTS artflow.marketplace_listings (
    id text PRIMARY KEY,business_id text NOT NULL,platform text NOT NULL,listing_id text,title text NOT NULL,price numeric DEFAULT 0,currency text DEFAULT 'USD',image_url text,listing_url text NOT NULL,status text DEFAULT 'Active',last_seen_at timestamptz DEFAULT now(),sync_source text,data jsonb DEFAULT '{}'::jsonb
  )`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_business_platform_url_idx ON artflow.marketplace_listings (business_id, platform, listing_url)`);
}
export async function upsertImported(client,businessId,items){
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

// Pulls every active imported listing for one connected business and upserts
// it. Returns {connected, saved, total_returned, message}.
export async function syncImportedListings(client, business){
  const pro=business?.data?.vinted_pro||{};
  if(!pro.connected || !pro.access_token_enc){
    return {connected:false,saved:0,total_returned:0,message:'Vinted Pro is not connected.'};
  }
  const token=decryptVintedToken(pro.access_token_enc);
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
  return {
    connected:true,
    saved:urls.length,
    total_returned:all.length,
    message:`${urls.length} active imported Vinted listing${urls.length===1?'':'s'} synced from Vinted Pro.`,
  };
}

// Autosyncs every business with a stored Vinted Pro token (used by the cron).
export async function syncAllConnectedVinted(client){
  const r=await client.query(`
    SELECT base44_id, data FROM artflow.businesses
     WHERE COALESCE((data->'vinted_pro'->>'connected')::boolean, false) IS TRUE
       AND data->'vinted_pro'->>'access_token_enc' IS NOT NULL
  `);
  const summary={businesses:0,saved:0,failed:0};
  for(const row of r.rows){
    summary.businesses+=1;
    try{
      const result=await syncImportedListings(client,row);
      summary.saved+=Number(result.saved)||0;
    }catch(e){
      summary.failed+=1;
      console.warn('Vinted Pro autosync failed for business',row.base44_id,e?.message||e);
    }
  }
  return summary;
}