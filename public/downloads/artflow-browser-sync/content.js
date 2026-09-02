const ext = globalThis.browser || globalThis.chrome;

function extractOrderFromPage() {
  const host = location.hostname.toLowerCase();
  const platform = host.includes('vinted') ? 'Vinted' : host.includes('depop') ? 'Depop' : host.includes('etsy') ? 'Etsy' : host.includes('ebay') ? 'eBay' : '';
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
  const platform = host.includes('vinted') ? 'Vinted' : host.includes('depop') ? 'Depop' : host.includes('etsy') ? 'Etsy' : host.includes('ebay') ? 'eBay' : '';
  if (!platform) return { supported: false, platform: '', listings: [], complete: false };

  const max = Math.max(1, Math.min(500, Number(maxListings) || 500));
  const originalY = window.scrollY;
  const seen = new Map();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    } catch { return ''; }
  };

  const srcsetCandidates = (value = '') => {
    return String(value || '').split(',').map((part) => {
      const bits = part.trim().split(/\s+/);
      const url = bits[0] || '';
      const descriptor = bits[1] || '';
      let score = 0;
      const width = descriptor.match(/^(\d+)w$/i);
      const density = descriptor.match(/^(\d+(?:\.\d+)?)x$/i);
      if (width) score = Number(width[1]);
      else if (density) score = Number(density[1]) * 1000;
      return { url, score };
    }).filter((item) => /^https?:\/\//i.test(item.url));
  };

  const bestImage = (img, card) => {
    const candidates = [];
    const add = (url, score = 1) => {
      const clean = String(url || '').trim();
      if (/^https?:\/\//i.test(clean)) candidates.push({ url: clean, score });
    };
    if (img) {
      add(img.getAttribute('data-original'), 5000);
      add(img.getAttribute('data-full-src'), 4800);
      add(img.getAttribute('data-src'), 4200);
      add(img.getAttribute('data-lazy-src'), 4100);
      add(img.currentSrc, Math.max(1200, Number(img.naturalWidth || 0)));
      add(img.src, Math.max(1000, Number(img.naturalWidth || 0)));
      for (const attr of ['srcset', 'data-srcset', 'data-lazy-srcset']) {
        for (const item of srcsetCandidates(img.getAttribute(attr))) add(item.url, 3000 + item.score);
      }
      const picture = img.closest('picture');
      if (picture) {
        for (const source of picture.querySelectorAll('source')) {
          for (const attr of ['srcset', 'data-srcset']) {
            for (const item of srcsetCandidates(source.getAttribute(attr))) add(item.url, 3500 + item.score);
          }
        }
      }
    }
    if (card) {
      for (const node of card.querySelectorAll('img')) {
        if (node === img) continue;
        add(node.getAttribute('data-original'), 4500);
        add(node.getAttribute('data-full-src'), 4400);
        for (const item of srcsetCandidates(node.getAttribute('srcset'))) add(item.url, 2800 + item.score);
        add(node.currentSrc || node.src, Math.max(900, Number(node.naturalWidth || 0)));
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || { url: '', score: 0 };
  };

  const collect = () => {
    const candidates = [...document.querySelectorAll('a[href]')].filter((anchor) => isListingHref(anchor.href));
    for (const anchor of candidates) {
      const url = absoluteUrl(anchor.href);
      const id = listingId(url);
      const key = `${platform}:${id || url.split('?')[0]}`;
      if (!url) continue;
      if (seen.size >= max && !seen.has(key)) continue;
      const card = anchor.closest('article, li, [data-testid*="listing"], [data-testid*="item"], [class*="listing"], [class*="product"], [class*="card"], [class*="item"]') || anchor.parentElement?.parentElement || anchor.parentElement || anchor;
      const img = anchor.querySelector('img') || card?.querySelector('img');
      const best = bestImage(img, card);
      const text = (card?.innerText || anchor.innerText || '').replace(/\r/g, '').trim();
      const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
      let title = (img?.alt || anchor.getAttribute('aria-label') || anchor.getAttribute('title') || '').trim();
      if (!title || /^(image|listing|item|product|shop now|view item|sponsored|ad)$/i.test(title)) {
        title = lines.find((line) => line.length >= 3 && line.length <= 300 && !/^\$?\s*[0-9,.]+\s*$/.test(line) && !/^(sold|reserved|available|new|sponsored|ad|free shipping|shipping included)$/i.test(line)) || '';
      }
      title = title.replace(/\s+/g, ' ').trim().slice(0, 300) || `${platform} listing ${id || seen.size + 1}`;
      const moneyMatch = text.match(/(?:US\s*)?\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
      const price = moneyMatch ? Number(moneyMatch[1].replace(/,/g, '')) : 0;
      const sold = lines.some((line) => /^(sold|sold out)$/i.test(line)) || /(?:^|\n)\s*(?:sold|sold out)\s*(?:\n|$)/i.test(text);
      const status = sold ? 'Sold' : 'Active';
      const next = { platform, listing_id: id, title, price: Number.isFinite(price) ? price : 0, currency: 'USD', image_url: best.url, listing_url: url, status, _image_score: best.score };
      const previous = seen.get(key);
      if (!previous) {
        if (seen.size < max) seen.set(key, next);
      } else {
        if (next._image_score > (previous._image_score || 0) && next.image_url) previous.image_url = next.image_url;
        if ((!previous.title || /^Vinted listing /i.test(previous.title)) && next.title) previous.title = next.title;
        if ((!previous.price || previous.price <= 0) && next.price > 0) previous.price = next.price;
        if (next.status === 'Sold') previous.status = 'Sold';
        previous._image_score = Math.max(previous._image_score || 0, next._image_score || 0);
      }
    }
  };

  const clickLoadMore = () => {
    for (const el of document.querySelectorAll('button, a[role="button"]')) {
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
  let confirmedBottom = false;
  const scrolling = document.scrollingElement || document.documentElement;
  const step = Math.max(420, Math.floor(window.innerHeight * (platform === 'Vinted' ? 0.72 : 0.9)));
  const maxLoops = platform === 'Vinted' ? 260 : 160;
  const bottomWaits = platform === 'Vinted' ? 16 : 10;

  for (let i = 0; i < maxLoops && seen.size < max; i += 1) {
    const clickedMore = clickLoadMore();
    const beforeHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, scrolling?.scrollHeight || 0);
    const currentTop = Number(scrolling?.scrollTop || window.scrollY || 0);
    const nextTop = Math.min(beforeHeight, currentTop + step);
    window.scrollTo({ top: nextTop, behavior: 'auto' });
    await sleep(platform === 'Vinted' ? 500 : 650);
    collect();

    let afterHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, scrolling?.scrollHeight || 0);
    let atBottom = Math.ceil((scrolling?.scrollTop || window.scrollY || 0) + window.innerHeight) >= afterHeight - 20;

    if (atBottom) {
      await sleep(platform === 'Vinted' ? 1100 : 750);
      clickLoadMore();
      collect();
      afterHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, scrolling?.scrollHeight || 0);
      atBottom = Math.ceil((scrolling?.scrollTop || window.scrollY || 0) + window.innerHeight) >= afterHeight - 20;
    }

    if (seen.size === previous && afterHeight <= beforeHeight + 10 && atBottom && !clickedMore) stagnant += 1;
    else stagnant = 0;
    confirmedBottom = atBottom && stagnant >= bottomWaits;
    previous = seen.size;
    if (confirmedBottom) break;
  }

  await sleep(500);
  collect();
  try { window.scrollTo({ top: originalY, behavior: 'auto' }); } catch {}
  const listings = [...seen.values()].slice(0, max).map(({ _image_score, ...item }) => item);
  return { supported: true, platform, listings, complete: seen.size < max && confirmedBottom, reached_limit: seen.size >= max };
}

ext?.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
  if (message?.action === 'read-order') {
    sendResponse(extractOrderFromPage());
    return false;
  }
  if (message?.action === 'crawl-listings') {
    crawlListingsFromPage(message?.max || 500)
      .then((data) => sendResponse(data))
      .catch((error) => sendResponse({ supported: false, listings: [], complete: false, error: error?.message || String(error) }));
    return true;
  }
  return false;
});
