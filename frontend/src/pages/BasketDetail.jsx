import { useState, useEffect, useCallback } from "react";
import { Contract, parseUnits, formatUnits, MaxUint256 } from "ethers";
import { ADDRESSES, ERC20_ABI } from "../config";
import BasketManagerABI from "../abis/BasketManager.json";
import AttestationRegistryABI from "../abis/AttestationRegistry.json";
import LineChart from "../components/LineChart";
import BuyModal from "../components/BuyModal";
import { computeBasketHistory } from "../utils/history";
import { deduplicateModules } from "../utils/compliance";
import assetsData from "../../../data/assets.json";
const ALL_ASSETS = assetsData.assets;

function ComplianceTags({ provider, address, modules }) {
  const [statuses, setStatuses] = useState({});
  useEffect(() => {
    if (!provider||!address||!modules.length) return;
    const reg = new Contract(ADDRESSES.attestationRegistry, AttestationRegistryABI, provider);
    Promise.all(modules.map(async(m)=>[m, await reg.hasAttestation(address,m).catch(()=>false)]))
      .then((pairs)=>setStatuses(Object.fromEntries(pairs)));
  }, [provider, address, modules]);
  if (!modules.length) return <span style={{ fontSize:"0.78rem",color:"var(--green)" }}>No requirements</span>;
  return (
    <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
      {modules.map((m)=>(
        <span key={m} style={{ fontSize:"0.72rem",padding:"3px 10px",borderRadius:20,
          background:statuses[m]?"#001a0d":"#1a0000",color:statuses[m]?"var(--green2)":"var(--red)",
          border:`1px solid ${statuses[m]?"var(--green2)":"var(--red)"}`,fontWeight:600 }}>
          {statuses[m]?"✓":"✗"} {m}
        </span>
      ))}
    </div>
  );
}

function RedeemWidget({ signer, address, basketId, symbol }) {
  const [amount,setAmount]=useState(""); const [status,setStatus]=useState(""); const [loading,setLoading]=useState(false);
  async function handleRedeem() {
    if (!signer||!amount) return; setLoading(true); setStatus("Redeeming…");
    try {
      const mgr=new Contract(ADDRESSES.manager,BasketManagerABI,signer);
      const receipt=await (await mgr.redeem(parseUnits(amount,18),address,basketId)).wait();
      let ret=null;
      for (const log of receipt.logs) { try{ const p=mgr.interface.parseLog(log); if(p?.name==="Redeemed") ret=p.args.stableReturned; }catch(_){} }
      setStatus(ret!=null?`Received ${formatUnits(ret,6)} USDC`:`Tx: ${receipt.hash.slice(0,18)}…`);
    } catch(err) { setStatus(`Error: ${err.reason||err.message}`); } finally { setLoading(false); }
  }
  return (
    <div>
      <div className="input-row">
        <input type="number" min="0" step="any" placeholder={`${symbol??""} shares`} value={amount} onChange={(e)=>setAmount(e.target.value)} disabled={loading}/>
        <button onClick={handleRedeem} disabled={loading||!amount} style={{ background:"transparent",border:"1px solid var(--green2)",color:"var(--green2)" }}>{loading?"…":"Redeem"}</button>
      </div>
      {status && <p className="status">{status}</p>}
    </div>
  );
}

function RebalancePanel({ signer, basketId, assets, currentWeights, assetMetas, onDone }) {
  const [weights,setWeights]=useState(()=>currentWeights.map(String));
  const [status,setStatus]=useState(""); const [loading,setLoading]=useState(false);
  useEffect(()=>{ setWeights(currentWeights.map(String)); },[currentWeights.join(",")]);
  const bpVals=weights.map((w)=>Math.round(parseFloat(w)||0));
  const sum=bpVals.reduce((a,b)=>a+b,0); const sumOk=sum===10000;
  function distributeEvenly(){ const each=Math.floor(10000/assets.length); const rem=10000-each*assets.length;
    setWeights(assets.map((_,i)=>String(i===assets.length-1?each+rem:each))); }
  async function handleRebalance() {
    if (!signer||!sumOk) return; setLoading(true); setStatus("Updating weights…");
    try {
      const mgr=new Contract(ADDRESSES.manager,BasketManagerABI,signer);
      const adj=[...bpVals]; adj[adj.length-1]+=10000-adj.reduce((a,b)=>a+b,0);
      await (await mgr.updateBasketWeights(basketId,adj)).wait();
      setStatus("Executing rebalance…");
      await (await mgr.executeRebalance(adj.map(()=>BigInt(0)),basketId)).wait();
      setStatus("Done ✓"); onDone&&onDone(adj);
    } catch(err) { setStatus(`Error: ${err.reason||err.message}`); } finally { setLoading(false); }
  }
  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
        <div style={{ fontSize:"0.75rem",fontWeight:700,color:sumOk?"var(--green)":"var(--red)" }}>{sum} / 10000 bps {sumOk?"✓":""}</div>
        <button className="btn-sm" onClick={distributeEvenly} disabled={loading}>Equal</button>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 90px 46px",gap:"6px 10px",alignItems:"center",marginBottom:14 }}>
        {assets.map((addr,i)=>{ const meta=assetMetas.find(a=>a.address.toLowerCase()===addr.toLowerCase()); return [
          <span key={`l${i}`} style={{ fontSize:"0.82rem",color:"var(--txt)" }}>{meta?.symbol??`${addr.slice(0,8)}…`}</span>,
          <input key={`i${i}`} type="number" min="0" max="10000" step="1" value={weights[i]??""} onChange={(e)=>{ const n=[...weights]; n[i]=e.target.value; setWeights(n); }} style={{ padding:"4px 8px",fontSize:"0.82rem" }}/>,
          <span key={`p${i}`} style={{ fontSize:"0.7rem",color:"var(--txt2)" }}>{((bpVals[i]/100)||0).toFixed(1)}%</span>
        ]; })}
      </div>
      <button onClick={handleRebalance} disabled={!sumOk||loading} style={{ width:"100%",opacity:sumOk?1:0.4 }}>
        {loading?"Processing…":"Update Weights & Rebalance"}
      </button>
      {status && <p className="status">{status}</p>}
    </div>
  );
}

