import pg from 'pg';
import getRawBody from 'raw-body';
import { Resend } from 'resend';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

const resend = new Resend(process.env.RESEND_API_KEY);

export const config = {
  api: {
    bodyParser: false,
  },
};

const clean = (value = '') => String(value ?? '').replace(/\r/g, '').trim();

function addressOnly(value = '') {
  const text = clean(value).toLowerCase();
  const angle = text.match(/<([^>]+)>/);
  return clean(angle?.[1] || text).replace(/^mailto:/, '');
}

function htmlToText(value = '') {
  return clean(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#36;/gi, '$')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function localDate(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Indiana/Indianapolis',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function configuredExpenseEmails(config = {}) {
  const data = config?.business_data || {};
  return (Array.isArray(data.expense_emails) ? data.expense_emails : [])
    .map(addressOnly)
    .filter(Boolean);
}

function forwardedFromAddress(text = '') {
  const matches = [...String(text || '').matchAll(/(?:^|\n)\s*From:\s*([^\n]+)/gim)];
  for (const match of matches) {
    const email = addressOnly(match?.[1] || '');
    if (email) return email;
  }
  return '';
}

function originalSubject(subject = '') {
  return clean(subject).replace(/^(?:(?:fwd?|fw):\s*)+/i, '');
}

function parseMoney(value = '') {
  const amount = Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : 0;
}

function extractTotal(text = '') {
  const normalized = String(text || '').replace(/\u00a0/g, ' ');
  const patterns = [
    /(?:order\s+total|grand\s+total|payment\s+total|purchase\s+total)\s*[:\-]?\s*(?:USD\s*)?\$\s*([\d,]+\.\d{2})/i,
    /(?:amount\s+(?:paid|charged)|total\s+(?:paid|charged)|you\s+(?:paid|were\s+charged))\s*[:\-]?\s*(?:USD\s*)?\$\s*([\d,]+\.\d{2})/i,
    /(?:order\s+total|grand\s+total|payment\s+total|purchase\s+total)\s*[:\-]?\s*USD\s*([\d,]+\.\d{2})/i,
    /(?:^|\n)\s*total\s*[:\-]?\s*(?:USD\s*)?\$\s*([\d,]+\.\d{2})\b/im,
    /(?:^|\n)\s*total\s*[:\-]?\s*USD\s*([\d,]+\.\d{2})\b/im,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const amount = parseMoney(match?.[1] || '');
    if (amount) return amount;
  }
  return 0;
}

function looksLikeExpense(subject = '', text = '') {
  const haystack = `${subject}\n${text}`.toLowerCase();
  const commerceSignal = /\b(receipt|invoice|order|purchase|payment|paid|charged|transaction|thank you for your (?:order|purchase)|order total|grand total|amount paid)\b/i.test(haystack);
  return commerceSignal && extractTotal(haystack) > 0;
}

function categoryFor(subject = '', text = '') {
  const value = `${subject}\n${text}`.toLowerCase();
  if (/\b(camera|lens|tripod|photo light|light box|photography|backdrop)\b/.test(value)) return 'Photography Equipment';
  if (/\b(picture frame|photo frame|frames|framed|display stand|easel|magnetic frame|acrylic frame)\b/.test(value)) return 'Frames & Display';
  if (/\b(printer ink|ink cartridge|cartridge|toner|cli-\d+|pgi-\d+|refill ink)\b/.test(value)) return 'Ink & Printing Supplies';
  if (/\b(photo paper|printer paper|matte paper|glossy paper|cardstock|print media|canvas sheet|sticker paper)\b/.test(value)) return 'Paper & Print Media';
  if (/\b(poly mailer|mailer|mailing box|shipping box|envelope|bubble mailer|packing tape|packaging|protective sleeve|cellophane sleeve|packing supply)\b/.test(value)) return 'Packaging & Shipping Supplies';
  if (/\b(postage|shipping label|usps|ups shipping|fedex shipping|postal)\b/.test(value)) return 'Shipping & Postage';
  if (/\b(printer|laminator|paper cutter|trimmer|cutting machine|cricut|tool|equipment|tablet)\b/.test(value)) return 'Equipment & Tools';
  if (/\b(subscription|software|hosting|domain renewal|base44|vercel|wix|adobe|canva)\b/.test(value)) return 'Software & Subscriptions';
  if (/\b(phone bill|mobile service|wireless|internet service|visible wireless|cellular)\b/.test(value)) return 'Phone / Internet';
  if (/\b(advertising|advertisement|facebook ads|meta ads|instagram ads|promoted listing|marketing)\b/.test(value)) return 'Advertising & Marketing';
  if (/\b(art kit|art supply|paint|paintbrush|brush set|marker|colored pencil|pencil set|watercolor|acrylic paint|glue|adhesive|craft supply|quilling)\b/.test(value)) return 'Art Materials & Supplies';
  if (/\b(office supply|office supplies|desk|filing|label maker)\b/.test(value)) return 'Office & Business';
  return 'Other Business Expense';
}

function sourceName(subject = '', text = '', sender = '') {
  const forwarded = forwardedFromAddress(text);
  const sourceEmail = forwarded || sender;
  const domain = sourceEmail.split('@')[1] || '';
  const merchant = domain.split('.')[0] || '';
  if (merchant) return merchant.charAt(0).toUpperCase() + merchant.slice(1) + ' receipt';
  const subjectMerchant = originalSubject(subject).split(/[-|:]/)[0].trim();
  return subjectMerchant && subjectMerchant.length <= 60 ? subjectMerchant : 'Email receipt';
}

async function readWebhookConfigs(client) {
  const result = await client.query(`
    SELECT s.business_id, s.data, b.primary_email, b.created_by_id, b.data AS business_data
    FROM artflow.sync_states s
    LEFT JOIN artflow.businesses b ON b.base44_id = s.business_id
    WHERE s.source='resend_inbound_expenses'
      AND COALESCE(s.status, 'configured') IN ('configured','active')
    ORDER BY s.updated_date DESC NULLS LAST, s.created_date DESC NULLS LAST
  `);
  return result.rows;
}

async function recordImport(client, { businessId, emailId, status, details, createdBy }) {
  await client.query(`
    INSERT INTO artflow.email_import_messages (
      base44_id,business_id,message_id,import_type,status,platform,created_by_id,created_date,updated_date,data
    )
    SELECT gen_random_uuid()::text,$1,$2,'expense',$3,NULL,$4,now(),now(),$5::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM artflow.email_import_messages
      WHERE business_id=$1 AND message_id=$2 AND import_type='expense'
    )
  `,[businessId,emailId,status,createdBy,JSON.stringify({
    source: 'resend_inbound_expenses',
    details,
    parser_version: 1,
  })]);
}

async function insertExpense(client, config, emailId, receivedAt, subject, text, sender) {
  const amount = extractTotal(`${subject}\n${text}`);
  const category = categoryFor(subject, text);
  const description = originalSubject(subject).slice(0, 240) || 'Email receipt';
  const source = sourceName(subject, text, sender).slice(0, 120);
  const createdBy = config.created_by_id || null;

  const result = await client.query(`
    INSERT INTO artflow.expenses (
      base44_id,business_id,expense_date,category,amount,archived,source,receipt_id,created_by_id,created_date,updated_date,data
    )
    SELECT gen_random_uuid()::text,$1,$2,$3,$4,false,$5,$6,$7,now(),now(),$8::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM artflow.expenses
      WHERE business_id=$1 AND receipt_id=$6
    )
    RETURNING base44_id,expense_date,category,amount,source
  `,[
    config.business_id,
    localDate(receivedAt),
    category,
    amount,
    source,
    `resend:${emailId}`,
    createdBy,
    JSON.stringify({
      source: 'resend_inbound_expenses',
      sync_source: 'resend_inbound_expenses',
      source_email: sender,
      resend_email_id: emailId,
      description,
      deductible_percent: 100,
      deductible_amount: amount,
    }),
  ]);

  await recordImport(client, {
    businessId: config.business_id,
    emailId,
    status: result.rows[0] ? 'imported' : 'skipped',
    details: result.rows[0] ? `Imported expense: ${description}` : 'Duplicate expense email',
    createdBy,
  });

  return result.rows[0] || null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (error) {
    console.error('Inbound expense email: could not read raw body', error?.message || error);
    return res.status(400).send('Error');
  }

  const client = await pool.connect();
  try {
    const configs = await readWebhookConfigs(client);
    const webhookSecret = clean(configs.find((row) => row.data?.webhook_secret)?.data?.webhook_secret || process.env.RESEND_EXPENSE_WEBHOOK_SECRET);
    if (!webhookSecret) {
      console.error('Inbound expense email: webhook secret is not configured');
      return res.status(503).send('Not configured');
    }

    const event = resend.webhooks.verify({
      payload: rawBody.toString('utf8'),
      headers: {
        'svix-id': req.headers['svix-id'],
        'svix-timestamp': req.headers['svix-timestamp'],
        'svix-signature': req.headers['svix-signature'],
      },
      secret: webhookSecret,
    });

    if (event?.type !== 'email.received') return res.status(200).send('OK');

    const recipients = (Array.isArray(event?.data?.to) ? event.data.to : [event?.data?.to])
      .map(addressOnly)
      .filter(Boolean);
    const config = configs.find((row) => recipients.includes(addressOnly(row.data?.inbound_email)));
    if (!config?.business_id) {
      console.warn('Inbound expense email: no business mapping for recipient');
      return res.status(200).send('OK');
    }

    const emailId = clean(event?.data?.email_id || '');
    if (!emailId) return res.status(200).send('OK');

    const alreadyProcessed = await client.query(`
      SELECT 1 FROM artflow.email_import_messages
      WHERE business_id=$1 AND message_id=$2 AND import_type='expense'
      LIMIT 1
    `,[config.business_id,emailId]);
    if (alreadyProcessed.rowCount) return res.status(200).send('OK');

    const received = await resend.emails.receiving.get(emailId);
    const email = received?.data || received;
    const subject = clean(email?.subject || event?.data?.subject || '');
    const text = clean(email?.text || htmlToText(email?.html || ''));
    const sender = addressOnly(event?.data?.from || email?.from || '');
    const allowedForwarders = configuredExpenseEmails(config);

    // Manual forwards from a configured expense mailbox are explicitly trusted.
    // Automatic mailbox forwarding can preserve the original merchant From header,
    // so messages to this private business-specific alias are also accepted only when
    // they pass conservative receipt + total detection below.
    const fromConfiguredExpenseMailbox = allowedForwarders.includes(sender);
    const receiptLike = looksLikeExpense(subject, text);

    if (!receiptLike) {
      await recordImport(client, {
        businessId: config.business_id,
        emailId,
        status: 'skipped',
        details: 'Email did not contain a recognizable business expense receipt total',
        createdBy: config.created_by_id || null,
      });
      return res.status(200).send('OK');
    }

    if (!fromConfiguredExpenseMailbox && !allowedForwarders.length) {
      await recordImport(client, {
        businessId: config.business_id,
        emailId,
        status: 'skipped',
        details: 'No expense mailbox is configured for this business',
        createdBy: config.created_by_id || null,
      });
      return res.status(200).send('OK');
    }

    const inserted = await insertExpense(
      client,
      config,
      emailId,
      email?.created_at || event?.created_at || new Date().toISOString(),
      subject,
      text,
      sender,
    );

    console.log('Inbound expense email processed', {
      inserted: Boolean(inserted),
      category: inserted?.category || null,
      amount: inserted?.amount || null,
    });
    return res.status(200).send('OK');
  } catch (error) {
    console.error('Inbound expense email error', error?.message || error);
    return res.status(400).send('Error');
  } finally {
    client.release();
  }
}
