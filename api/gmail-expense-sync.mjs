import { auth } from './auth/_auth.mjs';
import { fromNodeHeaders } from 'better-auth/node';
import {
  pool,
  getLegacyProfile,
  getBusiness,
  googleJson,
  normalize,
  approveGmailEmail,
} from './_gmail-sales-core.mjs';

const clean = (value = '') => String(value ?? '').replace(/\r/g, '').trim();

function decodeBase64Url(value = '') {
  if (!value) return '';
  return Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
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

function bodyTextFromPayload(payload = {}) {
  const plain = [];
  const html = [];
  const walk = (part) => {
    if (!part || typeof part !== 'object') return;
    const mime = String(part.mimeType || '').toLowerCase();
    const data = part?.body?.data;
    if (data && mime === 'text/plain') plain.push(decodeBase64Url(data));
    else if (data && mime === 'text/html') html.push(decodeBase64Url(data));
    for (const child of part.parts || []) walk(child);
  };
  walk(payload);
  if (plain.length) return clean(plain.join('\n'));
  if (html.length) return htmlToText(html.join('\n'));
  const fallback = decodeBase64Url(payload?.body?.data || '');
  return payload?.mimeType === 'text/html' ? htmlToText(fallback) : clean(fallback);
}

function headerValue(message, name) {
  const headers = message?.payload?.headers || [];
  return clean(headers.find((header) => String(header?.name || '').toLowerCase() === name.toLowerCase())?.value || '');
}

function addressOnly(value = '') {
  const text = normalize(value);
  const angle = text.match(/<([^>]+)>/);
  return clean(angle?.[1] || text).replace(/^mailto:/, '');
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
    /(?:^|\n)\s*(?:amount|charged|paid)\s*[:\-]?\s*\$\s*([\d,]+\.\d{2})\b/im,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const amount = parseMoney(match?.[1] || '');
    if (amount) return amount;
  }
  return 0;
}

function forwardedHeader(text = '', label = 'From') {
  const pattern = new RegExp(`(?:^|\\n)\\s*${label}:\\s*([^\\n]+)`, 'im');
  return clean(String(text || '').match(pattern)?.[1] || '');
}

function originalSubject(subject = '', text = '') {
  const forwarded = clean(forwardedHeader(text, 'Subject'));
  if (forwarded && !/^artflow expense$/i.test(forwarded)) return forwarded.replace(/^(?:(?:fwd?|fw):\s*)+/i, '');
  const direct = clean(subject).replace(/^(?:(?:fwd?|fw):\s*)+/i, '');
  return /^artflow expense$/i.test(direct) ? 'Email receipt' : direct;
}

