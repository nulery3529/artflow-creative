import crypto from 'node:crypto';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

export const clean = (v='') => String(v ?? '').trim();
export const normalize = (v='') => clean(v).toLowerCase();

export async function session(req){
  return auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
}

export async function profile(client,user){
  const email=normalize(user?.email);
  const r=await client.query(
    `SELECT * FROM artflow.legacy_users WHERE auth_user_id=$1 OR lower(email)=$2
     ORDER BY CASE WHEN auth_user_id=$1 THEN 0 ELSE 1 END,
              created_date NULLS LAST LIMIT 1`,
    [user.id,email]
  );
  return r.rows[0]||null;
}

function businessEmails(row){
  const d=row?.data||{};
  return [row?.primary_email,d.primary_email,...(d.member_emails||[]),...(d.sales_emails||[]),...(d.expense_emails||[])]
    .map(normalize).filter(Boolean);
}

export async function businessForUser(client,p,user){
  const active=p?.active_business_id || p?.data?.active_business_id || null;
  const email=normalize(user?.email);
  const r=await client.query(`SELECT base44_id,name,primary_email,created_by_id,data FROM artflow.businesses ORDER BY name NULLS LAST`);
  const owns=(x)=>Boolean(x && ((email && businessEmails(x).includes(email)) || x.created_by_id===p?.base44_id || x.created_by_id===user?.id));
  const activeRow=r.rows.find(x=>active && x.base44_id===active && owns(x))||null;
  const emailRows=r.rows.filter(x=>owns(x));
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

export function tokenKey(){
  const base=clean(process.env.MARKETPLACE_TOKEN_SECRET || process.env.BETTER_AUTH_SECRET);
  if(!base) throw new Error('Server token encryption is not configured');
  return crypto.createHash('sha256').update(`artflow-marketplace-token-v1:${base}`).digest();
}

export function encrypt(value){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',tokenKey(),iv);
  const encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return [iv,tag,encrypted].map(b=>b.toString('base64url')).join('.');
}

export function decrypt(value){
  const [ivB64,tagB64,dataB64]=String(value||'').split('.');
  if(!ivB64||!tagB64||!dataB64) throw new Error('Stored marketplace token is invalid');
  const decipher=crypto.createDecipheriv('aes-256-gcm',tokenKey(),Buffer.from(ivB64,'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64,'base64url')),decipher.final()]).toString('utf8');
}

export function parseBody(req){
  if(req.body && typeof req.body==='object') return req.body;
  if(typeof req.body==='string'){ try{return JSON.parse(req.body)}catch{} }
  return {};
}

export async function ensureOAuthStateTable(client){
  await client.query(`CREATE TABLE IF NOT EXISTS artflow.marketplace_oauth_states (
    state text PRIMARY KEY,
    business_id text NOT NULL,
    platform text NOT NULL,
    code_verifier text NOT NULL,
    created_at timestamptz DEFAULT now(),
    expires_at timestamptz NOT NULL
  )`);
}

export function localDate(value){
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Indiana/Indianapolis',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get=(type)=>parts.find((p)=>p.type===type)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function sizeFromTitle(title=''){
  const match=clean(title).match(/\b(\d{1,2}(?:\.\d+)?)\s*[x×]\s*(\d{1,2}(?:\.\d+)?)\b/i);
  return match ? `${match[1]}x${match[2]}` : 'Other';
}

export function costsFor(title='',quantity=1){
  const qty=Math.max(1,Number(quantity)||1);
  if(/\bbundle\b/i.test(title)||qty>1){
    const total=Number((qty*1.59+0.40).toFixed(2));
    return {base_item_cost:total,paper_ink_cost:0,packaging_cost:0,total_cost:total};
  }
  const size=sizeFromTitle(title);
  const baseBySize={'4x4':1.00,'4x6':1.25,'5x7':1.50,'8x8':2.00,'8x10':2.00,'11x14':3.00};
  const base=baseBySize[size]??0;
  if(!base) return {base_item_cost:0,paper_ink_cost:0,packaging_cost:0,total_cost:0};
  const paper=0.09;
  const packaging=size==='11x14'?2.00:0.40;
  return {
    base_item_cost:base,
    paper_ink_cost:paper,
    packaging_cost:packaging,
    total_cost:Number((base+paper+packaging).toFixed(2)),
  };
}

export async function insertOrders(client,businessId,rows,syncSource){
  if(!Array.isArray(rows)||!rows.length) return 0;
  const createdBy=(await client.query(
    `SELECT created_by_id FROM artflow.orders WHERE business_id=$1 AND created_by_id IS NOT NULL ORDER BY created_date DESC LIMIT 1`,
    [businessId]
  )).rows[0]?.created_by_id||null;
  const preparedRows=rows.map(row=>{
    const costs=costsFor(row.product_name,row.quantity);
    return {
      platform:String(row.platform||''),
      sale_date:localDate(row.sale_date),
      order_id:row.order_id?String(row.order_id):null,
      product_name:String(row.product_name||''),
      quantity:Math.max(1,Number(row.quantity)||1),
      size:String(row.size||'Other'),
      unit_price:Number(row.unit_price)||0,
      sale_total:Number(row.sale_total)||0,
      buyer:String(row.buyer||''),
      base_item_cost:costs.base_item_cost,
      paper_ink_cost:costs.paper_ink_cost,
      packaging_cost:costs.packaging_cost,
      total_cost:costs.total_cost,
      estimated_profit:Number((Number(row.sale_total||0)-Number(costs.total_cost||0)).toFixed(2)),
    };
  });
  // A marketplace page can repeat an order at a pagination boundary. Remove
  // duplicates inside the incoming batch before PostgreSQL checks existing
  // rows; NOT EXISTS alone cannot see sibling rows from the same INSERT.
  const prepared=[...new Map(preparedRows.map((row)=>{
    const identity=row.order_id
      ? `${row.platform}|order:${row.order_id}`
      : `${row.platform}|${row.sale_date}|${row.product_name.toLowerCase()}|${row.quantity}|${row.sale_total.toFixed(2)}`;
    return [identity,row];
  })).values()];
  const result=await client.query(`
    WITH incoming AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
        platform text, sale_date date, order_id text, product_name text, quantity int, size text,
        unit_price numeric, sale_total numeric, buyer text, base_item_cost numeric, paper_ink_cost numeric,
        packaging_cost numeric, total_cost numeric, estimated_profit numeric
      )
    )
    INSERT INTO artflow.orders (
      base44_id,business_id,sale_date,platform,archived,order_id,source_email_id,created_by_id,created_date,updated_date,data,
      product_name,quantity,size,unit_price,sale_total,buyer,base_item_cost,paper_ink_cost,packaging_cost,total_cost,estimated_profit,sync_source
    )
    SELECT gen_random_uuid()::text,$2,x.sale_date,x.platform,false,x.order_id,null,$3,now(),now(),$4::jsonb,
      x.product_name,x.quantity,x.size,x.unit_price,x.sale_total,x.buyer,x.base_item_cost,x.paper_ink_cost,x.packaging_cost,x.total_cost,x.estimated_profit,$5
    FROM incoming x
    WHERE NOT EXISTS (
      SELECT 1 FROM artflow.orders o
      WHERE o.business_id=$2 AND (
        (x.order_id IS NOT NULL AND x.order_id<>'' AND o.order_id=x.order_id AND o.platform=x.platform) OR
        (o.platform=x.platform AND lower(o.product_name)=lower(x.product_name) AND o.sale_date=x.sale_date AND abs(COALESCE(o.sale_total,0)-x.sale_total)<0.01)
      )
    )
    RETURNING base44_id
  `,[JSON.stringify(prepared),businessId,createdBy,JSON.stringify({source:syncSource}),syncSource]);
  return Number(result.rowCount||0);
}
