import { useState, useEffect } from "react";
import { Contract, formatUnits } from "ethers";
import { ADDRESSES } from "../config";
import BasketManagerABI from "../abis/BasketManager.json";

const STATUS = { 0:{label:"Active",cls:"tag-outline"}, 1:{label:"Inactive",cls:"tag-amber"}, 2:{label:"Destroyed",cls:"tag-red"} };

export default function BasketCard({ basketId, provider, onDetail, isAdmin, onDestroy }) {
  const [info, setInfo]     = useState(null);
  const [supply, setSupply] = useState(null);
  const [status, setStatus] = useState(0);

  useEffect(() => {
    if (!provider || !ADDRESSES.manager) return;
    const mgr = new Contract(ADDRESSES.manager, BasketManagerABI, provider);
    Promise.all([mgr.basketData(basketId), mgr.getNav(basketId), mgr.navPerShare(basketId),
      mgr.getBasketStatus(basketId)])
      .then(([data, nav, nps, st]) => {
        setInfo({ data, nav, nps }); setStatus(Number(st));
        return new Contract(data.token, ["function totalSupply() view returns (uint256)"], provider).totalSupply();
      }).then(setSupply).catch(console.error);
  }, [provider, basketId]);

  const nav   = info ? Number(info.nav)/1e18 : null;
  const price = info && supply && supply > 0n
    ? Number((info.nav * BigInt(1e6)) / supply) / 1e6
    : info ? Number(info.nps)/1e18 : null;
  const st = STATUS[status] || STATUS[0];

  return (
    <div
      className={`card basket-card-${status===0?"active":status===1?"inactive":"destroyed"}`}
      style={{ cursor:"pointer", opacity:status===2?0.5:1, transition:"border-color 0.12s,opacity 0.12s", position:"relative" }}
      onClick={onDetail}
    >
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
        <span className={`tag ${st.cls}`}>{st.label}</span>
        {info?.data.isERC3643 && <span className="tag tag-outline">ERC-3643</span>}
      </div>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontWeight:800,color:"var(--txt)",fontSize:"1rem",letterSpacing:"-0.3px" }}>
          {info ? info.data.name : `Basket #${basketId}`}
        </div>
        <div style={{ color:"var(--txt2)",fontSize:"0.75rem",marginTop:2 }}>{info?.data.symbol||"—"}</div>
      </div>
      {info && (
        <div className="stat-row" style={{ marginBottom:12 }}>
          <div className="stat"><span className="label">NAV</span><span className="value" style={{ fontSize:"1.1rem" }}>${nav!==null?nav.toFixed(2):"—"}</span></div>
          <div className="stat"><span className="label">Price/Share</span><span className="value" style={{ fontSize:"1.1rem" }}>${price!==null?price.toFixed(4):"—"}</span></div>
          {supply!==null && <div className="stat"><span className="label">Supply</span><span className="value" style={{ fontSize:"1.1rem" }}>{parseFloat(formatUnits(supply,18)).toFixed(2)}</span></div>}
        </div>
      )}
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <span style={{ fontSize:"0.73rem",color:"var(--green)",fontWeight:600 }}>View →</span>
        {isAdmin && status!==2 && (
          <div style={{ display:"flex",gap:6 }} onClick={(e)=>e.stopPropagation()}>
            {status===1
              ? <button onClick={()=>onDestroy&&onDestroy(basketId,false,true)} className="btn-sm" style={{ borderColor:"var(--green2)",color:"var(--green2)" }}>Reactivate</button>
              : <button onClick={()=>onDestroy&&onDestroy(basketId,false)} className="btn-sm" style={{ borderColor:"var(--amber)",color:"var(--amber)" }}>Deactivate</button>
            }
            <button onClick={()=>onDestroy&&onDestroy(basketId,true)} className="btn-sm" style={{ borderColor:"var(--red)",color:"var(--red)" }}>Destroy</button>
          </div>
        )}
      </div>
    </div>
  );
}
