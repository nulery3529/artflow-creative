import pg from 'pg';
import crypto from 'node:crypto';
import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

const normalize = (v = '') => String(v || '').trim().toLowerCase();

async function getSession(req) {
  return auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
}

async function getLegacyProfile(client, user) {
  const email = normalize(user?.email);
  if (!email) return null;
  const found = await client.query(
    `SELECT * FROM artflow.legacy_users
     WHERE auth_user_id = $1 OR lower(email) = $2
     ORDER BY CASE WHEN active_business_id IS NOT NULL THEN 0 ELSE 1 END, CASE WHEN auth_user_id = $1 THEN 0 ELSE 1 END, created_date NULLS LAST
     LIMIT 1`,
    [user.id, email]
  );
  let row = found.rows[0] || null;
  if (row && !row.auth_user_id) {
    await client.query(`UPDATE artflow.legacy_users SET auth_user_id=$2 WHERE base44_id=$1`, [row.base44_id, user.id]);
    row.auth_user_id = user.id;
  }

  // A previous auth migration can leave more than one legacy profile for the
  // same email. If the canonical profile already knows the real workspace,
  // inherit that link onto any duplicate instead of letting a later login
  // fall back to a new/empty workspace.
  if (row?.active_business_id) {
    await client.query(
      `UPDATE artflow.legacy_users
          SET active_business_id=$3, updated_date=now()
        WHERE lower(email)=$2
          AND (auth_user_id=$1 OR auth_user_id IS NULL)
          AND active_business_id IS NULL`,
      [user.id, email, row.active_business_id]
    );
  }
  return row;
}

function businessEmails(row) {
  const d = row?.data || {};
  return [
    row?.primary_email,
    d.primary_email,
    ...(d.member_emails || []),
    ...(d.sales_emails || []),
    ...(d.expense_emails || []),
  ].map(normalize).filter(Boolean);
}

function businessMatchesEmail(row, email) {
  return Boolean(email && businessEmails(row).includes(normalize(email)));
}

async function getAccessibleBusinesses(client, profile, user) {
  const email = normalize(user?.email);
  const active = profile?.active_business_id || profile?.data?.active_business_id || null;
  const result = await client.query(`SELECT base44_id, name, primary_email, data FROM artflow.businesses ORDER BY name NULLS LAST`);
  return result.rows.filter((row) => {
    if (active && row.base44_id === active) return true;
    return businessMatchesEmail(row, email);
  });
}

function businessIds(businesses) {
  return Array.from(new Set((businesses || []).map((b) => b.base44_id).filter(Boolean)));
}

async function ensureWorkspace(client, user) {
  let profile = await getLegacyProfile(client, user);
  const email = normalize(user?.email);

  if (!profile) {
    const profileId = `neon-user:${user.id}`;
    await client.query(
      `INSERT INTO artflow.legacy_users
       (base44_id,email,full_name,role,active_business_id,disabled,auth_user_id,created_date,updated_date,data)
       VALUES ($1,$2,$3,'user',NULL,false,$4,now(),now(),'{}'::jsonb)
       ON CONFLICT (base44_id) DO NOTHING`,
      [profileId, user.email, user.name || null, user.id]
    );
    profile = await getLegacyProfile(client, user);
  }

  let businesses = await getAccessibleBusinesses(client, profile, user);
  if (!businesses.length) {
    const businessId = `business:${crypto.randomUUID()}`;
    const data = {
      member_emails: email ? [email] : [],
      sales_emails: email ? [email] : [],
      expense_emails: email ? [email] : [],
      tracked_marketplaces: [],
    };
    await client.query(
      `INSERT INTO artflow.businesses
       (base44_id,name,primary_email,created_by_id,created_date,updated_date,data)
       VALUES ($1,$2,$3,$4,now(),now(),$5::jsonb)`,
      [businessId, user.name ? `${user.name}'s Art Business` : 'My Art Business', user.email, profile?.base44_id || user.id, JSON.stringify(data)]
    );
    if (profile?.base44_id) {
      await client.query(
        `UPDATE artflow.legacy_users SET active_business_id=$2, updated_date=now() WHERE base44_id=$1`,
        [profile.base44_id, businessId]
      );
      profile.active_business_id = businessId;
    }
    businesses = await getAccessibleBusinesses(client, profile, user);
  }

  const ids = businessIds(businesses);
  // Prefer a workspace that explicitly belongs to the signed-in email. This
  // prevents old placeholder "My Business" rows from becoming active merely
  // because they were created during an earlier auth/setup attempt.
  const canonicalBusiness = businesses.find((business) => businessMatchesEmail(business, email)) || null;
  const preferredBusinessId = canonicalBusiness?.base44_id || ids[0] || null;
  if (preferredBusinessId && profile?.base44_id && profile.active_business_id !== preferredBusinessId) {
    await client.query(
      `UPDATE artflow.legacy_users SET active_business_id=$2, updated_date=now() WHERE base44_id=$1`,
      [profile.base44_id, preferredBusinessId]
    );
    profile.active_business_id = preferredBusinessId;
  }
  return { profile, businesses, ids, email };
}

