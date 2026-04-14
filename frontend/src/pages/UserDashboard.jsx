import { useState, useEffect } from "react";
import { Contract } from "ethers";
import { ADDRESSES } from "../config";
import BasketManagerABI from "../abis/BasketManager.json";
import TokenCard from "../components/TokenCard";
import BasketCard from "../components/BasketCard";
import TokenDetail from "./TokenDetail";
import BasketDetail from "./BasketDetail";
import assetsData from "../../../data/assets.json";

const ALL_ASSETS = assetsData.assets;

export default function UserDashboard({ signer, provider, address }) {
  const [basketCount, setBasketCount] = useState(0);
  const [selectedToken, setSelectedToken] = useState(null);
  const [selectedBasket, setSelectedBasket] = useState(null);

  useEffect(() => {
    if (!provider||!ADDRESSES.manager) return;
    new Contract(ADDRESSES.manager, BasketManagerABI, provider)
      .basketsCount().then((n)=>setBasketCount(Number(n))).catch(console.error);
  }, [provider]);

  if (selectedToken) return <TokenDetail asset={selectedToken} provider={provider} onBack={()=>setSelectedToken(null)}/>;
  if (selectedBasket!==null) return <BasketDetail basketId={selectedBasket} provider={provider} signer={signer}
    address={address} isAdmin={false} onBack={()=>setSelectedBasket(null)}/>;

  return (
    <div>
      <div style={{ marginBottom:36 }}>
        <div className="section-header">
          <span className="section-title">Single Tokens</span>
          <span className="section-count">{ALL_ASSETS.length} assets · click ↗ for details</span>
        </div>
        <TokenGrid assets={ALL_ASSETS} onDetail={setSelectedToken}/>
      </div>
      <hr className="divider"/>
      <div>
        <div className="section-header">
          <span className="section-title">Baskets</span>
          <span className="section-count">{basketCount} basket{basketCount!==1?"s":""}</span>
        </div>
        {basketCount===0 ? (
          <div className="card" style={{ textAlign:"center",padding:"48px 24px" }}>
            <div style={{ color:"var(--txt2)",fontSize:"0.88rem" }}>No baskets yet — ask an admin to mint one.</div>
          </div>
        ) : (
          <div className="basket-grid">
            {Array.from({length:basketCount},(_,i)=>(
              <BasketCard key={i} basketId={i} provider={provider} onDetail={()=>setSelectedBasket(i)} isAdmin={false}/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TokenGrid({ assets, onDetail }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter==="rwa"?assets.filter(a=>a.isRWA):filter==="crypto"?assets.filter(a=>!a.isRWA):assets;
  const counts = { all:assets.length, crypto:assets.filter(a=>!a.isRWA).length, rwa:assets.filter(a=>a.isRWA).length };
  return (
    <>
      <div style={{ display:"flex",gap:6,marginBottom:14 }}>
        {[["all","All"],["crypto","Crypto"],["rwa","RWA"]].map(([v,label])=>(
          <button key={v} className={`filter-chip ${filter===v?"active":""}`} onClick={()=>setFilter(v)}>
            {label} ({counts[v]})
          </button>
        ))}
      </div>
      <div className="token-grid">
        {filtered.map((asset)=>(<TokenCard key={asset.address} asset={asset} onDetail={()=>onDetail(asset)}/>))}
      </div>
    </>
  );
}
