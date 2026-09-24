import pg from "pg";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth/_auth.mjs";
import { pooledDatabaseUrl } from "./_db.mjs";

const { Pool } = pg;
const pool = new Pool({
  connectionString: pooledDatabaseUrl(),
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const normalize = (value = "") => String(value || "").trim().toLowerCase();
const list = (value) => Array.isArray(value) ? value : [];

function withoutEmail(values, email) {
  return Array.from(new Set(list(values).map(normalize).filter((value) => value && value !== email)));
}

function businessEmails(row) {
  const data = row?.data || {};
  return [
    row?.primary_email,
    data.primary_email,
    ...list(data.member_emails),
    ...list(data.sales_emails),
    ...list(data.expense_emails),
  ].map(normalize).filter(Boolean);
}

function hasOtherMembers(row, email) {
  return withoutEmail(row?.data?.member_emails, email).length > 0;
}

async function deleteOwnedWorkspaceData(client, businessIds) {
  if (!businessIds.length) return;

  // Storefront records first. Foreign keys cascade where configured, but the
  // explicit deletes keep account deletion deterministic across old schemas.
  await client.query(
    `DELETE FROM artflow.store_payments
      WHERE order_id IN (SELECT id FROM artflow.store_orders WHERE business_id = ANY($1::text[]))`,
    [businessIds]
  );
  await client.query(
    `DELETE FROM artflow.store_order_items
      WHERE order_id IN (SELECT id FROM artflow.store_orders WHERE business_id = ANY($1::text[]))`,
    [businessIds]
  );
  await client.query(`DELETE FROM artflow.store_orders WHERE business_id = ANY($1::text[])`, [businessIds]);
  await client.query(
    `DELETE FROM artflow.store_cart_items
      WHERE product_id IN (SELECT id FROM artflow.store_products WHERE business_id = ANY($1::text[]))`,
    [businessIds]
  );
  await client.query(
    `DELETE FROM artflow.store_wishlist_items
      WHERE product_id IN (SELECT id FROM artflow.store_products WHERE business_id = ANY($1::text[]))`,
    [businessIds]
  );
  await client.query(`DELETE FROM artflow.store_products WHERE business_id = ANY($1::text[])`, [businessIds]);
  await client.query(`DELETE FROM artflow.store_categories WHERE business_id = ANY($1::text[])`, [businessIds]);
  await client.query(
    `DELETE FROM artflow.store_addresses
      WHERE customer_id IN (SELECT id FROM artflow.store_customers WHERE business_id = ANY($1::text[]))`,
    [businessIds]
  );
  await client.query(`DELETE FROM artflow.store_customers WHERE business_id = ANY($1::text[])`, [businessIds]);

  // Art Flow business records and connector history.
  await client.query(`DELETE FROM artflow.email_import_messages WHERE business_id = ANY($1::text[])`, [businessIds]);
  await client.query(`DELETE FROM artflow.marketplace_listings WHERE business_id = ANY($1::text[])`, [businessIds]);
  await client.query(`DELETE FROM artflow.expenses WHERE business_id = ANY($1::text[])`, [businessIds]);
  await client.query(`DELETE FROM artflow.orders WHERE business_id = ANY($1::text[])`, [businessIds]);
  await client.query(`DELETE FROM artflow.inventory_costs WHERE business_id = ANY($1::text[])`, [businessIds]);
  await client.query(`DELETE FROM artflow.businesses WHERE base44_id = ANY($1::text[])`, [businessIds]);
}

async function unlinkSharedWorkspace(client, row, email) {
  const current = row?.data && typeof row.data === "object" ? row.data : {};
  const otherMembers = withoutEmail(current.member_emails, email);
  const next = {
    ...current,
    member_emails: otherMembers,
    sales_emails: withoutEmail(current.sales_emails, email),
    expense_emails: withoutEmail(current.expense_emails, email),
  };

  if (normalize(next.primary_email) === email) {
    if (otherMembers[0]) next.primary_email = otherMembers[0];
    else delete next.primary_email;
  }

  if (normalize(next?.yahoo_mail?.email) === email) {
    delete next.yahoo_mail;
  }

  const nextPrimary = normalize(row.primary_email) === email
    ? (otherMembers[0] || null)
    : row.primary_email;

  await client.query(
    `UPDATE artflow.businesses
        SET primary_email=$2, data=$3::jsonb, updated_date=now()
      WHERE base44_id=$1`,
    [row.base44_id, nextPrimary, JSON.stringify(next)]
  );
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }).catch(() => null);
  const user = session?.user;
  const email = normalize(user?.email);
  if (!user?.id || !email) return res.status(401).json({ error: "Unauthorized" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const profileResult = await client.query(
      `SELECT base44_id, auth_user_id, email, active_business_id, data
         FROM artflow.legacy_users
        WHERE auth_user_id=$1 OR lower(email)=$2
        ORDER BY CASE WHEN auth_user_id=$1 THEN 0 ELSE 1 END, created_date NULLS LAST
        LIMIT 1`,
      [user.id, email]
    );
    const profile = profileResult.rows[0] || null;
    const creatorIds = Array.from(new Set([user.id, profile?.base44_id].filter(Boolean)));

    const businessResult = await client.query(
      `SELECT base44_id, primary_email, created_by_id, data
         FROM artflow.businesses`
    );

    const accessible = businessResult.rows.filter((row) =>
      businessEmails(row).includes(email)
      || creatorIds.includes(row.created_by_id)
    );

    const deleteIds = [];
    for (const row of accessible) {
      const owns = creatorIds.includes(row.created_by_id) || normalize(row.primary_email) === email;
      if (owns && !hasOtherMembers(row, email)) {
        deleteIds.push(row.base44_id);
      } else {
        await unlinkSharedWorkspace(client, row, email);
      }
    }

    await deleteOwnedWorkspaceData(client, deleteIds);

    const accessEmailPredicate = `
      EXISTS (
        SELECT 1
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(data->'access_emails')='array'
                 THEN data->'access_emails'
                 ELSE '[]'::jsonb END
          ) access(value)
         WHERE lower(access.value)=$2
      )`;

    if (creatorIds.length) {
      await client.query(
        `DELETE FROM artflow.art_pieces
          WHERE created_by_id = ANY($1::text[]) OR ${accessEmailPredicate}`,
        [creatorIds, email]
      );
      await client.query(
        `DELETE FROM artflow.mileage_logs
          WHERE created_by_id = ANY($1::text[]) OR ${accessEmailPredicate}`,
        [creatorIds, email]
      );
      await client.query(
        `DELETE FROM artflow.schedule_events
          WHERE created_by_id = ANY($1::text[]) OR ${accessEmailPredicate}`,
        [creatorIds, email]
      );
    }

    await client.query(
      `DELETE FROM artflow.legacy_users
        WHERE auth_user_id=$1 OR lower(email)=$2 OR base44_id = ANY($3::text[])`,
      [user.id, email, creatorIds]
    );

    await client.query("COMMIT");
    return res.status(200).json({
      ok: true,
      deleted_workspaces: deleteIds.length,
      unlinked_shared_workspaces: accessible.length - deleteIds.length,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Art Flow account data deletion failed", error);
    return res.status(500).json({ error: "Could not delete all Art Flow account data." });
  } finally {
    client.release();
  }
}