async function countBusinessRows(client, table, ids, email, archivedColumn = false) {
  const params = [ids, email];
  const archived = archivedColumn ? `AND archived IS NOT TRUE` : '';
  const result = await client.query(
    `SELECT count(*)::int AS count
       FROM artflow.${table}
      WHERE (
        business_id = ANY($1::text[])
        OR EXISTS (
          SELECT 1
            FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(data->'access_emails')='array' THEN data->'access_emails' ELSE '[]'::jsonb END) e(value)
           WHERE lower(e.value) = $2
        )
      ) ${archived}`,
    [ids, normalize(email)]
  );
  return result.rows[0]?.count || 0;
}

async function listOrders(client, session) {
  const profile = await getLegacyProfile(client, session.user);
  const businesses = await getAccessibleBusinesses(client, profile, session.user);
  const ids = businessIds(businesses);
  const email = normalize(session.user.email);
  const result = await client.query(
    `SELECT
       base44_id AS id,
       base44_id,
       created_by_id,
       created_date,
       updated_date,
       sale_date,
       platform,
       order_id,
       product_name,
       quantity,
       size,
       unit_price,
       sale_total,
       buyer,
       source_email_id,
       data->>'source_url' AS source_url,
       base_item_cost,
       paper_ink_cost,
       packaging_cost,
       total_cost,
       estimated_profit,
       archived,
       sync_source,
       business_id,
       data
     FROM artflow.orders
     WHERE archived IS NOT TRUE
       AND (
         business_id = ANY($1::text[])
         OR EXISTS (
           SELECT 1
             FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(data->'access_emails')='array' THEN data->'access_emails' ELSE '[]'::jsonb END) e(value)
            WHERE lower(e.value) = $2
         )
       )
     ORDER BY sale_date DESC NULLS LAST, created_date DESC NULLS LAST
     LIMIT 10000`,
    [ids, email]
  );
  return result.rows;
}

async function listExpenses(client, session) {
  const profile = await getLegacyProfile(client, session.user);
  const businesses = await getAccessibleBusinesses(client, profile, session.user);
  const ids = businessIds(businesses);
  const email = normalize(session.user.email);
  const result = await client.query(
    `SELECT
       e.base44_id AS id,
       e.base44_id,
       e.created_by_id,
       e.created_date,
       e.updated_date,
       e.expense_date AS date,
       e.category,
       COALESCE(e.data->>'description', '') AS description,
       e.amount,
       NULLIF(e.data->>'deductible_percent', '')::numeric AS deductible_percent,
       NULLIF(e.data->>'deductible_amount', '')::numeric AS deductible_amount,
       e.source,
       e.receipt_id,
       e.data->>'notes' AS notes,
       e.archived,
       COALESCE(e.data->>'sync_source', e.data->>'source') AS sync_source,
       e.business_id,
       e.data
     FROM artflow.expenses e
     WHERE e.archived IS NOT TRUE
       AND (
         e.business_id = ANY($1::text[])
         OR EXISTS (
           SELECT 1
             FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(e.data->'access_emails')='array' THEN e.data->'access_emails' ELSE '[]'::jsonb END) access(value)
            WHERE lower(access.value) = $2
         )
       )
     ORDER BY e.expense_date DESC NULLS LAST, e.created_date DESC NULLS LAST
     LIMIT 10000`,
    [ids, email]
  );
  return result.rows;
}

