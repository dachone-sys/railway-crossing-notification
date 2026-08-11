type Props = {
  currentMode: "SLOW_ALLOWED" | "PREPARE_STOP" | "STOP" | "EMERGENCY_STOP";
  waitingVehicles: number;
};

function CrossingVisual({ currentMode, waitingVehicles }: Props) {
  const isSlowAllowed = currentMode === "SLOW_ALLOWED";
  const isPrepareStop = currentMode === "PREPARE_STOP";
  const isStop = currentMode === "STOP" || currentMode === "EMERGENCY_STOP";

  const carCount = isSlowAllowed ? 14 : isPrepareStop ? 12 : 10;

  return (
    <div className="crossingVisualBox">
      <h2>踏切状況イメージ</h2>

      <div className="visualLegend">
        {isSlowAllowed && "青：踏切区間だけ徐行し、それ以外は通常速度で流れます"}
        {isPrepareStop && "黄：踏切前で一時停止してから進むため、車列が伸びやすい状態"}
        {isStop && "赤：列車通過中のため車は踏切前で完全停止します"}
      </div>

      <div className="crossingScene">
        <div className="road">
          <div className="laneMark" />
          <div className="slowZone">徐行区間</div>
          <div className="stopLine" />
          <div className="crossingZone">踏切</div>

          <div
            className={[
              "continuousTraffic",
              isSlowAllowed ? "trafficBlue" : "",
              isPrepareStop ? "trafficYellow" : "",
              isStop ? "trafficRed" : "",
            ].join(" ")}
          >
            {Array.from({ length: carCount }).map((_, index) => (
              <div className="carBody" key={index}>
                <div className="carWindow" />
                <div className="carFront" />
                <div className="wheel wheelLeft" />
                <div className="wheel wheelRight" />
              </div>
            ))}
          </div>
        </div>

        <div className="railArea">
          <div className={`gate gateLeft ${isStop ? "gateDown" : "gateUp"}`} />
          <div className={`gate gateRight ${isStop ? "gateDown" : "gateUp"}`} />

          <div className="railName">線路</div>

          <div className="railTrack">
            <div className="railLine" />
            <div className="railLine" />
            <div className="sleeperRow">
              {Array.from({ length: 16 }).map((_, i) => (
                <span key={i} className="sleeper" />
              ))}
            </div>
          </div>

          {isStop && <div className="trainVisual">🚃🚃🚃</div>}

          {isSlowAllowed && <div className="signalBadge blueBadge">徐行可</div>}
          {isPrepareStop && <div className="signalBadge yellowBadge">一時停止後に進行</div>}
          {isStop && <div className="signalBadge redBadge">列車通過中・待機</div>}
        </div>

        <div className="jamMeter">
          <div className="jamLabel">渋滞度</div>
          <div className="jamBar">
            <div
              className={[
                "jamFill",
                isSlowAllowed ? "jamLow" : "",
                isPrepareStop ? "jamMedium" : "",
                isStop ? "jamHigh" : "",
              ].join(" ")}
            />
          </div>
          <div className="jamText">
            {isSlowAllowed && "低い"}
            {isPrepareStop && "上昇"}
            {isStop && "高い"}
          </div>
        </div>

        <div className="visualNote">
          現在の待機車両数：{waitingVehicles.toFixed(1)} 台
        </div>
      </div>
    </div>
  );
}

export default CrossingVisual;