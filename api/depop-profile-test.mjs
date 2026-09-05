import chromium from '@sparticuz/chromium';
import { chromium as playwright } from 'playwright-core';

function clean(v = '') { return String(v || '').trim(); }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const raw = clean(req.query?.url || '');
  let parsed;
  try { parsed = new URL(raw); } catch { return res.status(400).json({ error: 'Valid Depop profile URL required' }); }
  if (!['depop.com', 'www.depop.com'].includes(parsed.hostname.toLowerCase())) {
    return res.status(400).json({ error: 'Depop URL required' });
  }

  let browser;
  try {
    browser = await playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1600 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    });
    const nav = await page.goto(parsed.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    for (let i = 0; i < 8; i += 1) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(700);
    }
    const debug = await page.evaluate(() => ({
      title: document.title,
      finalUrl: location.href,
      bodyText: (document.body?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 1200),
      anchorCount: document.querySelectorAll('a').length,
      productAnchorCount: document.querySelectorAll('a[href*="/products/"]').length,
    }));
    const cookies = await page.context().cookies();
    const result = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href*="/products/"]')]
        .map((a) => ({
          url: new URL(a.getAttribute('href'), location.origin).toString(),
          text: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 300),
          image: a.querySelector('img')?.src || '',
        }));
      const seen = new Set();
      return links.filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      });
    });
    return res.status(200).json({
      ok: true,
      httpStatus: nav?.status?.() || null,
      debug,
      cookieNames: cookies.map((cookie) => cookie.name),
      count: result.length,
      products: result.slice(0, 500),
    });
  } catch (error) {
    console.error('depop profile browser test failed', error?.message || error);
    return res.status(500).json({ error: clean(error?.message || 'Depop profile browser failed') });
  } finally {
    try { await browser?.close(); } catch {}
  }
}