export default function BasketDetail({ basketId, provider, signer, address, isAdmin, onBack, onDeactivate }) {
  const [info,setInfo]=useState(null); const [assets,setAssets]=useState([]); const [weights,setWeights]=useState([]);
  const [modules,setModules]=useState([]); const [supply,setSupply]=useState(null); const [status,setStatus]=useState(0);
  const [history,setHistory]=useState(null); const [showBuy,setShowBuy]=useState(false);
  const [adminMsg,setAdminMsg]=useState(""); const [adminLoading,setAdminLoading]=useState(false);

  const loadData = useCallback(()=>{
    if (!provider) return;
    const mgr=new Contract(ADDRESSES.manager,BasketManagerABI,provider);
    Promise.all([mgr.basketData(basketId),mgr.getNav(basketId),mgr.navPerShare(basketId),
      mgr.getBasketAssets(basketId),mgr.getBasketWeights(basketId),mgr.getBasketModules(basketId),mgr.getBasketStatus(basketId)])
      .then(async([data,nav,nps,assetArr,wArr,mods,st])=>{
        setInfo({data,nav,nps}); setAssets([...assetArr]); setWeights(wArr.map(Number)); setStatus(Number(st));
        const assetModuleArrays=assetArr.map(addr=>ALL_ASSETS.find(a=>a.address.toLowerCase()===addr.toLowerCase())?.complianceModules||[]);
        setModules(deduplicateModules([[...mods],...assetModuleArrays]));
        const sup=await new Contract(data.token,["function totalSupply() view returns (uint256)"],provider).totalSupply();
        setSupply(sup);
      }).catch(console.error);
  },[provider,basketId]);

  useEffect(()=>{ loadData(); },[loadData]);
  useEffect(()=>{
    if (!assets.length||!weights.length) return;
    computeBasketHistory(assets,weights,ALL_ASSETS).then(setHistory);
  },[assets.join(","),weights.join(",")]);

  const nav   = info ? Number(info.nav)/1e18 : null;
  const price = info && supply && supply>0n ? Number((info.nav*BigInt(1e6))/supply)/1e6 : info ? Number(info.nps)/1e18 : null;
  const basketInfo = info ? {name:info.data.name,symbol:info.data.symbol,nav:info.nav,nps:info.nps} : null;
  const destroyed=status===2, inactive=status===1;

  async function handleLifecycle(destroyFlag) {
    if (!signer) return; setAdminLoading(true); setAdminMsg("");
    try {
      await (await new Contract(ADDRESSES.manager,BasketManagerABI,signer).deactivateBasket(basketId,destroyFlag)).wait();
      setStatus(destroyFlag?2:1); setAdminMsg(`Basket ${destroyFlag?"permanently destroyed":"deactivated"}.`);
      onDeactivate&&onDeactivate(basketId);
    } catch(err) { setAdminMsg(`Error: ${err.reason||err.message}`); } finally { setAdminLoading(false); }
  }

  async function handleReactivate() {
    if (!signer) return; setAdminLoading(true); setAdminMsg("");
    try {
      await (await new Contract(ADDRESSES.manager,BasketManagerABI,signer).reactivateBasket(basketId)).wait();
      setStatus(0); setAdminMsg("Basket reactivated.");
    } catch(err) { setAdminMsg(`Error: ${err.reason||err.message}`); } finally { setAdminLoading(false); }
  }

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← Back</button>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20 }}>
        <div>
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:4 }}>
            <h1 style={{ fontSize:"2rem",fontWeight:800,color:"var(--green)",letterSpacing:"-0.8px",lineHeight:1 }}>
              {info?info.data.name:`Basket #${basketId}`}
            </h1>
          </div>
          <div style={{ display:"flex",gap:6,alignItems:"center",flexWrap:"wrap" }}>
            <span style={{ color:"var(--txt2)",fontSize:"0.82rem" }}>{info?.data.symbol}</span>
            {info?.data.isERC3643&&<span className="tag tag-outline">ERC-3643</span>}
            {status===1&&<span className="tag tag-amber">Inactive</span>}
            {status===2&&<span className="tag tag-red">Destroyed</span>}
          </div>
        </div>
        {!isAdmin&&!destroyed&&!inactive&&(
          <button onClick={()=>setShowBuy(true)} style={{ padding:"10px 22px",fontSize:"0.92rem" }}>Buy</button>
        )}
      </div>
      <div className="card" style={{ marginBottom:14 }}>
        <div className="stat-row" style={{ marginBottom:0 }}>
          <div className="stat"><span className="label">NAV (USDC)</span><span className="value">{nav!==null?`$${nav.toFixed(4)}`:"—"}</span></div>
          <div className="stat"><span className="label">Price / Share</span><span className="value">{price!==null?`$${price.toFixed(6)}`:"—"}</span></div>
          {supply!==null&&<div className="stat"><span className="label">Total Supply</span><span className="value">{parseFloat(formatUnits(supply,18)).toFixed(2)}</span></div>}
        </div>
      </div>
      <div className="card" style={{ marginBottom:14 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
          <h2 style={{ marginBottom:0 }}>Basket Price History</h2>
          <span style={{ fontSize:"0.68rem",color:"var(--txt2)" }}>weighted avg · component prices</span>
        </div>
        <LineChart data={history} height={150}/>
      </div>
      <div className="card" style={{ marginBottom:14 }}>
        <h2>Composition</h2>
        <table className="asset-table">
          <thead><tr><th>Asset</th><th>Symbol</th><th>Weight</th></tr></thead>
          <tbody>
            {assets.map((addr,i)=>{ const meta=ALL_ASSETS.find(a=>a.address.toLowerCase()===addr.toLowerCase()); return (
              <tr key={addr}>
                <td style={{ fontSize:"0.72rem" }}>{addr.slice(0,10)}…{addr.slice(-6)}</td>
                <td style={{ fontFamily:"var(--font)",color:"var(--green)",fontWeight:700 }}>{meta?.symbol??"—"}</td>
                <td>
                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <div style={{ width:Math.max(4,(weights[i]/100)),height:5,background:"var(--green2)",borderRadius:2,flexShrink:0 }}/>
                    <span>{((weights[i]||0)/100).toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      {modules.length>0 && (
        <div className="card" style={{ marginBottom:14 }}>
          <h2 style={{ marginBottom:10 }}>Compliance</h2>
          {address ? <ComplianceTags provider={provider} address={address} modules={modules}/>
            : <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>{modules.map(m=><span key={m} className="tag tag-green">{m}</span>)}</div>}
        </div>
      )}
      {!isAdmin&&!destroyed&&(
        <div className="card" style={{ marginBottom:14 }}>
          <h2>Redeem</h2>
          <RedeemWidget signer={signer} address={address} basketId={basketId} symbol={info?.data.symbol}/>
        </div>
      )}
      {isAdmin&&assets.length>0&&(
        <div className="card" style={{ marginBottom:14,borderColor:"var(--green)" }}>
          <h2 style={{ color:"var(--green)",marginBottom:14 }}>Rebalance</h2>
          <RebalancePanel signer={signer} basketId={basketId} assets={assets} currentWeights={weights}
            assetMetas={ALL_ASSETS} onDone={(w)=>setWeights(w)}/>
        </div>
      )}
      {isAdmin&&(
        <div className="card" style={{ marginBottom:14,borderColor:destroyed?"var(--red)":"var(--c2)" }}>
          <h2 style={{ color:"var(--red)",marginBottom:14 }}>Lifecycle</h2>
          {destroyed ? <p style={{ color:"var(--txt2)",fontSize:"0.82rem" }}>Permanently destroyed.</p> : (
            <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
              {inactive&&<button onClick={handleReactivate} disabled={adminLoading} style={{ background:"transparent",border:"1px solid var(--green2)",color:"var(--green2)" }}>{adminLoading?"…":"Reactivate"}</button>}
              {!inactive&&<button onClick={()=>handleLifecycle(false)} disabled={adminLoading} style={{ background:"transparent",border:"1px solid var(--amber)",color:"var(--amber)" }}>{adminLoading?"…":"Deactivate"}</button>}
              <button onClick={()=>{ if(window.confirm(`Permanently destroy basket #${basketId}?`)) handleLifecycle(true); }} disabled={adminLoading} className="btn-danger">{adminLoading?"…":"Destroy Basket"}</button>
            </div>
          )}
          {adminMsg&&<p className="status">{adminMsg}</p>}
        </div>
      )}
      <BuyModal isOpen={showBuy} onClose={()=>setShowBuy(false)} basketId={basketId} basketInfo={basketInfo}
        signer={signer} provider={provider} address={address}/>
    </div>
  );
}