async function listInventory(client, session) {
  const profile = await getLegacyProfile(client, session.user);
  const businesses = await getAccessibleBusinesses(client, profile, session.user);
  const ids = businessIds(businesses);
  const result = await client.query(
    `SELECT
       base44_id AS id,
       base44_id,
       business_id,
       name,
       category,
       size,
       base_item_cost,
       paper_ink_cost,
       packaging_cost,
       total_unit_cost,
       quantity_on_hand,
       low_stock_level,
       created_by_id,
       created_date,
       updated_date,
       data->>'image_url' AS image_url,
       data
     FROM artflow.inventory_costs
     WHERE business_id = ANY($1::text[])
     ORDER BY created_date DESC NULLS LAST, name NULLS LAST`,
    [ids]
  );
  return result.rows;
}

function requestBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch {}
  }
  return {};
}

async function writeInventory(client, session, req) {
  const profile = await getLegacyProfile(client, session.user);
  const businesses = await getAccessibleBusinesses(client, profile, session.user);
  const ids = businessIds(businesses);
  if (!ids.length) throw new Error('Business workspace not found');

  const body = requestBody(req);
  const action = String(body.action || '').toLowerCase();
  const numericFields = new Set(['base_item_cost','paper_ink_cost','packaging_cost','total_unit_cost','quantity_on_hand','low_stock_level']);
  const textFields = new Set(['name','category','size']);

  if (action === 'create') {
    const active = profile?.active_business_id || profile?.data?.active_business_id || null;
    const businessId = ids.includes(body.business_id) ? body.business_id : (ids.includes(active) ? active : ids[0]);
    const id = String(body.id || crypto.randomUUID());
    const data = {
      ...(body.data && typeof body.data === 'object' ? body.data : {}),
      ...(Object.prototype.hasOwnProperty.call(body, 'image_url') ? { image_url: body.image_url || null } : {}),
    };
    const values = {
      name: String(body.name || '').trim() || null,
      category: String(body.category || 'Supply').trim() || 'Supply',
      size: body.size == null ? null : String(body.size).trim() || null,
      base_item_cost: Number(body.base_item_cost) || 0,
      paper_ink_cost: Number(body.paper_ink_cost) || 0,
      packaging_cost: Number(body.packaging_cost) || 0,
      total_unit_cost: Number(body.total_unit_cost ?? body.base_item_cost) || 0,
      quantity_on_hand: Number(body.quantity_on_hand) || 0,
      low_stock_level: Number(body.low_stock_level) || 0,
    };
    const inserted = await client.query(
      `INSERT INTO artflow.inventory_costs
       (base44_id,business_id,name,category,size,base_item_cost,paper_ink_cost,packaging_cost,total_unit_cost,quantity_on_hand,low_stock_level,created_by_id,created_date,updated_date,data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now(),$13::jsonb)
       RETURNING base44_id AS id, *`,
      [id,businessId,values.name,values.category,values.size,values.base_item_cost,values.paper_ink_cost,values.packaging_cost,values.total_unit_cost,values.quantity_on_hand,values.low_stock_level,session.user.id,JSON.stringify(data)]
    );
    return inserted.rows[0];
  }

  if (action === 'delete') {
    const id = String(body.id || '').trim();
    if (!id) throw new Error('Inventory item id is required');
    const deleted = await client.query(
      `DELETE FROM artflow.inventory_costs
        WHERE base44_id=$1 AND business_id = ANY($2::text[])
        RETURNING base44_id`,
      [id, ids]
    );
    if (!deleted.rows[0]) throw new Error('Inventory item not found');
    return { id: deleted.rows[0].base44_id, deleted: true };
  }

  if (action === 'update') {
    const id = String(body.id || '').trim();
    if (!id) throw new Error('Inventory item id is required');
    const fields = [];
    const params = [id, ids];
    let p = 3;
    for (const [key, value] of Object.entries(body)) {
      if (textFields.has(key)) {
        fields.push(`${key}=$${p++}`);
        params.push(value == null ? null : String(value).trim() || null);
      } else if (numericFields.has(key)) {
        fields.push(`${key}=$${p++}`);
        params.push(Number(value) || 0);
      } else if (key === 'data' && value && typeof value === 'object') {
        fields.push(`data=COALESCE(data,'{}'::jsonb)||$${p++}::jsonb`);
        params.push(JSON.stringify(value));
      } else if (key === 'image_url') {
        fields.push(`data=COALESCE(data,'{}'::jsonb)||$${p++}::jsonb`);
        params.push(JSON.stringify({ image_url: value || null }));
      }
    }
    if (!fields.length) throw new Error('No inventory fields to update');
    const updated = await client.query(
      `UPDATE artflow.inventory_costs
          SET ${fields.join(', ')}, updated_date=now()
        WHERE base44_id=$1 AND business_id = ANY($2::text[])
        RETURNING base44_id AS id, *`,
      params
    );
    if (!updated.rows[0]) throw new Error('Inventory item not found');
    return updated.rows[0];
  }

  throw new Error('Unknown inventory action');
}

