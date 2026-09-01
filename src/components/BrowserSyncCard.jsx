import React, { useEffect, useState } from "react";
import { CheckCircle2, Copy, Download, Eye, EyeOff, KeyRound, RefreshCw, Smartphone } from "lucide-react";
import { toast } from "sonner";

export default function BrowserSyncCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showIPhoneCode, setShowIPhoneCode] = useState(false);
  const [state, setState] = useState({ key: "", enabled: true });

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/browser-sync", { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load Browser Sync");
      setState({ key: data.key || "", enabled: data.enabled !== false });
    } catch (error) {
      console.error("Browser Sync setup error", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleEnabled = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/browser-sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settings", enabled: !state.enabled }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update Browser Sync");
      setState({ key: data.key || state.key, enabled: data.enabled !== false });
      toast.success(data.enabled === false ? "Browser Sync paused" : "Browser Sync enabled");
    } catch (error) {
      toast.error("Could not update Browser Sync", { description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const copyKey = async () => {
    if (!state.key) return;
    try {
      await navigator.clipboard.writeText(state.key);
      toast.success("Browser Sync key copied");
    } catch {
      toast.error("Could not copy the key");
    }
  };

  const makeIPhoneBookmarklet = () => {
    const key = JSON.stringify(state.key || "");
    const endpoint = JSON.stringify("https://artflowcreative.com/api/browser-sync");
    return `javascript:(async()=>{const K=${key},E=${endpoint},H=location.hostname.toLowerCase(),P=H.includes('depop')?'Depop':H.includes('vinted')?'Vinted':'';if(!P){alert('Open your Depop or Vinted seller listings page in Safari first.');return}const M=500,S=new Map(),Y=scrollY,sl=t=>new Promise(r=>setTimeout(r,t)),ok=u=>{try{const x=new URL(u,location.href),q=x.pathname;return P==='Depop'?/\\/products\\/[^/?#]+/i.test(q):/\\/items\\/\\d+/i.test(q)}catch{return false}},id=u=>{try{const q=new URL(u,location.href).pathname;return P==='Depop'?(q.match(/\\/products\\/([^/?#]+)/i)||[])[1]||'':(q.match(/\\/items\\/(\\d+)/i)||[])[1]||''}catch{return''}},abs=u=>{try{const x=new URL(u,location.href);x.hash='';['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(k=>x.searchParams.delete(k));return x.toString().replace(/\\/$/,'')}catch{return''}},col=()=>{for(const a of [...document.querySelectorAll('a[href]')].filter(a=>ok(a.href))){if(S.size>=M)break;const u=abs(a.href),i=id(u),k=P+':' +(i||u);if(!u||S.has(k))continue;const c=a.closest('article,li,[data-testid*=listing],[data-testid*=item],[class*=listing],[class*=product],[class*=card],[class*=item]')||a.parentElement?.parentElement||a.parentElement||a,im=a.querySelector('img')||c?.querySelector('img'),iu=(im?.currentSrc||im?.src||im?.getAttribute('data-src')||im?.getAttribute('data-lazy-src')||'').trim(),tx=(c?.innerText||a.innerText||'').replace(/\\r/g,'').trim(),ln=tx.split('\\n').map(v=>v.trim()).filter(Boolean);let t=(im?.alt||a.getAttribute('aria-label')||a.getAttribute('title')||'').trim();if(!t||/^(image|listing|item|product|shop now|view item|sponsored|ad)$/i.test(t))t=ln.find(v=>v.length>=3&&v.length<=300&&!/^\\$?\\s*[0-9,.]+\\s*$/.test(v)&&!/^(sold|reserved|available|new|sponsored|ad|free shipping|shipping included)$/i.test(v))||'';t=t.replace(/\\s+/g,' ').trim().slice(0,300)||P+' listing '+(i||S.size+1);const m=tx.match(/(?:US\\s*)?\\$\\s*([0-9][0-9,]*(?:\\.\\d{1,2})?)/i),pr=m?Number(m[1].replace(/,/g,'')):0;S.set(k,{platform:P,listing_id:i,title:t,price:Number.isFinite(pr)?pr:0,currency:'USD',image_url:/^https?:\\/\\//i.test(iu)?iu:'',listing_url:u})}},more=()=>{for(const e of document.querySelectorAll('button,a[role=button]')){const t=(e.innerText||e.getAttribute('aria-label')||'').trim();if(/^(load more|show more|see more|more items|view more)$/i.test(t)&&!e.disabled){try{e.click();return true}catch{}}}return false};col();let st=0,pr=S.size,done=false;for(let n=0;n<90&&S.size<M;n++){const clk=more(),bh=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);scrollTo(0,bh);await sl(n<10?700:900);col();const ah=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight),bot=Math.ceil(scrollY+innerHeight)>=ah-12;if(S.size===pr&&ah<=bh+10&&bot&&!clk)st++;else st=0;done=bot&&st>=8;pr=S.size;if(done)break}scrollTo(0,Y);if(!S.size){alert('Art Flow did not find listing cards on this page.');return}try{const r=await fetch(E,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'listings',sync_key:K,listings:[...S.values()],snapshot_complete:S.size<M&&done,snapshot_platform:P})}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('Art Flow returned '+r.status));alert(d.message||('Refreshed '+S.size+' '+P+' listings in Art Flow.'))}catch(e){alert('Art Flow refresh failed: '+(e.message||e))}})()`;
  };

  const copyTextWithFallback = async (text) => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {}
    }
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      area.style.pointerEvents = "none";
      document.body.appendChild(area);
      area.focus();
      area.select();
      area.setSelectionRange(0, area.value.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  };

  const copyIPhoneRefresh = async () => {
    if (!state.key) return;
    const code = makeIPhoneBookmarklet();
    const copied = await copyTextWithFallback(code);
    if (copied) {
      toast.success("iPhone Refresh copied", { description: "Paste it into the address of a Safari bookmark named Refresh Art Flow." });
      setShowIPhoneCode(false);
    } else {
      setShowIPhoneCode(true);
      toast.info("Tap and hold the code below to copy it manually.");
    }
  };

  if (loading) return null;

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center shrink-0">
          <KeyRound className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-lg">Art Flow Marketplace Refresh</h2>
            {state.enabled && state.key && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Refresh Depop and Vinted listings directly from your logged-in Chrome browser. No Parse credits or marketplace API key required. Etsy and eBay visible-page sync remains supported.
          </p>
        </div>
      </div>

      {state.key && (
        <div className="rounded-2xl bg-muted p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Private sync key</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 text-xs break-all bg-background rounded-xl px-3 py-2 border border-[hsl(var(--border))]">
              {showKey ? state.key : `${state.key.slice(0, 7)}••••••••••••••••••••${state.key.slice(-6)}`}
            </code>
            <button onClick={() => setShowKey((value) => !value)} className="w-10 h-10 rounded-xl bg-background flex items-center justify-center" aria-label={showKey ? "Hide sync key" : "Show sync key"}>
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button onClick={copyKey} className="w-10 h-10 rounded-xl bg-background flex items-center justify-center" aria-label="Copy sync key">
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[hsl(var(--border))] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4" />
          <p className="font-semibold text-sm">iPhone Safari Refresh</p>
        </div>
        <p className="text-xs text-muted-foreground">No extension is required. Copy the personalized Safari bookmark action below, save it once, then tap it while viewing your Depop or Vinted seller listings page.</p>
        <button onClick={copyIPhoneRefresh} disabled={!state.key} className="w-full h-11 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
          <Copy className="w-4 h-4" /> Copy iPhone Refresh
        </button>
        <button onClick={() => setShowIPhoneCode((value) => !value)} disabled={!state.key} className="w-full h-10 rounded-2xl bg-muted text-foreground text-xs font-semibold disabled:opacity-60">
          {showIPhoneCode ? "Hide manual copy code" : "Show manual copy code"}
        </button>
        {showIPhoneCode && state.key && (
          <textarea
            readOnly
            value={makeIPhoneBookmarklet()}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full h-28 rounded-2xl bg-background border border-[hsl(var(--border))] p-3 text-[10px] font-mono break-all"
            aria-label="iPhone Refresh bookmark code"
          />
        )}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>1. In Safari, add any page as a bookmark and name it “Refresh Art Flow.”</p>
          <p>2. Edit that bookmark and replace its address with the copied text.</p>
          <p>3. Open your Depop or Vinted seller listings page in Safari.</p>
          <p>4. Open Bookmarks and tap “Refresh Art Flow.” It will scan up to 500 listings and send them to Gallery.</p>
        </div>
      </div>

      <a href="/downloads/artflow-browser-sync.zip" download className="w-full h-12 rounded-2xl bg-muted text-foreground font-semibold flex items-center justify-center gap-2">
        <Download className="w-4 h-4" /> Desktop Chrome Refresh v2.0
      </a>

      <button onClick={toggleEnabled} disabled={saving} className="w-full h-11 rounded-2xl bg-muted text-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
        <RefreshCw className={`w-4 h-4 ${saving ? "animate-spin" : ""}`} />
        {state.enabled ? "Pause Browser Sync" : "Enable Browser Sync"}
      </button>

      <div className="text-xs text-muted-foreground space-y-1">
        <p><strong className="text-foreground">Desktop:</strong> load v2.0 in Chrome, save the private key once, then use “Refresh active listings to Gallery.”</p>
        <p><strong className="text-foreground">iPhone:</strong> use the Safari bookmark action above. iPhone Chrome does not support normal Chrome extensions.</p>
      </div>
    </section>
  );
}
