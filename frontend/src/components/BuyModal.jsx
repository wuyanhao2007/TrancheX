import { useState, useEffect } from "react";
import { Contract, parseUnits, formatUnits, MaxUint256 } from "ethers";
import { ADDRESSES, ERC20_ABI } from "../config";
import BasketManagerABI from "../abis/BasketManager.json";

export default function BuyModal({ isOpen, onClose, basketId, basketInfo, signer, provider, address }) {
  const [step, setStep]       = useState(0);
  const [amount, setAmount]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [txHash, setTxHash]   = useState("");
  const [sharesOut, setSharesOut] = useState(null);
  const [needApprove, setNeedApprove] = useState(false);
  const [stableDec, setStableDec]     = useState(6);

  useEffect(() => {
    if (!isOpen||!provider||!address) return;
    new Contract(ADDRESSES.stable, ERC20_ABI, provider).decimals().then((d)=>setStableDec(Number(d))).catch(()=>{});
  }, [isOpen, provider, address]);

  useEffect(() => {
    if (!amount||!basketInfo||isNaN(parseFloat(amount))) { setSharesOut(null); return; }
    try {
      const raw  = parseUnits(amount, stableDec);
      const nps  = basketInfo.nps || BigInt(1e18);
      const norm = raw * BigInt(10**(18-stableDec));
      setSharesOut((norm * BigInt(1e18)) / nps);
    } catch { setSharesOut(null); }
  }, [amount, basketInfo, stableDec]);

  if (!isOpen) return null;

  function reset() { setStep(0);setAmount("");setError("");setTxHash("");setSharesOut(null);setNeedApprove(false); }
  function handleClose() { reset(); onClose(); }

  async function handleNext() {
    if (step===0) {
      if (!amount||isNaN(parseFloat(amount))) return;
      setLoading(true); setError("");
      try {
        const stable = new Contract(ADDRESSES.stable, ERC20_ABI, provider);
        const raw = parseUnits(amount, stableDec);
        const allowance = await stable.allowance(address, ADDRESSES.manager);
        setNeedApprove(allowance < raw);
        setStep(allowance < raw ? 1 : 2);
      } catch(e) { setError(e.message); } finally { setLoading(false); }
    } else if (step===1) {
      setLoading(true); setError("");
      try {
        await (await new Contract(ADDRESSES.stable, ERC20_ABI, signer).approve(ADDRESSES.manager, MaxUint256)).wait();
        setStep(2);
      } catch(e) { setError(e.reason||e.message); } finally { setLoading(false); }
    } else if (step===2) {
      setLoading(true); setError("");
      try {
        const mgr = new Contract(ADDRESSES.manager, BasketManagerABI, signer);
        const tx  = await mgr.purchase(parseUnits(amount, stableDec), address, basketId);
        const receipt = await tx.wait();
        let shares = sharesOut;
        for (const log of receipt.logs) {
          try { const p=mgr.interface.parseLog(log); if (p?.name==="Purchased") shares=p.args.sharesMinted; } catch(_){}
        }
        setSharesOut(shares); setTxHash(receipt.hash); setStep(3);
      } catch(e) { setError(e.reason||e.message); } finally { setLoading(false); }
    }
  }

  const npsF = basketInfo?.nps ? `$${(Number(basketInfo.nps)/1e18).toFixed(6)}` : "—";
  const visSteps = needApprove ? ["Amount","Approve","Confirm","Done"] : ["Amount","Confirm","Done"];

  return (
    <div className="modal-overlay" onClick={(e)=>e.target===e.currentTarget&&handleClose()}>
      <div className="modal-box">
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18 }}>
          <div>
            <div style={{ fontWeight:800,fontSize:"1rem",color:"var(--txt)" }}>Buy {basketInfo?.symbol||`Basket #${basketId}`}</div>
            {basketInfo?.name && <div style={{ fontSize:"0.74rem",color:"var(--txt2)",marginTop:2 }}>{basketInfo.name}</div>}
          </div>
          <button onClick={handleClose} style={{ background:"none",border:"none",color:"var(--txt2)",fontSize:"1.2rem",cursor:"pointer",lineHeight:1,padding:0 }}>✕</button>
        </div>
        <div className="step-bar">
          {visSteps.map((_,i)=>{
            const done=i<step-(needApprove?0:1); const active=i===step-(needApprove?0:1);
            return <div key={i} className={`step-bar-seg ${done?"done":active?"active":""}`}/>;
          })}
        </div>
        {step===0 && (
          <div>
            <div style={{ fontSize:"0.72rem",color:"var(--txt2)",textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600,marginBottom:6 }}>Amount (USDC)</div>
            <input type="number" min="0" step="any" placeholder="0.00" value={amount} onChange={(e)=>setAmount(e.target.value)} autoFocus style={{ width:"100%",marginBottom:14 }}/>
            <div style={{ display:"flex",justifyContent:"space-between",fontSize:"0.78rem",padding:"8px 0",borderTop:"1px solid var(--c2)" }}>
              <span style={{ color:"var(--txt2)" }}>Price / share</span>
              <span style={{ color:"var(--green)",fontWeight:700 }}>{npsF}</span>
            </div>
            {sharesOut && (
              <div style={{ display:"flex",justifyContent:"space-between",fontSize:"0.78rem",padding:"8px 0",borderTop:"1px solid var(--c2)" }}>
                <span style={{ color:"var(--txt2)" }}>Est. shares out</span>
                <span style={{ color:"var(--green)",fontWeight:700 }}>{parseFloat(formatUnits(sharesOut,18)).toFixed(6)} {basketInfo?.symbol}</span>
              </div>
            )}
          </div>
        )}
        {step===1 && (
          <div style={{ textAlign:"center",padding:"16px 0" }}>
            <div style={{ fontSize:"2rem",marginBottom:10 }}>🔐</div>
            <div style={{ fontWeight:700,color:"var(--txt)",marginBottom:6 }}>Approve USDC</div>
            <div style={{ fontSize:"0.82rem",color:"var(--txt2)" }}>Allow the basket manager to spend your USDC.</div>
          </div>
        )}
        {step===2 && (
          <div>
            <div style={{ fontSize:"0.72rem",color:"var(--txt2)",textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600,marginBottom:10 }}>Confirm order</div>
            {[["You pay",`${amount} USDC`],["You receive",sharesOut?`≈ ${parseFloat(formatUnits(sharesOut,18)).toFixed(6)} ${basketInfo?.symbol}`:"—"],["Price / share",npsF]].map(([k,v])=>(
              <div key={k} style={{ display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid var(--c2)",fontSize:"0.88rem" }}>
                <span style={{ color:"var(--txt2)" }}>{k}</span>
                <span style={{ fontWeight:700,color:"var(--txt)" }}>{v}</span>
              </div>
            ))}
          </div>
        )}
        {step===3 && (
          <div style={{ textAlign:"center",padding:"12px 0" }}>
            <div style={{ fontSize:"2.2rem",marginBottom:10 }}>✅</div>
            <div style={{ fontWeight:800,color:"var(--green)",fontSize:"1rem",marginBottom:8 }}>Purchase confirmed</div>
            {sharesOut && <div style={{ color:"var(--txt2)",fontSize:"0.85rem",marginBottom:10 }}>Received {parseFloat(formatUnits(sharesOut,18)).toFixed(6)} {basketInfo?.symbol}</div>}
            {txHash && <div style={{ fontFamily:"var(--mono)",fontSize:"0.72rem",color:"var(--txt2)" }}>Tx: {txHash.slice(0,22)}…</div>}
          </div>
        )}
        {error && <div style={{ marginTop:12,padding:"8px 12px",background:"#1a0000",borderRadius:"var(--rs)",color:"var(--red)",fontSize:"0.78rem",border:"1px solid #3d0000" }}>{error}</div>}
        <div style={{ marginTop:18,display:"flex",gap:8 }}>
          {step<3 ? (
            <>
              <button onClick={handleClose} disabled={loading} style={{ flex:1,background:"transparent",border:"1px solid var(--c2)",color:"var(--txt2)",borderRadius:"var(--rs)" }}>Cancel</button>
              <button onClick={handleNext} disabled={loading||(step===0&&!amount)} style={{ flex:2 }}>
                {loading?"Processing…":step===0?"Continue →":step===1?"Approve USDC":"Confirm Purchase"}
              </button>
            </>
          ) : <button onClick={handleClose} style={{ flex:1 }}>Done</button>}
        </div>
      </div>
    </div>
  );
}