async function listMarketplaceListings(client, session) {
  const profile = await getLegacyProfile(client, session.user);
  const businesses = await getAccessibleBusinesses(client, profile, session.user);
  const ids = businessIds(businesses);
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
  const result = await client.query(
    `SELECT DISTINCT ON (
         platform,
         CASE
           WHEN platform='Vinted' THEN COALESCE(NULLIF(listing_id,''), substring(listing_url from '/items/([0-9]+)'), listing_url)
           ELSE COALESCE(NULLIF(listing_id,''), listing_url)
         END
       )
       id,business_id,platform,listing_id,title,price,currency,image_url,listing_url,status,last_seen_at,sync_source,data
       FROM artflow.marketplace_listings
      WHERE business_id = ANY($1::text[]) AND status IN ('Active','Sold','Inactive')
      ORDER BY
        platform,
        CASE
          WHEN platform='Vinted' THEN COALESCE(NULLIF(listing_id,''), substring(listing_url from '/items/([0-9]+)'), listing_url)
          ELSE COALESCE(NULLIF(listing_id,''), listing_url)
        END,
        last_seen_at DESC NULLS LAST`,
    [ids]
  );
  return result.rows;
}

function userCreatorIds(profile, user) {
  return Array.from(new Set([profile?.base44_id, user?.id].filter(Boolean)));
}

function selectedBusinessId(profile, ids, requested) {
  if (requested && ids.includes(requested)) return requested;
  if (profile?.active_business_id && ids.includes(profile.active_business_id)) return profile.active_business_id;
  return ids[0] || null;
}

async function listArtPieces(client, session) {
  const { profile, email } = await ensureWorkspace(client, session.user);
  const creators = userCreatorIds(profile, session.user);
  const result = await client.query(
    `SELECT base44_id AS id,title,medium,size,price,status,sale_price,sale_date,buyer,platform,created_by_id,created_date,updated_date,data
       FROM artflow.art_pieces
      WHERE created_by_id = ANY($1::text[])
         OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(data->'access_emails')='array' THEN data->'access_emails' ELSE '[]'::jsonb END) e(value) WHERE lower(e.value)=$2)
      ORDER BY created_date DESC NULLS LAST`,
    [creators, email]
  );
  return result.rows.map((row) => ({ ...row, ...(row.data || {}), id: row.id }));
}

