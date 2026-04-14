import { useEffect, useState } from "react";
import { Contract } from "ethers";
import { ADDRESSES } from "../config";
import LineChart from "../components/LineChart";
import { loadPriceHistory } from "../utils/history";

export default function TokenDetail({ asset, provider, onBack }) {
  const [history, setHistory] = useState(null);
  const [onChainPrice, setOnChainPrice] = useState(null);

  useEffect(() => { loadPriceHistory(asset.symbol).then(setHistory); }, [asset.symbol]);
  useEffect(() => {
    if (!provider||!ADDRESSES.oracle) return;
    new Contract(ADDRESSES.oracle, ["function getPrice(address) view returns (uint256, uint256)"], provider)
      .getPrice(asset.address).then(([p])=>setOnChainPrice(Number(p)/1e18)).catch(()=>{});
  }, [provider, asset.address]);

  const lastP    = history?.length ? history[history.length-1].price : null;
  const display  = onChainPrice ?? lastP;
  const change1d = history?.length>=2
    ? ((history[history.length-1].price - history[history.length-2].price) / history[history.length-2].price * 100)
    : null;

  return (
    <div>
      <button className="back-btn" onClick={onBack}>← Back</button>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20 }}>
        <div>
          <div style={{ fontSize:"2.2rem",fontWeight:800,color:"var(--green)",letterSpacing:"-1px",lineHeight:1 }}>{asset.symbol}</div>
          <div style={{ color:"var(--txt2)",fontSize:"0.85rem",marginTop:4 }}>{asset.name}</div>
          <div style={{ color:"var(--c4)",fontFamily:"var(--mono)",fontSize:"0.7rem",marginTop:4 }}>{asset.address}</div>
        </div>
        {display!==null && (
          <div style={{ textAlign:"right" }}>
            <div style={{ fontWeight:800,fontSize:"1.8rem",color:"var(--txt)",letterSpacing:"-0.5px",lineHeight:1 }}>
              {display>=1000?`$${(display/1000).toFixed(2)}k`:display>=1?`$${display.toFixed(2)}`:`$${display.toFixed(6)}`}
            </div>
            {change1d!==null && (
              <div style={{ fontSize:"0.85rem",fontWeight:600,marginTop:4,color:change1d>=0?"var(--green)":"var(--red)" }}>
                {change1d>=0?"▲":"▼"} {Math.abs(change1d).toFixed(2)}% (24h)
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ display:"flex",gap:6,marginBottom:20,flexWrap:"wrap" }}>
        <span className="tag tag-gray">Decimals: {asset.decimals??18}</span>
        <span className={`tag ${asset.isRWA?"tag-outline":"tag-gray"}`}>{asset.isRWA?"RWA":"Crypto"}</span>
        {history && <span className="tag tag-gray">{history.length}d history</span>}
      </div>
      <div className="card" style={{ marginBottom:14 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
          <h2 style={{ marginBottom:0 }}>Price History</h2>
          {history?.length>=2 && <div style={{ fontSize:"0.72rem",color:"var(--txt2)" }}>{history[0].date} → {history[history.length-1].date}</div>}
        </div>
        <LineChart data={history} height={150}/>
      </div>
      {asset.complianceModules?.length>0 && (
        <div className="card" style={{ marginBottom:14 }}>
          <h2>Compliance Modules</h2>
          <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:12 }}>
            {asset.complianceModules.map((m)=><span key={m} className="tag tag-green">{m}</span>)}
          </div>
          <p style={{ color:"var(--txt2)",fontSize:"0.78rem",lineHeight:1.5 }}>
            Purchasing a basket containing this RWA token requires on-chain attestations for each listed module.
          </p>
        </div>
      )}
      <div className="card" style={{ textAlign:"center",padding:"32px 24px" }}>
        <div style={{ fontSize:"0.78rem",color:"var(--txt2)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10 }}>Purchase</div>
        <div style={{ color:"var(--txt)",fontWeight:700,marginBottom:8 }}>Available in baskets only</div>
        <div style={{ color:"var(--txt2)",fontSize:"0.82rem",maxWidth:340,margin:"0 auto" }}>
          Find a basket containing <strong style={{ color:"var(--green)" }}>{asset.symbol}</strong> and purchase shares there.
        </div>
      </div>
    </div>
  );
}
