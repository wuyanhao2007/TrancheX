import { useEffect, useState } from "react";
import LineChart from "./LineChart";
import { loadPriceHistory } from "../utils/history";

export default function TokenCard({ asset, onDetail, selected, onToggle }) {
  const [chartData, setChartData] = useState(null);
  useEffect(() => { loadPriceHistory(asset.symbol).then(setChartData); }, [asset.symbol]);
  const lastPrice = chartData?.length ? chartData[chartData.length-1].price : null;
  const change1d  = chartData?.length >= 2
    ? ((chartData[chartData.length-1].price - chartData[chartData.length-2].price) / chartData[chartData.length-2].price * 100)
    : null;
  const isAdminCard = !!onToggle;
  return (
    <div
      className={`card token-card ${isAdminCard?"selectable":""} ${selected?"selected":""}`}
      onClick={isAdminCard ? onToggle : undefined}
      style={{ position:"relative" }}
    >
      {onDetail && (
        <button onClick={(e)=>{e.stopPropagation();onDetail();}}
          style={{ position:"absolute",top:8,right:8,background:"none",border:"none",
            padding:"2px 5px",color:"var(--txt2)",cursor:"pointer",fontSize:"0.9rem",
            borderRadius:4,lineHeight:1 }} title="View details">↗</button>
      )}
      {selected && (
        <div style={{ position:"absolute",top:8,right:onDetail?30:8,width:16,height:16,
          borderRadius:"50%",background:"var(--green)",display:"flex",alignItems:"center",
          justifyContent:"center",fontSize:"0.6rem",fontWeight:800,color:"#000" }}>✓</div>
      )}
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",
        paddingRight:onDetail?22:0,marginBottom:8 }}>
        <div>
          <div style={{ fontWeight:800,color:"var(--txt)",fontSize:"0.9rem",letterSpacing:"-0.2px" }}>{asset.symbol}</div>
          <div style={{ color:"var(--txt2)",fontSize:"0.68rem",marginTop:1 }}>{asset.name}</div>
        </div>
        {lastPrice !== null && (
          <div style={{ textAlign:"right" }}>
            <div style={{ fontWeight:700,color:"var(--green)",fontSize:"0.85rem" }}>
              {lastPrice>=1000?`$${(lastPrice/1000).toFixed(1)}k`:lastPrice>=1?`$${lastPrice.toFixed(2)}`:`$${lastPrice.toFixed(4)}`}
            </div>
            {change1d !== null && (
              <div style={{ fontSize:"0.65rem",color:change1d>=0?"var(--green)":"var(--red)" }}>
                {change1d>=0?"+":""}{change1d.toFixed(1)}%
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ display:"flex",gap:4,flexWrap:"wrap",marginBottom:8 }}>
        {asset.isRWA && <span className="tag tag-outline">RWA</span>}
        {asset.complianceModules?.slice(0,2).map((m)=><span key={m} className="tag tag-green">{m}</span>)}
        {asset.complianceModules?.length > 2 && (
          <span style={{ fontSize:"0.6rem",color:"var(--txt2)",alignSelf:"center" }}>+{asset.complianceModules.length-2}</span>
        )}
      </div>
      {chartData
        ? <LineChart data={chartData.slice(-60)} compact height={40}/>
        : <div style={{ height:40,background:"var(--c2)",borderRadius:4 }}/>
      }
    </div>
  );
}