async function writeArtPiece(client, session, req) {
  const { profile, email } = await ensureWorkspace(client, session.user);
  const creators = userCreatorIds(profile, session.user);
  const body = requestBody(req);
  const action = String(body.action || '').toLowerCase();
  if (action === 'delete') {
    const deleted = await client.query(
      `DELETE FROM artflow.art_pieces WHERE base44_id=$1 AND (created_by_id = ANY($2::text[]) OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(data->'access_emails')='array' THEN data->'access_emails' ELSE '[]'::jsonb END) e(value) WHERE lower(e.value)=$3)) RETURNING base44_id`,
      [String(body.id || ''), creators, email]
    );
    if (!deleted.rows[0]) throw new Error('Artwork not found');
    return { id: deleted.rows[0].base44_id, deleted: true };
  }
  const id = String(body.id || crypto.randomUUID());
  const data = {
    ...(body.data && typeof body.data === 'object' ? body.data : {}),
    image_url: body.image_url || null,
    notes: body.notes || null,
    access_emails: Array.isArray(body.access_emails) ? body.access_emails : (email ? [email] : []),
  };
  const values = [body.title || null, body.medium || null, body.size || null, Number(body.price) || 0, body.status || 'Available', body.sale_price == null ? null : Number(body.sale_price) || 0, body.sale_date || null, body.buyer || null, body.platform || null, JSON.stringify(data)];
  if (action === 'update') {
    const updated = await client.query(
      `UPDATE artflow.art_pieces SET title=$3,medium=$4,size=$5,price=$6,status=$7,sale_price=$8,sale_date=$9,buyer=$10,platform=$11,data=COALESCE(data,'{}'::jsonb)||$12::jsonb,updated_date=now() WHERE base44_id=$1 AND created_by_id = ANY($2::text[]) RETURNING base44_id AS id,*`,
      [id, creators, ...values]
    );
    if (!updated.rows[0]) throw new Error('Artwork not found');
    return { ...updated.rows[0], ...(updated.rows[0].data || {}) };
  }
  const inserted = await client.query(
    `INSERT INTO artflow.art_pieces (base44_id,title,medium,size,price,status,sale_price,sale_date,buyer,platform,created_by_id,created_date,updated_date,data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now(),$12::jsonb) RETURNING base44_id AS id,*`,
    [id, ...values.slice(0,9), profile?.base44_id || session.user.id, values[9]]
  );
  return { ...inserted.rows[0], ...(inserted.rows[0].data || {}) };
}

async function listMileage(client, session) {
  const { profile, email } = await ensureWorkspace(client, session.user);
  const creators = userCreatorIds(profile, session.user);
  const result = await client.query(
    `SELECT base44_id AS id,log_date AS date,destination,purpose,miles,rate,deduction,created_by_id,created_date,updated_date,data FROM artflow.mileage_logs WHERE created_by_id = ANY($1::text[]) OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(data->'access_emails')='array' THEN data->'access_emails' ELSE '[]'::jsonb END) e(value) WHERE lower(e.value)=$2) ORDER BY log_date DESC NULLS LAST`,
    [creators, email]
  );
  return result.rows.map((row) => ({ ...row, ...(row.data || {}), id: row.id, date: row.date }));
}

