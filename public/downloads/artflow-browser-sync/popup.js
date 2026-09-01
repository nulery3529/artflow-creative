const ENDPOINT = 'https://artflowcreative.com/api/browser-sync';
const LISTING_ENDPOINT = ENDPOINT;
const $ = (id) => document.getElementById(id);
let pageUrl = '';

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function setStatus(message, kind = '') {
  const el = $('status');
  el.textContent = message;
  el.className = `status ${kind}`.trim();
}

function extractOrderFromPage() {
  const host = location.hostname.toLowerCase();
  const platform = host.includes('vinted')
    ? 'Vinted'
    : host.includes('depop')
      ? 'Depop'
      : host.includes('etsy')
        ? 'Etsy'
        : host.includes('ebay')
          ? 'eBay'
          : '';
  const body = (document.body?.innerText || '').replace(/\r/g, '');
  const lines = body.split('\n').map((v) => v.trim()).filter(Boolean);
  const metaTitle = document.querySelector('meta[property="og:title"]')?.content || '';
  const h1 = document.querySelector('h1')?.innerText || '';
  let product = (h1 || metaTitle || document.title || '').replace(/\s*[|–-]\s*(Vinted|Depop|Etsy|eBay).*$/i, '').trim();
  if (product.length > 300) product = product.slice(0, 300);

  const labeledMoney = [
    /(?:order\s+total|order\s+value|subtotal|item\s+total|item\s+price|sale\s+price|sold\s+for|you\s+earned|price)\s*[:\n]?\s*(?:US\s*)?\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
    /(?:US\s*)?\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:item\s+price|subtotal|total|order\s+total)/i,
  ];
  let saleTotal = '';
  for (const re of labeledMoney) {
    const match = body.match(re);
    if (match) { saleTotal = match[1].replace(/,/g, ''); break; }
  }

  const orderMatch = body.match(/(?:order(?:\s*(?:id|number))?|order\s*#|receipt(?:\s*(?:id|number))?|receipt\s*#)\s*[:#]?\s*([A-Z0-9][A-Z0-9_-]{5,})/i);
  const buyerMatch = body.match(/(?:buyer|sold\s+to|purchased\s+by)\s*[:\n]\s*([^\n]{2,80})/i);
  const quantityMatch = body.match(/(?:quantity|qty)\s*[:\n]?\s*(\d{1,2})/i);

  // Some marketplace order pages use nearby text rather than semantic headings.
  // If the H1 is generic, prefer a line just before a clearly labeled item price.
  if (!product || /^(order|sold|purchase|messages?)$/i.test(product)) {
    const priceLine = lines.findIndex((line) => /^(item price|sale price|subtotal)$/i.test(line));
    if (priceLine > 0) product = lines[Math.max(0, priceLine - 1)].slice(0, 300);
  }

  return {
    supported: !!platform,
    platform,
    product_name: product,
    sale_total: saleTotal,
    quantity: quantityMatch ? Number(quantityMatch[1]) : 1,
    order_id: orderMatch?.[1] || '',
    buyer: buyerMatch?.[1]?.trim() || '',
    sale_date: new Date().toISOString().slice(0, 10),
    source_url: location.href,
  };
}

async function crawlListingsFromPage(maxListings = 500) {
  const host = location.hostname.toLowerCase();
  const platform = host.includes('vinted')
    ? 'Vinted'
    : host.includes('depop')
      ? 'Depop'
      : host.includes('etsy')
        ? 'Etsy'
        : host.includes('ebay')
          ? 'eBay'
          : '';
  if (!platform) return { supported: false, platform: '', listings: [], complete: false };

  const max = Math.max(1, Math.min(500, Number(maxListings) || 500));
  const originalY = window.scrollY;
  const seen = new Map();

  const isListingHref = (href = '') => {
    try {
      const url = new URL(href, location.href);
      const path = url.pathname;
      if (platform === 'Vinted') return /\/items\/\d+/i.test(path);
      if (platform === 'Depop') return /\/products\/[^/?#]+/i.test(path);
      if (platform === 'Etsy') return /\/listing\/\d+/i.test(path);
      if (platform === 'eBay') return /\/itm\//i.test(path);
    } catch {}
    return false;
  };

  const listingId = (href = '') => {
    try {
      const path = new URL(href, location.href).pathname;
      if (platform === 'Vinted') return path.match(/\/items\/(\d+)/i)?.[1] || '';
      if (platform === 'Depop') return path.match(/\/products\/([^/?#]+)/i)?.[1] || '';
      if (platform === 'Etsy') return path.match(/\/listing\/(\d+)/i)?.[1] || '';
      if (platform === 'eBay') return path.match(/\/itm\/(?:[^/]+\/)?(\d{8,16})/i)?.[1] || '';
    } catch {}
    return '';
  };

  const absoluteUrl = (href = '') => {
    try {
      const url = new URL(href, location.href);
      url.hash = '';
      ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach((key) => url.searchParams.delete(key));
      return url.toString().replace(/\/$/, '');
    } catch {
      return '';
    }
  };

  const collect = () => {
    const candidates = [...document.querySelectorAll('a[href]')].filter((anchor) => isListingHref(anchor.href));
    for (const anchor of candidates) {
      if (seen.size >= max) break;
      const url = absoluteUrl(anchor.href);
      const id = listingId(url);
      const key = `${platform}:${id || url.split('?')[0]}`;
      if (!url || seen.has(key)) continue;

      const card = anchor.closest('article, li, [data-testid*="listing"], [data-testid*="item"], [class*="listing"], [class*="product"], [class*="card"], [class*="item"]')
        || anchor.parentElement?.parentElement
        || anchor.parentElement
        || anchor;
      const img = anchor.querySelector('img') || card?.querySelector('img');
      const imageUrl = (img?.currentSrc || img?.src || img?.getAttribute('data-src') || img?.getAttribute('data-lazy-src') || '').trim();
      const text = (card?.innerText || anchor.innerText || '').replace(/\r/g, '').trim();
      const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
      let title = (img?.alt || anchor.getAttribute('aria-label') || anchor.getAttribute('title') || '').trim();

      if (!title || /^(image|listing|item|product|shop now|view item|sponsored|ad)$/i.test(title)) {
        title = lines.find((line) =>
          line.length >= 3 &&
          line.length <= 300 &&
          !/^\$?\s*[0-9,.]+\s*$/.test(line) &&
          !/^(sold|reserved|available|new|sponsored|ad|free shipping|shipping included)$/i.test(line)
        ) || '';
      }

      title = title.replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!title) title = `${platform} listing ${id || seen.size + 1}`;
      const moneyMatch = text.match(/(?:US\s*)?\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
      const price = moneyMatch ? Number(moneyMatch[1].replace(/,/g, '')) : 0;
      seen.set(key, {
        platform,
        listing_id: id,
        title,
        price: Number.isFinite(price) ? price : 0,
        currency: 'USD',
        image_url: /^https?:\/\//i.test(imageUrl) ? imageUrl : '',
        listing_url: url,
      });
    }
  };

  const clickLoadMore = () => {
    const candidates = [...document.querySelectorAll('button, a[role="button"]')];
    for (const el of candidates) {
      const text = (el.innerText || el.getAttribute('aria-label') || '').trim();
      if (/^(load more|show more|see more|more items|view more)$/i.test(text) && !el.disabled) {
        try { el.click(); return true; } catch {}
      }
    }
    return false;
  };

  collect();
  let stagnant = 0;
  let previous = seen.size;
  for (let i = 0; i < 90 && seen.size < max; i += 1) {
    clickLoadMore();
    const beforeHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    window.scrollTo({ top: beforeHeight, behavior: 'auto' });
    await new Promise((resolve) => setTimeout(resolve, i < 10 ? 700 : 900));
    collect();
    const afterHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    if (seen.size === previous && afterHeight <= beforeHeight + 10) stagnant += 1;
    else stagnant = 0;
    previous = seen.size;
    if (stagnant >= 7) break;
  }

  try { window.scrollTo({ top: originalY, behavior: 'auto' }); } catch {}
  return {
    supported: true,
    platform,
    listings: [...seen.values()].slice(0, max),
    complete: seen.size < max && stagnant >= 7,
    reached_limit: seen.size >= max,
  };
}
async function readPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');
    pageUrl = tab.url || '';
    const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractOrderFromPage });
    const data = result?.[0]?.result || {};
    if (!data.supported) {
      setStatus('Open a Vinted, Depop, Etsy, or eBay sold/order page first.', 'bad');
      $('capture').disabled = true;
      return;
    }
    $('capture').disabled = false;
    $('platform').value = data.platform || 'Vinted';
    $('product').value = data.product_name || '';
    $('total').value = data.sale_total || '';
    $('quantity').value = data.quantity || 1;
    $('orderId').value = data.order_id || '';
    $('buyer').value = data.buyer || '';
    $('saleDate').value = data.sale_date || localDate();
    pageUrl = data.source_url || pageUrl;
    setStatus(data.sale_total ? 'Page read. Check the amount and product before sending.' : 'Page read. Enter the sale total, then send.', data.sale_total ? 'ok' : '');
  } catch (error) {
    setStatus(`Could not read this page: ${error.message || error}`, 'bad');
  }
}

async function loadKey() {
  const stored = await chrome.storage.local.get(['artflowSyncKey']);
  $('syncKey').value = stored.artflowSyncKey || '';
}

$('saveKey').addEventListener('click', async () => {
  const key = $('syncKey').value.trim();
  if (!key.startsWith('af_') || key.length < 20) {
    setStatus('Paste the Browser Sync key from Art Flow Account.', 'bad');
    return;
  }
  await chrome.storage.local.set({ artflowSyncKey: key });
  setStatus('Sync key saved on this computer.', 'ok');
});

$('syncListings').addEventListener('click', async () => {
  const key = $('syncKey').value.trim();
  if (!key.startsWith('af_')) return setStatus('Save your Art Flow Browser Sync key first.', 'bad');

  $('syncListings').disabled = true;
  setStatus('Scanning this seller page for up to 500 active listings… Keep this tab open while Art Flow scrolls through the catalog.');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');
    const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: crawlListingsFromPage, args: [500] });
    const data = result?.[0]?.result || {};
    if (!data.supported) throw new Error('Open your Vinted, Depop, Etsy, or eBay shop/listings page first.');
    if (!Array.isArray(data.listings) || data.listings.length === 0) {
      throw new Error('No current listing cards were found on this page. Open your seller/shop listings page and make sure the listings are visible.');
    }

    await chrome.storage.local.set({ artflowSyncKey: key });
    setStatus(`Found ${data.listings.length} ${data.platform} listing${data.listings.length === 1 ? '' : 's'}. Saving the full batch to Gallery…`);
    const response = await fetch(LISTING_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'listings', sync_key: key, listings: data.listings, snapshot_complete: data.complete === true, snapshot_platform: data.platform }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Art Flow returned ${response.status}`);
    setStatus(payload.message || 'Current listings linked to Gallery.', 'ok');
  } catch (error) {
    setStatus(`Could not sync listings: ${error.message || error}`, 'bad');
  } finally {
    $('syncListings').disabled = false;
  }
});

$('reread').addEventListener('click', readPage);

$('capture').addEventListener('click', async () => {
  const key = $('syncKey').value.trim();
  const total = Number(String($('total').value).replace(/[$,]/g, ''));
  const product = $('product').value.trim();
  if (!key.startsWith('af_')) return setStatus('Save your Art Flow Browser Sync key first.', 'bad');
  if (!product) return setStatus('Enter the product name.', 'bad');
  if (!Number.isFinite(total) || total <= 0) return setStatus('Enter the correct sale total.', 'bad');

  $('capture').disabled = true;
  setStatus('Sending sale to Art Flow…');
  try {
    await chrome.storage.local.set({ artflowSyncKey: key });
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'order',
        sync_key: key,
        order: {
          platform: $('platform').value,
          product_name: product,
          sale_total: total,
          quantity: Math.max(1, Number($('quantity').value) || 1),
          order_id: $('orderId').value.trim(),
          buyer: $('buyer').value.trim(),
          sale_date: $('saleDate').value || localDate(),
          source_url: pageUrl,
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Art Flow returned ${response.status}`);
    setStatus(data.message || 'Sale sent to Art Flow.', 'ok');
  } catch (error) {
    setStatus(`Could not send sale: ${error.message || error}`, 'bad');
  } finally {
    $('capture').disabled = false;
  }
});

loadKey().then(readPage);
