import pg from 'pg';
import crypto from 'node:crypto';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
const SUPPORTED = ['Vinted','Depop','Etsy','eBay'];
const normalize = (v='') => String(v||'').trim().toLowerCase();
const clean = (v='') => String(v||'').trim();

function validPlatform(value='') {
  if (/vinted/i.test(value)) return 'Vinted';
  if (/depop/i.test(value)) return 'Depop';
  if (/etsy/i.test(value)) return 'Etsy';
  if (/ebay/i.test(value)) return 'eBay';
  return '';
}
function sourceHostMatches(platform, raw='') {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (platform === 'Vinted') return host === 'vinted.com' || host.endsWith('.vinted.com');
    if (platform === 'Depop') return host === 'depop.com' || host.endsWith('.depop.com');
    if (platform === 'Etsy') return host === 'etsy.com' || host.endsWith('.etsy.com');
    if (platform === 'eBay') return host === 'ebay.com' || host.endsWith('.ebay.com');
  } catch {}
  return false;
}
function listingIdFromUrl(platform, raw='') {
  try {
    const p = new URL(raw).pathname;
    if (platform === 'Vinted') return p.match(/\/items\/(\d+)/i)?.[1] || '';
    if (platform === 'Depop') return p.match(/\/products\/([^/?#]+)/i)?.[1] || '';
    if (platform === 'Etsy') return p.match(/\/listing\/(\d+)/i)?.[1] || '';
    if (platform === 'eBay') return p.match(/\/itm\/(?:[^/]+\/)?(\d{8,16})/i)?.[1] || '';
  } catch {}
  return '';
}
function normalizeUrl(raw='') {
  try {
    const u = new URL(clean(raw)); u.hash='';
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','mkcid','mkrid','campid','customid','toolid'].forEach(k=>u.searchParams.delete(k));
    return u.toString().replace(/\/$/,'');
  } catch { return clean(raw); }
}
function inferSize(value='') {
  const m = String(value).match(/\b(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?)\b/i);
  return m ? m[1].replace(/\s+/g,'').replace('×','x') : 'Unknown';
}
function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch {} }
  return {};
}
async function ensureTable(client) {
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
async function session(req) { return auth.api.getSession({ headers: fromNodeHeaders(req.headers) }); }
async function profile(client, user) {
  const email = normalize(user?.email);
  const r = await client.query(`SELECT * FROM artflow.legacy_users WHERE auth_user_id=$1 OR lower(email)=$2 ORDER BY CASE WHEN auth_user_id=$1 THEN 0 ELSE 1 END LIMIT 1`, [user.id,email]);
  return r.rows[0] || null;
}
function businessEmails(row) {
  const d=row?.data||{};
  return [row?.primary_email,d.primary_email,...(d.member_emails||[]),...(d.sales_emails||[]),...(d.expense_emails||[])].map(normalize).filter(Boolean);
}
async function businessForUser(client, p, user) {
  const active=p?.active_business_id || p?.data?.active_business_id || null;
  const email=normalize(user?.email);
  const r=await client.query(`SELECT base44_id,name,primary_email,data FROM artflow.businesses ORDER BY name NULLS LAST`);
  const activeRow=r.rows.find(x=>active && x.base44_id===active) || null;
  const emailRows=r.rows.filter(x=>email && businessEmails(x).includes(email));
  const isPlaceholder=(row)=>{
    if (!row) return false;
    const d=row.data||{};
    return businessEmails(row).length===0 && !d.spreadsheet_id && !d.spreadsheetId && /^my business$/i.test(String(row.name||'').trim());
  };
  const canonical=emailRows.find((row)=>{
    const d=row.data||{};
    return Boolean(d.spreadsheet_id || d.spreadsheetId || (Array.isArray(d.tracked_marketplaces) && d.tracked_marketplaces.length));
  }) || emailRows[0] || null;
  const chosen=isPlaceholder(activeRow) && canonical ? canonical : (activeRow || canonical || null);
  if (chosen && p?.base44_id && activeRow && chosen.base44_id!==activeRow.base44_id && isPlaceholder(activeRow)) {
    await client.query(`UPDATE artflow.legacy_users SET active_business_id=$2 WHERE base44_id=$1`,[p.base44_id,chosen.base44_id]);
  }
  return chosen;
}
async function businessForKey(client, key) {
  const r=await client.query(`SELECT base44_id,name,primary_email,data FROM artflow.businesses WHERE data->>'extension_sync_key'=$1 AND COALESCE((data->>'extension_sync_enabled')::boolean,true)=true LIMIT 1`, [key]);
  return r.rows[0] || null;
}
async function ensureKey(client, business) {
  const data=business.data||{};
  if (data.extension_sync_key) return { key:data.extension_sync_key, enabled:data.extension_sync_enabled !== false };
  const key=`af_${crypto.randomBytes(32).toString('hex')}`;
  const next={...data,extension_sync_key:key,extension_sync_enabled:true};
  await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`,[business.base44_id,JSON.stringify(next)]);
  business.data=next;
  return { key, enabled:true };
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','content-type');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  const client=await pool.connect();
  try {
    await ensureTable(client);
    const body=parseBody(req);
    if (req.method === 'GET') {
      const s=await session(req).catch(()=>null);
      if (!s?.user) return res.status(401).json({error:'Unauthorized'});
      const p=await profile(client,s.user); const b=await businessForUser(client,p,s.user);
      if (!b) return res.status(404).json({error:'Business workspace not found'});
      if (String(req.query?.op||'') === 'listings') {
        const r=await client.query(`SELECT id,business_id,platform,listing_id,title,price,currency,image_url,listing_url,status,last_seen_at,sync_source FROM artflow.marketplace_listings WHERE business_id=$1 AND status='Active' ORDER BY platform,title`,[b.base44_id]);
        return res.status(200).json({listings:r.rows});
      }
      const k=await ensureKey(client,b);
      return res.status(200).json({key:k.key,enabled:k.enabled,supported:SUPPORTED});
    }

    const action=String(body.action||'listings');
    if (action === 'settings') {
      const s=await session(req).catch(()=>null);
      if (!s?.user) return res.status(401).json({error:'Unauthorized'});
      const p=await profile(client,s.user); const b=await businessForUser(client,p,s.user);
      if (!b) return res.status(404).json({error:'Business workspace not found'});
      const current=await ensureKey(client,b);
      const next={...(b.data||{}),extension_sync_key:current.key,extension_sync_enabled:body.enabled !== false};
      await client.query(`UPDATE artflow.businesses SET data=$2::jsonb WHERE base44_id=$1`,[b.base44_id,JSON.stringify(next)]);
      return res.status(200).json({ok:true,key:current.key,enabled:next.extension_sync_enabled});
    }

    const key=clean(body.sync_key);
    if (!key) return res.status(400).json({error:'Missing sync key'});
    const b=await businessForKey(client,key);
    if (!b) return res.status(401).json({error:'Invalid Art Flow Browser Sync key'});

    if (action === 'listings') {
      const snapshotPlatform=body.snapshot_complete ? validPlatform(body.snapshot_platform||body.platform) : '';
      const incoming=Array.isArray(body.listings)?body.listings.slice(0,5000):[];
      if (!incoming.length && !snapshotPlatform) return res.status(400).json({error:'No listings found'});

      let skipped=0,deactivated=0;
      const deduped=new Map();
      for (const raw of incoming) {
        const platform=validPlatform(raw?.platform), url=normalizeUrl(raw?.listing_url||raw?.url), title=clean(raw?.title||raw?.product_name).slice(0,300);
        if (!platform || !url || !title || !sourceHostMatches(platform,url)) { skipped++; continue; }
        const priceNum=Number(String(raw?.price??'').replace(/[^0-9.-]/g,''));
        const price=Number.isFinite(priceNum)&&priceNum>=0?priceNum:0;
        const listingId=clean(raw?.listing_id||listingIdFromUrl(platform,url)).slice(0,200);
        const image=/^https?:\/\//i.test(clean(raw?.image_url))?clean(raw.image_url).slice(0,2000):null;
        const id=crypto.createHash('sha256').update(`${b.base44_id}|${platform}|${url}`).digest('hex');
        deduped.set(`${platform}|${url}`,{
          id,platform,listing_id:listingId||null,title,price,
          currency:clean(raw?.currency||'USD')||'USD',image_url:image,listing_url:url,
        });
      }

      const rows=[...deduped.values()];
      if (rows.length) {
        await client.query(`
          WITH incoming AS (
            SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
              id text, platform text, listing_id text, title text, price numeric,
              currency text, image_url text, listing_url text
            )
          )
          INSERT INTO artflow.marketplace_listings
            (id,business_id,platform,listing_id,title,price,currency,image_url,listing_url,status,last_seen_at,sync_source,data)
          SELECT id,$2,platform,listing_id,title,price,currency,image_url,listing_url,'Active',now(),'browser_listing_sync','{}'::jsonb
          FROM incoming
          ON CONFLICT (business_id,platform,listing_url) DO UPDATE SET
            listing_id=EXCLUDED.listing_id,
            title=EXCLUDED.title,
            price=EXCLUDED.price,
            currency=EXCLUDED.currency,
            image_url=COALESCE(NULLIF(EXCLUDED.image_url,''),artflow.marketplace_listings.image_url),
            status='Active',
            last_seen_at=now(),
            sync_source='browser_listing_sync'
        `,[JSON.stringify(rows),b.base44_id]);
      }

      const snapshotUrls=snapshotPlatform
        ? rows.filter((row)=>row.platform===snapshotPlatform).map((row)=>row.listing_url)
        : [];
      if (snapshotPlatform) {
        const result=snapshotUrls.length
          ? await client.query(`UPDATE artflow.marketplace_listings SET status='Inactive',last_seen_at=now(),sync_source='browser_listing_snapshot' WHERE business_id=$1 AND platform=$2 AND status='Active' AND NOT (listing_url = ANY($3::text[]))`,[b.base44_id,snapshotPlatform,snapshotUrls])
          : await client.query(`UPDATE artflow.marketplace_listings SET status='Inactive',last_seen_at=now(),sync_source='browser_listing_snapshot' WHERE business_id=$1 AND platform=$2 AND status='Active'`,[b.base44_id,snapshotPlatform]);
        deactivated=Number(result.rowCount||0);
      }
      const saved=rows.length;
      return res.status(200).json({ok:true,saved,skipped,deactivated,message:`${saved} current listing${saved===1?'':'s'} linked to your Gallery${deactivated?` · ${deactivated} no longer active`:''}.`});
    }

    if (action === 'order') {
      const raw=body.order||{}; const platform=validPlatform(raw.platform); const title=clean(raw.product_name||raw.title).slice(0,300);
      const total=Number(raw.sale_total??raw.price??0); const qty=Math.max(1,Math.min(50,Number(raw.quantity)||1));
      const sourceUrl=clean(raw.source_url); const saleDate=/^20\d{2}-\d{2}-\d{2}$/.test(String(raw.sale_date||''))?String(raw.sale_date):new Date().toISOString().slice(0,10);
      if (!platform || !title || !Number.isFinite(total) || total<=0 || (sourceUrl && !sourceHostMatches(platform,sourceUrl))) return res.status(400).json({error:'Invalid order details'});
      const orderId=clean(raw.order_id).slice(0,160); const fp=crypto.createHash('sha256').update([platform,orderId,saleDate,total.toFixed(2),normalize(title),normalize(sourceUrl)].join('|')).digest('hex');
      const sourceId=`browser:${fp}`;
      const exists=await client.query(`SELECT base44_id FROM artflow.orders WHERE business_id=$1 AND archived IS NOT TRUE AND (source_email_id=$2 OR ($3<>'' AND order_id=$3 AND lower(platform)=lower($4))) LIMIT 1`,[b.base44_id,sourceId,orderId,platform]);
      if (exists.rows[0]) return res.status(200).json({ok:true,created:0,message:'This sale is already in Art Flow.'});
      const id=crypto.randomUUID(), now=new Date(), size=inferSize(title), unit=total/qty;
      const accessEmails=businessEmails(b);
      const data={access_emails:accessEmails,source_url:sourceUrl||null,source:'browser_sync'};
      await client.query(`INSERT INTO artflow.orders (base44_id,created_date,updated_date,sale_date,platform,order_id,product_name,quantity,size,unit_price,sale_total,buyer,source_email_id,base_item_cost,paper_ink_cost,packaging_cost,total_cost,estimated_profit,archived,sync_source,business_id,data)
        VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,0,0,0,$10,false,'browser_sync',$13,$14::jsonb)`,
        [id,now,saleDate,platform,orderId||null,title,qty,size,unit,total,clean(raw.buyer)||null,sourceId,b.base44_id,JSON.stringify(data)]);
      return res.status(200).json({ok:true,created:1,message:'Sale sent to Art Flow.'});
    }

    return res.status(400).json({error:'Unknown Browser Sync action'});
  } catch (e) {
    console.error('browser sync error',e?.message||e);
    return res.status(500).json({error:'Browser Sync request failed'});
  } finally { client.release(); }
}