async function writeMileage(client, session, req) {
  const { profile, email } = await ensureWorkspace(client, session.user);
  const creators = userCreatorIds(profile, session.user);
  const body = requestBody(req);
  const action = String(body.action || '').toLowerCase();
  const id = String(body.id || crypto.randomUUID());
  if (action === 'delete') {
    const result = await client.query(`DELETE FROM artflow.mileage_logs WHERE base44_id=$1 AND created_by_id = ANY($2::text[]) RETURNING base44_id`, [id, creators]);
    if (!result.rows[0]) throw new Error('Mileage entry not found');
    return { id, deleted: true };
  }
  const data = JSON.stringify({ ...(body.data || {}), notes: body.notes || null, access_emails: Array.isArray(body.access_emails) ? body.access_emails : (email ? [email] : []) });
  if (action === 'update') {
    const result = await client.query(`UPDATE artflow.mileage_logs SET log_date=$3,destination=$4,purpose=$5,miles=$6,rate=$7,deduction=$8,data=COALESCE(data,'{}'::jsonb)||$9::jsonb,updated_date=now() WHERE base44_id=$1 AND created_by_id = ANY($2::text[]) RETURNING base44_id AS id,*`, [id, creators, body.date || null, body.destination || null, body.purpose || null, Number(body.miles) || 0, Number(body.rate) || 0, Number(body.deduction) || 0, data]);
    if (!result.rows[0]) throw new Error('Mileage entry not found');
    return { ...result.rows[0], ...(result.rows[0].data || {}), date: result.rows[0].log_date };
  }
  const result = await client.query(`INSERT INTO artflow.mileage_logs (base44_id,log_date,destination,purpose,miles,rate,deduction,created_by_id,created_date,updated_date,data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now(),$9::jsonb) RETURNING base44_id AS id,*`, [id, body.date || null, body.destination || null, body.purpose || null, Number(body.miles) || 0, Number(body.rate) || 0, Number(body.deduction) || 0, profile?.base44_id || session.user.id, data]);
  return { ...result.rows[0], ...(result.rows[0].data || {}), date: result.rows[0].log_date };
}

async function listSchedule(client, session) {
  const { profile, email } = await ensureWorkspace(client, session.user);
  const creators = userCreatorIds(profile, session.user);
  const result = await client.query(`SELECT base44_id AS id,title,event_date AS date,event_time AS time,type,google_event_id,created_by_id,created_date,updated_date,data FROM artflow.schedule_events WHERE created_by_id = ANY($1::text[]) OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(data->'access_emails')='array' THEN data->'access_emails' ELSE '[]'::jsonb END) e(value) WHERE lower(e.value)=$2) ORDER BY event_date ASC NULLS LAST,event_time ASC NULLS LAST`, [creators,email]);
  return result.rows.map((row) => ({ ...row, ...(row.data || {}), id: row.id, date: row.date, time: row.time }));
}

async function writeSchedule(client, session, req) {
  const { profile, email } = await ensureWorkspace(client, session.user);
  const creators = userCreatorIds(profile, session.user);
  const body = requestBody(req);
  const action = String(body.action || '').toLowerCase();
  const id = String(body.id || crypto.randomUUID());
  if (action === 'delete') {
    const result = await client.query(`DELETE FROM artflow.schedule_events WHERE base44_id=$1 AND created_by_id = ANY($2::text[]) RETURNING base44_id`, [id, creators]);
    if (!result.rows[0]) throw new Error('Event not found');
    return { id, deleted: true };
  }
  const data = JSON.stringify({ ...(body.data || {}), notes: body.notes || '', access_emails: Array.isArray(body.access_emails) ? body.access_emails : (email ? [email] : []) });
  if (action === 'update') {
    const result = await client.query(`UPDATE artflow.schedule_events SET title=$3,event_date=$4,event_time=$5,type=$6,data=COALESCE(data,'{}'::jsonb)||$7::jsonb,updated_date=now() WHERE base44_id=$1 AND created_by_id = ANY($2::text[]) RETURNING base44_id AS id,*`, [id,creators,body.title || null,body.date || null,body.time || '',body.type || 'Other',data]);
    if (!result.rows[0]) throw new Error('Event not found');
    return { ...result.rows[0], ...(result.rows[0].data || {}), date: result.rows[0].event_date, time: result.rows[0].event_time };
  }
  const result = await client.query(`INSERT INTO artflow.schedule_events (base44_id,title,event_date,event_time,type,created_by_id,created_date,updated_date,data) VALUES ($1,$2,$3,$4,$5,$6,now(),now(),$7::jsonb) RETURNING base44_id AS id,*`, [id,body.title || null,body.date || null,body.time || '',body.type || 'Other',profile?.base44_id || session.user.id,data]);
  return { ...result.rows[0], ...(result.rows[0].data || {}), date: result.rows[0].event_date, time: result.rows[0].event_time };
}

