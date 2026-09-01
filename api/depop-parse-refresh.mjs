import pg from 'pg';
import crypto from 'node:crypto';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
const PARSE_BASE = 'https://api.parse.bot/scraper/8cd92db4-e548-4ff6-96bd-a5c4ff66bb71';
const MAX_PAGES = 100;
const clean = (v='') => String(v ?? '').trim();
const normalize = (v='') => clean(v).toLowerCase();

async function getSession(req) { return auth.api.getSession({ headers: fromNodeHeaders(req.headers) }); }
async function profile(client,user){
  const email=normalize(user?.email);
  const r=await client.query(`SELECT * FROM artflow.legacy_users WHERE auth_user_id=$1 OR lower(email)=$2 ORDER BY CASE WHEN auth_user_id=$1 THEN 0 ELSE 1 END LIMIT 1`,[user.id,email]);
  return r.rows[0]||null;
}
function businessEmails(row){const d=row?.data||{};return [row?.primary_email,d.primary_email,...(d.member_emails||[]),...(d.sales_emails||[]),...(d.expense_emails||[])].map(normalize).filter(Boolean)}
async function businessForUser(client,p,user){
  const active=p?.active_business_id||p?.data?.active_business_id||null;
  const email=normalize(user?.email);
  const r=await client.query(`SELECT base44_id,name,primary_email,data FROM artflow.businesses ORDER BY name NULLS LAST`);
  const activeRow=r.rows.find(x=>active&&x.base44_id===active)||null;
  const emailRows=r.rows.filter(x=>email&&businessEmails(x).includes(email));
  const placeholder=(row)=>{if(!row)return false;const d=row.data||{};return businessEmails(row).length===0&&!d.spreadsheet_id&&!d.spreadsheetId&&/^my business$/i.test(String(row.name||'').trim())};
  const canonical=emailRows.find(row=>{const d=row.data||{};return Boolean(d.spreadsheet_id||d.spreadsheetId||(Array.isArray(d.tracked_marketplaces)&&d.tracked_marketplaces.length))})||emailRows[0]||null;
  return placeholder(activeRow)&&canonical?canonical:(activeRow||canonical||null);
}
async function ensureTable(client){
  await client.query(`CREATE TABLE IF NOT EXISTS artflow.marketplace_listings (
    id text PRIMARY KEY,business_id text NOT NULL,platform text NOT NULL,listing_id text,title text NOT NULL,price numeric DEFAULT 0,currency text DEFAULT 'USD',image_url text,listing_url text NOT NULL,status text DEFAULT 'Active',last_seen_at timestamptz DEFAULT now(),sync_source text,data jsonb DEFAULT '{}'::jsonb
  )`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_business_platform_url_idx ON artflow.marketplace_listings (business_id, platform, listing_url)`);
}
function parseBody(req){if(req.body&&typeof req.body==='object')return req.body;if(typeof req.body==='string'){try{return JSON.parse(req.body)}catch{}}return {}}
function depopUsername(value=''){
  let v=clean(value).replace(/^@/,'');
  try{const u=new URL(v);const parts=u.pathname.split('/').filter(Boolean);if(parts[0]==='shop'&&parts[1])v=parts[1];else if(parts[0])v=parts[0]}catch{}
  return v.replace(/[^a-zA-Z0-9._-]/g,'').slice(0,80);
}
function num(...values){for(const v of values){const n=Number(String(v??'').replace(/[^0-9.-]/g,''));if(Number.isFinite(n)&&n>=0)return n}return 0}
function firstUrl(obj){
  const seen=new Set();
  const walk=(v,depth=0)=>{if(depth>4||v==null)return '';if(typeof v==='string'){if(/^https?:\/\//i.test(v)&&/image|depop|cloud|cdn|jpg|jpeg|png|webp/i.test(v))return v;return ''}if(typeof v!=='object'||seen.has(v))return '';seen.add(v);if(Array.isArray(v)){for(const x of v){const hit=walk(x,depth+1);if(hit)return hit}return ''}const priority=['image_url','imageUrl','preview_image','previewImage','thumbnail','picture','pictures','images','image'];for(const k of priority){if(k in v){const hit=walk(v[k],depth+1);if(hit)return hit}}for(const [k,x] of Object.entries(v)){if(/image|picture|photo|preview|thumb/i.test(k)){const hit=walk(x,depth+1);if(hit)return hit}}return ''};
  return walk(obj);
}
function productArray(payload){const d=payload?.data||{};for(const v of [d.products,payload?.products,d.listings,payload?.listings,d.items,payload?.items])if(Array.isArray(v))return v;return []}
function metaOf(payload){return payload?.data?.meta||payload?.meta||{}}
function normalizeProduct(p={}){
  const slug=clean(p.slug||p.product_slug||p.productSlug||p.url_slug);
  const id=clean(p.id||p.product_id||p.productId||slug);
  if(!slug&&!id)return null;
  const sold=p.sold===true||/sold|inactive|deleted/i.test(clean(p.status));
  if(sold)return null;
  const listingUrl=slug?`https://www.depop.com/products/${encodeURIComponent(slug)}`:clean(p.url||p.product_url||p.web_url);
  if(!listingUrl)return null;
  const pricing=p.pricing||{};
  const original=pricing.original_price||pricing.originalPrice||{};
  const current=pricing.current_price||pricing.currentPrice||pricing.discounted_price||{};
  const price=num(current.total_price,current.amount,current.price,original.total_price,original.amount,original.price,p.price,p.price_amount,p.amount);
  const currency=clean(pricing.currency_name||pricing.currency||current.currency||original.currency||p.currency||'USD')||'USD';
  let title=clean(p.title||p.product_title||p.productTitle||p.name||p.description);
  if(!title&&slug)title=slug.replace(/^[^-]+-/,'').replace(/-[0-9a-f]{3,}$/i,'').replace(/-/g,' ');
  if(!title)title=`Depop listing ${id}`;
  return {listingId:id,title:title.slice(0,300),price,currency,imageUrl:firstUrl(p),listingUrl,raw:p};
}
async function parseGet(username,cursor,key){
  const q=new URLSearchParams({username,limit:'100'});if(cursor)q.set('cursor',cursor);
  const r=await fetch(`${PARSE_BASE}/get_seller_listings?${q.toString()}`,{headers:{Accept:'application/json','X-API-Key':key}});
  const text=await r.text();let payload={};try{payload=text?JSON.parse(text):{}}catch{payload={raw:text}}
  if(!r.ok||payload?.status==='error'){
    const e=new Error(clean(payload?.error||payload?.message||payload?.detail||text||`Parse API ${r.status}`).slice(0,500));e.status=r.status;throw e;
  }
  return payload;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  const session=await getSession(req).catch(()=>null);if(!session?.user)return res.status(401).json({error:'Unauthorized'});
  const client=await pool.connect();
  try{
    const p=await profile(client,session.user);const b=await businessForUser(client,p,session.user);if(!b)return res.status(404).json({error:'Business workspace not found'});
    const apiKey=clean(process.env.PARSE_API_KEY);
    const stored=depopUsername(b?.data?.depop_username||'');
    if(req.method==='GET')return res.status(200).json({configured:Boolean(apiKey),username:stored,needs_api_key:!apiKey,needs_username:!stored});
    if(!apiKey)return res.status(503).json({needs_api_key:true,error:'Add PARSE_API_KEY to Vercel before refreshing Depop listings.'});
    const body=parseBody(req);const username=depopUsername(body.username||stored);
    if(!username)return res.status(400).json({needs_username:true,error:'Enter your Depop username once to enable one-tap refresh.'});
    if(username!==stored){const next={...(b.data||{}),depop_username:username};await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`,[b.base44_id,JSON.stringify(next)]);b.data=next}
    await ensureTable(client);
    const listings=[];const seenCursors=new Set();let cursor='';let pages=0;let more=true;
    while(more&&pages<MAX_PAGES){
      const payload=await parseGet(username,cursor,apiKey);const products=productArray(payload);
      for(const raw of products){const n=normalizeProduct(raw);if(n)listings.push(n)}
      pages++;
      const meta=metaOf(payload);const next=clean(meta.last_offset_id||meta.cursor||meta.next_cursor||payload?.data?.cursor||payload?.cursor||'');
      more=meta.has_more===true||Boolean(next);
      if(!next||next===cursor||seenCursors.has(next)){more=false;break}
      seenCursors.add(next);cursor=next;
    }
    if(more)return res.status(502).json({error:'Depop listing refresh hit the pagination safety limit. Existing Gallery listings were left active.'});
    const activeUrls=[];
    for(const listing of listings){
      const id=crypto.createHash('sha256').update(`${b.base44_id}|Depop|${listing.listingUrl}`).digest('hex');
      await client.query(`INSERT INTO artflow.marketplace_listings (id,business_id,platform,listing_id,title,price,currency,image_url,listing_url,status,last_seen_at,sync_source,data)
      VALUES ($1,$2,'Depop',$3,$4,$5,$6,$7,$8,'Active',now(),'parse_depop_refresh',$9::jsonb)
      ON CONFLICT (business_id,platform,listing_url) DO UPDATE SET listing_id=EXCLUDED.listing_id,title=EXCLUDED.title,price=EXCLUDED.price,currency=EXCLUDED.currency,image_url=COALESCE(NULLIF(EXCLUDED.image_url,''),artflow.marketplace_listings.image_url),status='Active',last_seen_at=now(),sync_source='parse_depop_refresh',data=EXCLUDED.data`,
      [id,b.base44_id,listing.listingId||null,listing.title,listing.price,listing.currency,listing.imageUrl||null,listing.listingUrl,JSON.stringify({source:'parse.bot',seller:username})]);
      activeUrls.push(listing.listingUrl);
    }
    let deactivated=0;
    if(activeUrls.length){const r=await client.query(`UPDATE artflow.marketplace_listings SET status='Inactive',last_seen_at=now(),sync_source='parse_depop_snapshot' WHERE business_id=$1 AND platform='Depop' AND status='Active' AND NOT (listing_url = ANY($2::text[]))`,[b.base44_id,activeUrls]);deactivated=Number(r.rowCount||0)}
    else{const r=await client.query(`UPDATE artflow.marketplace_listings SET status='Inactive',last_seen_at=now(),sync_source='parse_depop_snapshot' WHERE business_id=$1 AND platform='Depop' AND status='Active'`,[b.base44_id]);deactivated=Number(r.rowCount||0)}
    return res.status(200).json({ok:true,saved:listings.length,deactivated,pages,username,message:`${listings.length} active Depop listing${listings.length===1?'':'s'} refreshed${deactivated?` · ${deactivated} no longer active`:''}.`});
  }catch(e){
    console.error('Parse Depop refresh failed',e?.message||e);
    if(e?.status===401||e?.status===403)return res.status(502).json({error:'Parse rejected the API key. Check PARSE_API_KEY in Vercel.'});
    if(e?.status===429)return res.status(429).json({error:'Parse rate limit reached. Try Refresh again in a minute.'});
    return res.status(500).json({error:clean(e?.message||'Depop refresh failed')||'Depop refresh failed'});
  }finally{client.release()}
}