function categoryFor(subject = '', text = '') {
  const value = `${subject}\n${text}`.toLowerCase();
  if (/\b(etsy fee|ebay fee|depop fee|vinted fee|poshmark fee|seller fee|listing fee|marketplace fee|platform fee|transaction fee)\b/.test(value)) return 'Marketplace & Selling Fees';
  if (/\b(processing fee|payment processing|stripe fee|paypal fee|bank fee|service charge|merchant fee)\b/.test(value)) return 'Bank & Payment Processing Fees';
  if (/\b(camera|lens|tripod|photo light|light box|photography|backdrop)\b/.test(value)) return 'Photography Equipment';
  if (/\b(picture frame|photo frame|frames|framed|display stand|easel|magnetic frame|acrylic frame)\b/.test(value)) return 'Frames & Display';
  if (/\b(printer ink|ink cartridge|cartridge|toner|cli-\d+|pgi-\d+|refill ink)\b/.test(value)) return 'Ink & Printing Supplies';
  if (/\b(photo paper|printer paper|matte paper|glossy paper|cardstock|print media|canvas sheet|sticker paper)\b/.test(value)) return 'Paper & Print Media';
  if (/\b(poly mailer|mailer|mailing box|shipping box|envelope|bubble mailer|packing tape|packaging|protective sleeve|cellophane sleeve|packing supply)\b/.test(value)) return 'Packaging & Shipping Supplies';
  if (/\b(postage|shipping label|usps|ups shipping|fedex shipping|postal)\b/.test(value)) return 'Shipping & Postage';
  if (/\b(inventory|wholesale|resale|merchandise|stock purchase|product purchase)\b/.test(value)) return 'Inventory & Resale Purchases';
  if (/\b(printer|laminator|paper cutter|trimmer|cutting machine|cricut|tool|equipment|tablet|computer|laptop|monitor)\b/.test(value)) return 'Equipment & Tools';
  if (/\b(repair|maintenance|replacement part|service call)\b/.test(value)) return 'Repairs & Maintenance';
  if (/\b(subscription|software|hosting|domain renewal|base44|vercel|wix|adobe|canva|google workspace|dropbox|icloud)\b/.test(value)) return 'Software & Subscriptions';
  if (/\b(phone bill|mobile service|wireless|internet service|visible wireless|cellular|broadband|wifi)\b/.test(value)) return 'Phone / Internet';
  if (/\b(advertising|advertisement|facebook ads|meta ads|instagram ads|promoted listing|marketing|sponsored ad)\b/.test(value)) return 'Advertising & Marketing';
  if (/\b(attorney|lawyer|legal service|bookkeeper|bookkeeping|accountant|accounting|tax preparer)\b/.test(value)) return 'Legal & Accounting';
  if (/\b(consulting|consultant|freelancer|contractor|professional service|virtual assistant|designer service)\b/.test(value)) return 'Professional Services';
  if (/\b(business insurance|liability insurance|insurance premium)\b/.test(value)) return 'Insurance';
  if (/\b(rent|studio rent|office rent|coworking|workspace)\b/.test(value)) return 'Rent & Workspace';
  if (/\b(electric|electricity|gas bill|water bill|utility|utilities)\b/.test(value)) return 'Utilities';
  if (/\b(mileage|fuel|gasoline|parking|toll|vehicle|car wash)\b/.test(value)) return 'Mileage & Vehicle';
  if (/\b(hotel|lodging|airfare|flight|rental car|business travel|train ticket)\b/.test(value)) return 'Travel & Lodging';
  if (/\b(business meal|restaurant|meal receipt|lunch|dinner|coffee meeting)\b/.test(value)) return 'Business Meals';
  if (/\b(course|class|workshop|training|conference|seminar|webinar|certification)\b/.test(value)) return 'Education & Training';
  if (/\b(business license|permit|registration fee|annual filing|state filing)\b/.test(value)) return 'Business Licenses & Fees';
  if (/\b(art kit|art supply|paint|paintbrush|brush set|marker|colored pencil|pencil set|watercolor|acrylic paint|glue|adhesive|craft supply|quilling)\b/.test(value)) return 'Art Materials & Supplies';
  if (/\b(office supply|office supplies|desk|filing|label maker|notebook|pens|printer labels)\b/.test(value)) return 'Office Supplies';
  return 'Other Business Expense';
}

function sourceName(subject = '', text = '', sender = '') {
  const forwarded = addressOnly(forwardedHeader(text, 'From'));
  const sourceEmail = forwarded || addressOnly(sender);
  const domain = sourceEmail.split('@')[1] || '';
  const merchant = domain.split('.')[0] || '';
  if (merchant) return `${merchant.charAt(0).toUpperCase()}${merchant.slice(1)} receipt`;
  const original = originalSubject(subject, text).split(/[-|:]/)[0].trim();
  return original && original.length <= 60 ? original : 'Email receipt';
}

async function accessTokenForAccount(req, accountId) {
  const headers = fromNodeHeaders(req.headers);
  const token = await auth.api.getAccessToken({ headers, body: { accountId } });
  if (!token?.accessToken) {
    const error = new Error('Reconnect Google in Account to resume Gmail expense sync.');
    error.code = 'GMAIL_RECONNECT';
    throw error;
  }
  return token.accessToken;
}

const EXPENSE_QUERIES = [
  // Explicit Art Flow forwarding/labeling remains supported for up to 90 days.
  'newer_than:90d subject:"artflow expense" -in:sent',
  // New users should not have to rename every receipt. Pull common recent
  // receipt/invoice/order-payment subjects into the pending review queue.
  'newer_than:30d {subject:receipt subject:invoice subject:"order confirmation" subject:"payment confirmation" subject:"payment receipt" subject:"purchase confirmation" subject:"thanks for your order" subject:"your order" subject:"subscription renewal"} -in:sent',
];