async function listBusinesses(client, session) {
  const { businesses } = await ensureWorkspace(client, session.user);
  return businesses.map((row) => ({ id: row.base44_id, ...row.data, name: row.name || row.data?.name || 'Business', primary_email: row.primary_email || row.data?.primary_email || session.user.email }));
}

async function writeBusiness(client, session, req) {
  const { businesses, ids } = await ensureWorkspace(client, session.user);
  const body = requestBody(req);
  const id = String(body.id || '').trim();
  if (!id || !ids.includes(id)) throw new Error('Business workspace not found');
  const current = businesses.find((item) => item.base44_id === id);
  const dataFields = ['member_emails','sales_emails','expense_emails','tracked_marketplaces','spreadsheet_id'];
  const patch = { ...(current?.data || {}) };
  for (const key of dataFields) if (Object.prototype.hasOwnProperty.call(body,key)) patch[key] = body[key];
  const result = await client.query(`UPDATE artflow.businesses SET name=COALESCE($2,name),primary_email=COALESCE($3,primary_email),data=$4::jsonb,updated_date=now() WHERE base44_id=$1 RETURNING base44_id AS id,name,primary_email,data`, [id, body.name || null, body.primary_email || null, JSON.stringify(patch)]);
  return { ...result.rows[0], ...(result.rows[0]?.data || {}) };
}

async function writeExpense(client, session, req) {
  const { profile, ids, email } = await ensureWorkspace(client, session.user);
  const body = requestBody(req);
  const action = String(body.action || '').toLowerCase();
  const id = String(body.id || crypto.randomUUID());
  const businessId = selectedBusinessId(profile, ids, body.business_id);
  if (!businessId) throw new Error('Business workspace not found');
  if (action === 'delete') {
    const result = await client.query(`UPDATE artflow.expenses SET archived=true,updated_date=now() WHERE base44_id=$1 AND business_id = ANY($2::text[]) RETURNING base44_id`, [id,ids]);
    if (!result.rows[0]) throw new Error('Expense not found');
    return { id, deleted: true };
  }
  const data = JSON.stringify({ ...(body.data || {}), description: body.description || '', deductible_percent: body.deductible_percent == null ? 100 : Number(body.deductible_percent), deductible_amount: body.deductible_amount == null ? null : Number(body.deductible_amount), notes: body.notes || null, access_emails: Array.isArray(body.access_emails) ? body.access_emails : (email ? [email] : []) });
  if (action === 'update') {
    const result = await client.query(`UPDATE artflow.expenses SET expense_date=$3,category=$4,amount=$5,source=COALESCE($6,source),data=COALESCE(data,'{}'::jsonb)||$7::jsonb,updated_date=now() WHERE base44_id=$1 AND business_id = ANY($2::text[]) RETURNING base44_id AS id,*`, [id,ids,body.date || null,body.category || null,Number(body.amount)||0,body.source || null,data]);
    if (!result.rows[0]) throw new Error('Expense not found');
    return result.rows[0];
  }
  const result = await client.query(`INSERT INTO artflow.expenses (base44_id,business_id,expense_date,category,amount,archived,source,created_by_id,created_date,updated_date,data) VALUES ($1,$2,$3,$4,$5,false,$6,$7,now(),now(),$8::jsonb) RETURNING base44_id AS id,*`, [id,businessId,body.date||null,body.category||null,Number(body.amount)||0,body.source||'manual',profile?.base44_id||session.user.id,data]);
  return result.rows[0];
}

