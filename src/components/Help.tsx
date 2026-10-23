// "How to read this" overlay: color legend, what each panel means, and keyboard shortcuts.
const sw = (c: string) => <i style={{ background: c }} />;
export default function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="panel help" onClick={e => e.stopPropagation()}>
        <div className="ph"><b>How to read Strike Zone</b><button className="ghost" onClick={onClose}>✕</button></div>
        <div className="hgrid">
          <div>
            <h4>Colors</h4>
            <p>{sw('#22c55e')} Bids, buyers, taker buys</p><p>{sw('#ef4444')} Asks, sellers, taker sells</p>
            <p>{sw('#f97316')} Long liquidations (below price: longs get forced to sell)</p><p>{sw('#38bdf8')} Short liquidations (above price: shorts get forced to buy)</p>
            <p>{sw('#f5c542')} Mid price, your position, highlights</p><p>{sw('#eab308')} Warnings</p>
            <h4>Pressure score</h4>
            <p>One number from −100 to +100: book imbalance within 1% (40 pts), 15-minute taker flow (30), which liquidation pool is closer and bigger (20), and crowded funding as a contrarian tilt (10). Above +15 leans up, below −15 leans down. Hover it to see the parts.</p>
          </div>
          <div>
            <h4>Chart</h4>
            <p>Left edge: resting order-book liquidity at each price. Right edge: where leveraged positions get liquidated. Dashed lines: individual whale liquidation prices. Price tends to get pulled toward the bigger liquidation pool.</p>
            <h4>Heatmap</h4>
            <p>Each column is one second of Strike's live book. Bright bands are big resting orders; if one vanishes as price nears it, it was likely a spoof. Bubbles are market orders. Press ▶ or R to replay what this session recorded.</p>
            <h4>Trader brief</h4>
            <p>Eleven rule-based reads from live data. Buttons on a card load that idea into the ticket with an entry, an ATR-based stop and a target. Check the risk preview before you send.</p>
          </div>
          <div>
            <h4>Keyboard</h4>
            <p><kbd>1</kbd>–<kbd>6</kbd> timeframe · <kbd>J</kbd>/<kbd>K</kbd> next/prev market</p>
            <p><kbd>B</kbd> long · <kbd>S</kbd> short (opens the ticket)</p>
            <p><kbd>R</kbd> heatmap replay · <kbd>L</kbd> liquidity profile · <kbd>W</kbd> whale lines</p>
            <p><kbd>/</kbd> filter markets · <kbd>?</kbd> this help · <kbd>Esc</kbd> close</p>
            <h4>Data and limits</h4>
            <p>Everything comes live from Strike's public API and WebSocket. Strike doesn't publish historical order books, so replay covers only what this tab has recorded (up to 30 minutes). Liquidation prices in the ticket are isolated-margin estimates. Signals are heuristics, not financial advice.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
