export default function LineChart({ data, width = 420, height = 130, color, compact = false }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ height, background: "#0A0A0A", borderRadius: 6, display: "flex",
        alignItems: "center", justifyContent: "center", color: "#444", fontSize: "0.75rem" }}>
        NO DATA
      </div>
    );
  }
  const pad = compact ? { top:3,right:3,bottom:3,left:3 } : { top:10,right:12,bottom:28,left:54 };
  const W = width - pad.left - pad.right;
  const H = height - pad.top  - pad.bottom;
  const prices = data.map((d) => d.price);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const range = maxP - minP || 1;
  const isUp = prices[prices.length-1] >= prices[0];
  const lineColor = color || (isUp ? "#00FF87" : "#FF4444");
  const fillColor = color ? color+"18" : isUp ? "rgba(0,255,135,0.08)" : "rgba(255,68,68,0.08)";
  const toX = (i) => pad.left + (i / (data.length - 1)) * W;
  const toY = (p) => pad.top  + H - ((p - minP) / range) * H;
  const pts  = data.map((d, i) => `${toX(i)},${toY(d.price)}`).join(" ");
  const area = [`M${toX(0)},${pad.top+H}`, ...data.map((d,i)=>`L${toX(i)},${toY(d.price)}`),
    `L${toX(data.length-1)},${pad.top+H}`, "Z"].join(" ");
  const fmtP = (p) => p>=1e6?`$${(p/1e6).toFixed(1)}M`:p>=1e3?`$${(p/1e3).toFixed(1)}k`:`$${p.toFixed(p<1?4:2)}`;
  const dLabels = compact ? [] : [0, Math.floor((data.length-1)/3), Math.floor((data.length-1)*2/3), data.length-1]
    .map((i) => ({ x: toX(i), label: data[i].date?.slice(5) || "" }));
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display:"block", overflow:"visible" }}>
      {!compact && [0.25,0.5,0.75].map((f) => {
        const y = pad.top + H*(1-f);
        return <g key={f}>
          <line x1={pad.left} y1={y} x2={pad.left+W} y2={y} stroke="#1A1A1A" strokeWidth="1"/>
          <text x={pad.left-5} y={y+4} textAnchor="end" fontSize="9" fill="#555" fontFamily="monospace">{fmtP(minP+range*f)}</text>
        </g>;
      })}
      <path d={area} fill={fillColor}/>
      <polyline points={pts} fill="none" stroke={lineColor} strokeWidth={compact?"1.5":"1.8"} strokeLinejoin="round"/>
      {dLabels.map(({x,label},i) => <text key={i} x={x} y={height-5} textAnchor="middle" fontSize="9" fill="#555" fontFamily="monospace">{label}</text>)}
      {!compact && <circle cx={toX(data.length-1)} cy={toY(prices[prices.length-1])} r="3" fill={lineColor}/>}
    </svg>
  );
}
