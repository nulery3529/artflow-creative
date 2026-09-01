import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export const maxDuration = 60;

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  let browser;
  try{
    browser=await puppeteer.launch({
      args: chromium.args,
      defaultViewport:{width:390,height:844},
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page=await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
    const response=await page.goto('https://www.depop.com/natasha_ulery/',{waitUntil:'domcontentloaded',timeout:30000});
    await new Promise(r=>setTimeout(r,4000));
    const links=await page.$$eval('a[href*="/products/"]',els=>[...new Set(els.map(e=>e.href))]);
    const body=await page.evaluate(()=>document.body?.innerText?.slice(0,300)||'');
    return res.status(200).json({ok:true,http_status:response?.status()||0,title:await page.title(),count:links.length,sample:links.slice(0,3),body:body.slice(0,300)});
  }catch(error){
    console.error('depop public probe',error?.stack||error);
    return res.status(500).json({ok:false,error:String(error?.message||error).slice(0,500)});
  }finally{ if(browser) await browser.close().catch(()=>{}); }
}