async function writeOrder(client, session, req) {
  const { profile, ids, email } = await ensureWorkspace(client, session.user);
  const body = requestBody(req);
  const businessId = selectedBusinessId(profile, ids, body.business_id);
  if (!businessId) throw new Error('Business workspace not found');
  const id = String(body.id || crypto.randomUUID());
  const quantity = Math.max(1, Number(body.quantity) || 1);
  const unitPrice = Number(body.unit_price) || 0;
  const saleTotal = body.sale_total == null ? quantity * unitPrice : Number(body.sale_total) || 0;
  const totalCost = Number(body.total_cost) || 0;
  const estimatedProfit = body.estimated_profit == null ? saleTotal - totalCost : Number(body.estimated_profit) || 0;
  const data = JSON.stringify({ ...(body.data || {}), access_emails: Array.isArray(body.access_emails) ? body.access_emails : (email ? [email] : []) });
  const result = await client.query(`INSERT INTO artflow.orders (base44_id,business_id,sale_date,platform,archived,order_id,source_email_id,created_by_id,created_date,updated_date,data,product_name,quantity,size,unit_price,sale_total,buyer,base_item_cost,paper_ink_cost,packaging_cost,total_cost,estimated_profit,sync_source) VALUES ($1,$2,$3,$4,false,$5,$6,$7,now(),now(),$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'manual') RETURNING base44_id AS id,*`, [id,businessId,body.sale_date||null,body.platform||null,body.order_id||null,body.source_email_id||null,profile?.base44_id||session.user.id,data,body.product_name||null,quantity,body.size||null,unitPrice,saleTotal,body.buyer||null,Number(body.base_item_cost)||0,Number(body.paper_ink_cost)||0,Number(body.packaging_cost)||0,totalCost,estimatedProfit]);
  return result.rows[0];
}

async function summary(client, session) {
  const { profile, businesses, ids } = await ensureWorkspace(client, session.user);
  const [orders, expenses, emailImports, syncStates] = await Promise.all([
    countBusinessRows(client, 'orders', ids, session.user.email, true),
    countBusinessRows(client, 'expenses', ids, session.user.email, true),
    countBusinessRows(client, 'email_import_messages', ids, session.user.email, false),
    countBusinessRows(client, 'sync_states', ids, session.user.email, false),
  ]);

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name || profile?.full_name || null,
      legacyProfileLinked: Boolean(profile),
      legacyProfileId: profile?.base44_id || null,
      activeBusinessId: profile?.active_business_id || profile?.data?.active_business_id || null,
    },
    businesses: businesses.map((b) => ({ id: b.base44_id, name: b.name || b.data?.name || 'Business' })),
    counts: { orders, expenses, emailImports, syncStates },
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const session = await getSession(req).catch(() => null);
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const client = await pool.connect();
  try {
    const op = String(req.query?.op || 'summary');
    if (req.method === 'POST') {
      if (op === 'inventory') return res.status(200).json({ item: await writeInventory(client, session, req) });
      if (op === 'expenses') return res.status(200).json({ item: await writeExpense(client, session, req) });
      if (op === 'orders') return res.status(200).json({ item: await writeOrder(client, session, req) });
      if (op === 'art-pieces') return res.status(200).json({ item: await writeArtPiece(client, session, req) });
      if (op === 'mileage') return res.status(200).json({ item: await writeMileage(client, session, req) });
      if (op === 'schedule') return res.status(200).json({ item: await writeSchedule(client, session, req) });
      if (op === 'businesses') return res.status(200).json({ item: await writeBusiness(client, session, req) });
      return res.status(405).json({ error: 'Method not allowed' });
    }
    if (op === 'summary') return res.status(200).json(await summary(client, session));
    if (op === 'orders') return res.status(200).json({ orders: await listOrders(client, session) });
    if (op === 'expenses') return res.status(200).json({ expenses: await listExpenses(client, session) });
    if (op === 'inventory') return res.status(200).json({ inventory: await listInventory(client, session) });
    if (op === 'listings') return res.status(200).json({ listings: await listMarketplaceListings(client, session) });
    if (op === 'art-pieces') return res.status(200).json({ records: await listArtPieces(client, session) });
    if (op === 'mileage') return res.status(200).json({ records: await listMileage(client, session) });
    if (op === 'schedule') return res.status(200).json({ records: await listSchedule(client, session) });
    if (op === 'businesses') return res.status(200).json({ records: await listBusinesses(client, session) });
    return res.status(400).json({ error: 'Unknown operation' });
  } catch (e) {
    console.error('neon data error', e?.message || e);
    return res.status(500).json({ error: 'Data request failed' });
  } finally {
    client.release();
  }
}