async function listMessageIds(accessToken) {
  const ids = new Set();
  for (const query of EXPENSE_QUERIES) {
    let pageToken = '';
    for (let page = 0; page < 10; page += 1) {
      const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
      url.searchParams.set('q', query);
      url.searchParams.set('maxResults', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const data = await googleJson(accessToken, url);
      for (const message of data?.messages || []) if (message?.id) ids.add(message.id);
      pageToken = clean(data?.nextPageToken || '');
      if (!pageToken) break;
    }
  }
  return [...ids];
}

async function readMessage(accessToken, messageId) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`);
  url.searchParams.set('format', 'full');
  return googleJson(accessToken, url);
}

async function recordImport(client, { businessId, messageId, status, details, createdBy }) {
  await client.query(`
    INSERT INTO artflow.email_import_messages (
      base44_id,business_id,message_id,import_type,status,platform,created_by_id,created_date,updated_date,data
    )
    SELECT gen_random_uuid()::text,$1,$2,'expense',$3,'Gmail',$4,now(),now(),$5::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM artflow.email_import_messages
      WHERE business_id=$1 AND message_id=$2 AND import_type='expense'
    )
  `,[businessId,messageId,status,createdBy,JSON.stringify({
    source: 'gmail_expense_sync',
    details,
    parser_version: 1,
  })]);
}

async function insertExpense(client, business, message, gmailAddress) {
  const messageId = clean(message?.id || '');
  const subject = headerValue(message, 'Subject');
  const sender = headerValue(message, 'From');
  const text = bodyTextFromPayload(message?.payload || {});
  const amount = extractTotal(`${subject}\n${text}`);
  const description = originalSubject(subject, text).slice(0, 240) || 'Email receipt';
  const category = categoryFor(subject, text);
  const source = sourceName(subject, text, sender).slice(0, 120);
  const receivedAt = Number(message?.internalDate)
    ? new Date(Number(message.internalDate)).toISOString()
    : headerValue(message, 'Date') || new Date().toISOString();
  const createdBy = business.created_by_id || null;

  if (!amount) {
    await recordImport(client, {
      businessId: business.base44_id,
      messageId,
      status: 'skipped',
      details: 'Art Flow expense email did not contain a recognizable purchase total',
      createdBy,
    });
    return { imported: 0, skipped: 1 };
  }

  const receiptId = `gmail-expense:${messageId}`;
  const existing = await client.query(`
    SELECT 1 FROM artflow.expenses
    WHERE business_id=$1 AND (receipt_id=$2 OR data->>'gmail_message_id'=$3)
    LIMIT 1
  `,[business.base44_id,receiptId,messageId]);
  if (existing.rowCount) {
    await recordImport(client, {
      businessId: business.base44_id,
      messageId,
      status: 'skipped',
      details: 'Duplicate Gmail expense email',
      createdBy,
    });
    return { imported: 0, skipped: 1 };
  }

  const accessEmails = Array.from(new Set([
    business.primary_email,
    business.data?.primary_email,
    ...(Array.isArray(business.data?.member_emails) ? business.data.member_emails : []),
    ...(Array.isArray(business.data?.expense_emails) ? business.data.expense_emails : []),
  ].map(normalize).filter(Boolean)));

  const result = await client.query(`
    INSERT INTO artflow.expenses (
      base44_id,business_id,expense_date,category,amount,archived,source,receipt_id,created_by_id,created_date,updated_date,data
    ) VALUES (
      gen_random_uuid()::text,$1,$2,$3,$4,false,$5,$6,$7,now(),now(),$8::jsonb
    )
    RETURNING base44_id
  `,[
    business.base44_id,
    localDate(receivedAt),
    category,
    amount,
    source,
    receiptId,
    createdBy,
    JSON.stringify({
      source: 'gmail_expense_sync',
      sync_source: 'gmail_expense_sync',
      source_email: gmailAddress,
      gmail_message_id: messageId,
      description,
      deductible_percent: 100,
      deductible_amount: amount,
      status: 'pending',
      access_emails: accessEmails,
    }),
  ]);

  await recordImport(client, {
    businessId: business.base44_id,
    messageId,
    status: result.rows[0] ? 'imported' : 'skipped',
    details: result.rows[0] ? `Imported expense: ${description}` : 'Duplicate Gmail expense email',
    createdBy,
  });

  return { imported: result.rows[0] ? 1 : 0, skipped: result.rows[0] ? 0 : 1 };
}

async function syncAccount(client, business, accessToken) {
  const profileData = await googleJson(accessToken, 'https://gmail.googleapis.com/gmail/v1/users/me/profile');
  const gmailAddress = normalize(profileData?.emailAddress || '');
  if (!gmailAddress) return { matched: 0, scanned: 0, imported: 0, skipped: 0 };

  await approveGmailEmail(client, business, gmailAddress);
  const messageIds = await listMessageIds(accessToken);
  let imported = 0;
  let skipped = 0;
  for (const messageId of messageIds) {
    const alreadyProcessed = await client.query(`
      SELECT 1 FROM artflow.email_import_messages
      WHERE business_id=$1 AND message_id=$2 AND import_type='expense'
      LIMIT 1
    `,[business.base44_id,messageId]);
    if (alreadyProcessed.rowCount) continue;
    const message = await readMessage(accessToken, messageId);
    const result = await insertExpense(client, business, message, gmailAddress);
    imported += result.imported;
    skipped += result.skipped;
  }
  return { matched: 1, scanned: messageIds.length, imported, skipped, gmailAddress };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }).catch(() => null);
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const client = await pool.connect();
  try {
    const profile = await getLegacyProfile(client, session.user);
    const business = await getBusiness(client, profile, session.user);
    if (!business?.base44_id) return res.status(400).json({ error: 'No Art Flow business workspace was found.' });

    const accounts = await auth.api.listUserAccounts({ headers: fromNodeHeaders(req.headers) });
    const googleAccounts = (accounts || []).filter((account) => account.providerId === 'google' && account.id);

    if (req.method === 'GET') {
      return res.status(200).json({
        configured: googleAccounts.length > 0,
        connected: googleAccounts.length > 0,
        message: googleAccounts.length
          ? 'Gmail expense sync is ready. Forward or send receipts with the subject “artflow expense”.'
          : 'Connect Gmail in Account to turn on expense syncing.',
      });
    }

    if (!googleAccounts.length) {
      return res.status(409).json({ error: 'Connect Gmail in Account to turn on automatic expense syncing.', code: 'GMAIL_NOT_LINKED' });
    }

    let matchedAccounts = 0;
    let permissionErrors = 0;
    let hardError = null;
    let scanned = 0;
    let imported = 0;
    let skipped = 0;

    for (const account of googleAccounts) {
      try {
        const accessToken = await accessTokenForAccount(req, account.id);
        const result = await syncAccount(client, business, accessToken);
        matchedAccounts += result.matched;
        scanned += result.scanned;
        imported += result.imported;
        skipped += result.skipped;
      } catch (error) {
        if (error?.status === 401 || error?.status === 403 || error?.code === 'GMAIL_RECONNECT') {
          permissionErrors += 1;
          continue;
        }
        hardError = error;
        console.warn('Gmail expense sync account failed', error?.message || error);
      }
    }

    if (!matchedAccounts && hardError) {
      return res.status(500).json({ error: hardError?.message || 'Gmail expense import failed.', code: 'GMAIL_EXPENSE_IMPORT_ERROR' });
    }
    if (!matchedAccounts && permissionErrors) {
      return res.status(409).json({ error: 'Reconnect Google in Account so Art Flow can read expense emails.', code: 'GMAIL_RECONNECT' });
    }
    if (!matchedAccounts) {
      return res.status(409).json({ error: 'No connected Gmail inbox is available for expense syncing.', code: 'GMAIL_NOT_AVAILABLE' });
    }

    return res.status(200).json({
      ok: true,
      accounts: matchedAccounts,
      scanned,
      imported,
      skipped,
      message: imported > 0
        ? `Imported ${imported} new expense${imported === 1 ? '' : 's'} from Gmail.`
        : 'Gmail expenses are up to date.',
    });
  } catch (error) {
    console.error('gmail expense sync error', error?.message || error);
    return res.status(500).json({ error: error?.message || 'Could not sync Gmail expenses.', code: 'GMAIL_EXPENSE_SYNC_ERROR' });
  } finally {
    client.release();
  }
}
