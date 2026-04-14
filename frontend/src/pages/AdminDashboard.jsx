import { useState, useEffect } from "react";
import { Contract } from "ethers";
import { ADDRESSES } from "../config";
import BasketManagerABI from "../abis/BasketManager.json";
import TokenCard from "../components/TokenCard";
import BasketCard from "../components/BasketCard";
import BasketDetail from "./BasketDetail";
import assetsData from "../../../data/assets.json";
const ALL_ASSETS = assetsData.assets;

function WeightEditor({ selected, weights, onChange }) {
  const sum=Object.values(weights).reduce((a,v)=>a+(parseFloat(v)||0),0);
  const sumOk=Math.abs(sum-1)<0.001;
  return (
    <div className="card" style={{ marginTop:14 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
        <h2 style={{ marginBottom:0 }}>Weight Editor</h2>
        <span style={{ fontSize:"0.75rem",fontWeight:700,color:sumOk?"var(--green)":"var(--red)" }}>{sum.toFixed(4)} / 1.0000 {sumOk?"✓":""}</span>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 90px 46px",gap:"6px 10px",alignItems:"center" }}>
        {selected.map((sym)=>[
          <span key={`l-${sym}`} style={{ fontSize:"0.85rem",color:"var(--txt)" }}>{sym}</span>,
          <input key={`i-${sym}`} type="number" min="0" max="1" step="0.01" value={weights[sym]??""} onChange={(e)=>onChange(sym,e.target.value)} style={{ padding:"4px 8px",fontSize:"0.82rem" }}/>,
          <span key={`p-${sym}`} style={{ fontSize:"0.7rem",color:"var(--txt2)" }}>{((parseFloat(weights[sym])||0)*100).toFixed(1)}%</span>
        ])}
      </div>
    </div>
  );
}

function MintForm({ signer, selectedSymbols, weights, onSuccess }) {
  const [name,setName]=useState(""); const [symbol,setSymbol]=useState(""); const [status,setStatus]=useState(""); const [loading,setLoading]=useState(false);
  const sum=Object.values(weights).reduce((a,v)=>a+(parseFloat(v)||0),0);
  const sumOk=Math.abs(sum-1)<0.001;
  const ok=selectedSymbols.length>0&&sumOk&&name&&symbol&&!loading;
  async function handleMint() {
    if (!signer||!ok) return; setLoading(true); setStatus("Preparing…");
    try {
      const mgr=new Contract(ADDRESSES.manager,BasketManagerABI,signer);
      const sel=ALL_ASSETS.filter(a=>selectedSymbols.includes(a.symbol));
      const addrs=sel.map(a=>a.address);
      const rawW=sel.map(a=>Math.round((parseFloat(weights[a.symbol])||0)*10000));
      rawW[rawW.length-1]+=10000-rawW.reduce((a,b)=>a+b,0);
      const meta=JSON.stringify({ name,symbol,assets:sel.map((a,i)=>({symbol:a.symbol,address:a.address,weightBp:rawW[i]})),createdAt:new Date().toISOString() });
      setStatus("Sending tx…");
      const receipt=await (await mgr.mintBasket(addrs,rawW,name,symbol,meta)).wait();
      let basketId=null;
      for (const log of receipt.logs) { try{ const p=mgr.interface.parseLog(log); if(p?.name==="BasketMinted") basketId=Number(p.args.basketId); }catch(_){} }
      setStatus(`Basket #${basketId??"?"} created ✓`); onSuccess&&onSuccess(basketId);
    } catch(err) { setStatus(`Error: ${err.reason||err.message}`); } finally { setLoading(false); }
  }
  return (
    <div className="card" style={{ marginTop:14 }}>
      <h2>Mint Basket</h2>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12 }}>
        {[["Basket Name",name,setName,"e.g. RWA Income Fund"],["Symbol",symbol,setSymbol,"e.g. RWAINC"]].map(([lbl,val,set,ph])=>(
          <div key={lbl}>
            <div style={{ fontSize:"0.68rem",color:"var(--txt2)",textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600,marginBottom:5 }}>{lbl}</div>
            <input type="text" value={val} onChange={(e)=>set(e.target.value)} placeholder={ph} style={{ width:"100%" }}/>
          </div>
        ))}
      </div>
      <button onClick={handleMint} disabled={!ok} style={{ width:"100%" }}>{loading?"Minting…":`Mint Basket — ${selectedSymbols.length} assets`}</button>
      {!sumOk&&selectedSymbols.length>0&&<p style={{ color:"var(--red)",fontSize:"0.76rem",marginTop:8 }}>Weights must sum to 1.0 before minting.</p>}
      {status&&<p className="status">{status}</p>}
    </div>
  );
}

export default function AdminDashboard({ signer, provider }) {
  const [selected,setSelected]=useState(new Set()); const [weights,setWeights]=useState({});
  const [lastMinted,setLastMinted]=useState(null); const [basketCount,setBasketCount]=useState(0);
  const [selectedBasket,setSelectedBasket]=useState(null); const [activeTab,setActiveTab]=useState("mint");
  const [refreshKey,setRefreshKey]=useState(0);

  useEffect(()=>{
    if (!provider||!ADDRESSES.manager) return;
    new Contract(ADDRESSES.manager,BasketManagerABI,provider).basketsCount().then(n=>setBasketCount(Number(n))).catch(console.error);
  },[provider,refreshKey]);

  if (selectedBasket!==null) return (
    <BasketDetail basketId={selectedBasket} provider={provider} signer={signer}
      address={null} isAdmin={true}
      onBack={()=>{ setSelectedBasket(null); setRefreshKey(k=>k+1); }}
      onDeactivate={()=>setRefreshKey(k=>k+1)}/>
  );

  function toggleToken(symbol) {
    setSelected(prev=>{
      const next=new Set(prev);
      if (next.has(symbol)) { next.delete(symbol); setWeights(w=>{ const n={...w}; delete n[symbol]; return n; }); }
      else { next.add(symbol); const ev=(1/next.size).toFixed(6); setWeights(()=>{ const n={}; next.forEach(s=>{ n[s]=ev; }); return n; }); }
      return next;
    });
  }

  function handleMintSuccess(id) {
    setLastMinted(id); setSelected(new Set()); setWeights({});
    setRefreshKey(k=>k+1); setActiveTab("baskets");
  }

  async function handleAdminDestroy(id,destroyFlag,reactivate=false) {
    if (!signer) return;
    try {
      const mgr=new Contract(ADDRESSES.manager,BasketManagerABI,signer);
      if (reactivate) await (await mgr.reactivateBasket(id)).wait();
      else await (await mgr.deactivateBasket(id,destroyFlag)).wait();
      setRefreshKey(k=>k+1);
    } catch(err) { alert(`Error: ${err.reason||err.message}`); }
  }

  const selectedArr=[...selected];

  return (
    <div>
      <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:22 }}>
        <span className="section-title">Admin</span>
        {lastMinted!==null&&<span className="tag tag-green">Basket #{lastMinted} created</span>}
      </div>
      <div style={{ display:"flex",gap:6,marginBottom:22 }}>
        {[["mint","Mint New Basket"],["baskets",`Manage Baskets (${basketCount})`]].map(([v,lbl])=>(
          <button key={v} className={`nav-tab ${activeTab===v?"active":""}`} onClick={()=>setActiveTab(v)}>{lbl}</button>
        ))}
      </div>
      {activeTab==="mint" && (
        <div>
          <p className="admin-hint">Click tokens to add to the basket. Selected: {selected.size}</p>
          <div className="admin-token-grid">
            {ALL_ASSETS.map(asset=>(
              <TokenCard key={asset.symbol} asset={asset} selected={selected.has(asset.symbol)} onToggle={()=>toggleToken(asset.symbol)}/>
            ))}
          </div>
          {selectedArr.length>0&&(
            <>
              <WeightEditor selected={selectedArr} weights={weights} onChange={(sym,val)=>setWeights(w=>({...w,[sym]:val}))}/>
              <MintForm signer={signer} selectedSymbols={selectedArr} weights={weights} onSuccess={handleMintSuccess}/>
            </>
          )}
        </div>
      )}
      {activeTab==="baskets" && (
        <div>
          {basketCount===0 ? (
            <div className="card" style={{ textAlign:"center",padding:"48px 24px" }}>
              <div style={{ color:"var(--txt2)",fontSize:"0.85rem" }}>No baskets yet — mint one from the Mint tab.</div>
            </div>
          ) : (
            <>
              <p className="admin-hint">Click a basket to view details, rebalance, or manage lifecycle.</p>
              <div className="basket-grid">
                {Array.from({length:basketCount},(_,i)=>(
                  <BasketCard key={`b${i}-${refreshKey}`} basketId={i} provider={provider}
                    onDetail={()=>setSelectedBasket(i)} isAdmin={true} onDestroy={handleAdminDestroy}/>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
