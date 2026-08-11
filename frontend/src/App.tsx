import CrossingVisual from "./CrossingVisual";
import { useEffect, useRef, useState } from "react";
import "./App.css";

type CrossingState = {
  crossing_id: string;
  test_mode: string;
  cycle_seconds: number;
  train_schedule: number[];
  countdown_seconds: number;
  current_mode: "SLOW_ALLOWED" | "PREPARE_STOP" | "STOP" | "EMERGENCY_STOP";
  display_text: string;
  message: string;
  time_status_label?: string;

  communication_status: string;
  sensor_status: string;
  obstacle_detected: boolean;
  confidence_score: number;

  vehicle_count: number;
  waiting_vehicles: number;
  average_wait_time: number;

  arriving_vehicles: number;
  passed_vehicles: number;
  pass_capacity: number;
  simulation_seconds: number;

  current_rule_wait_time: number;
  proposed_rule_wait_time: number;
  improvement_rate: number;

  evaluation: string;
  evaluation_level: "HIGH" | "MEDIUM" | "LOW";
};

type Scenario = {
  name: string;
  description: string;
  cycleSeconds: number;
  trainSchedule: number[];
};

const scenarios: Scenario[] = [
  {
    name: "標準",
    description: "基本デモ用。状態変化を確認しやすい設定",
    cycleSeconds: 240,
    trainSchedule: [200],
  },
  {
    name: "列車少なめ",
    description: "列車間隔が長く、徐行可が多い状態",
    cycleSeconds: 360,
    trainSchedule: [300],
  },
  {
    name: "列車多め",
    description: "列車本数が多く、停止・渋滞が起きやすい状態",
    cycleSeconds: 240,
    trainSchedule: [80, 160, 220],
  },
  {
    name: "短時間確認",
    description: "すぐに青・黄・赤の変化を確認する用",
    cycleSeconds: 90,
    trainSchedule: [60],
  },
];

function App() {
  const [state, setState] = useState<CrossingState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState("接続中");
  const [viewMode, setViewMode] = useState<"driver" | "admin">("admin");

  const [cycleInput, setCycleInput] = useState("240");
  const [scheduleInput, setScheduleInput] = useState("200");
  const [configMessage, setConfigMessage] = useState("");

  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);

  const changeTestMode = async (mode: string) => {
    await fetch(`http://127.0.0.1:8000/api/test-mode/${mode}`, {
      method: "POST",
    });
  };

  const resetSimulation = async () => {
    await fetch("http://127.0.0.1:8000/api/simulation/reset", {
      method: "POST",
    });
  };

  const sendSimulationConfig = async (
    cycleSeconds: number,
    trainSchedule: number[]
  ) => {
    const response = await fetch("http://127.0.0.1:8000/api/simulation/config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cycle_seconds: cycleSeconds,
        train_schedule: trainSchedule,
      }),
    });

    const result = await response.json();

    if (result.success) {
      setConfigMessage("設定を更新しました");
    } else {
      setConfigMessage(result.message || "設定更新に失敗しました");
    }
  };

  const updateSimulationConfig = async () => {
    const cycleSeconds = Number(cycleInput);

    const trainSchedule = scheduleInput
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => !Number.isNaN(value));

    await sendSimulationConfig(cycleSeconds, trainSchedule);
  };

  const applyScenario = async (scenario: Scenario) => {
    setCycleInput(String(scenario.cycleSeconds));
    setScheduleInput(scenario.trainSchedule.join(","));
    setConfigMessage(`${scenario.name} に切り替え中...`);

    await sendSimulationConfig(
      scenario.cycleSeconds,
      scenario.trainSchedule
    );
  };

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closedByReact = false;

    const connectWebSocket = () => {
      setConnectionStatus("接続中");
      ws = new WebSocket("ws://127.0.0.1:8000/ws");

      ws.onopen = () => {
        retryCountRef.current = 0;
        setConnectionStatus("正常");
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setState(data);
      };

      ws.onerror = () => {
        setConnectionStatus("エラー");
      };

      ws.onclose = () => {
        if (closedByReact) return;

        retryCountRef.current += 1;
        setConnectionStatus(`再接続中... ${retryCountRef.current}回目`);

        retryTimerRef.current = window.setTimeout(() => {
          connectWebSocket();
        }, 2000);
      };
    };

    connectWebSocket();

    return () => {
      closedByReact = true;

      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
      }

      if (ws) {
        ws.close();
      }
    };
  }, []);

  const modeClass = state ? state.current_mode.toLowerCase() : "loading";

  return (
    <main className={`page ${modeClass}`}>
      <section className="panel">
        <h1>踏切通行支援システム</h1>

        <div className="viewSwitch">
          <button
            className={viewMode === "driver" ? "active" : ""}
            onClick={() => setViewMode("driver")}
          >
            ドライバー表示
          </button>

          <button
            className={viewMode === "admin" ? "active" : ""}
            onClick={() => setViewMode("admin")}
          >
            管理者表示
          </button>
        </div>

        {viewMode === "driver" && (
          <div className="driverView">
            <div className="statusText">
              {state ? state.display_text : "接続中..."}
            </div>

            <div className="countdown">
              {state ? `${state.countdown_seconds} 秒` : "-- 秒"}
            </div>

            <p className="message">
              {state ? state.message : "状態を取得しています"}
            </p>
          </div>
        )}

        {viewMode === "admin" && (
          <div className="adminView">
            <div className="configBox">
              <h2>シミュレーション設定</h2>

              <div className="scenarioGrid">
                {scenarios.map((scenario) => (
                  <button
                    key={scenario.name}
                    className="scenarioCard"
                    onClick={() => applyScenario(scenario)}
                  >
                    <div className="scenarioName">{scenario.name}</div>
                    <div className="scenarioDescription">
                      {scenario.description}
                    </div>
                    <div className="scenarioDetail">
                      周期 {scenario.cycleSeconds}秒 / 列車{" "}
                      {scenario.trainSchedule.join(",")}秒地点
                    </div>
                  </button>
                ))}
              </div>

              <div className="configGrid">
                <div>
                  <div className="label">周期秒数</div>
                  <input
                    value={cycleInput}
                    onChange={(e) => setCycleInput(e.target.value)}
                    placeholder="例：240"
                  />
                </div>

                <div>
                  <div className="label">列車スケジュール</div>
                  <input
                    value={scheduleInput}
                    onChange={(e) => setScheduleInput(e.target.value)}
                    placeholder="例：200 または 80,160,220"
                  />
                </div>
              </div>

              <button className="resetButton" onClick={updateSimulationConfig}>
                手動設定を反映
              </button>

              <p>{configMessage}</p>
            </div>

            <div className="testModeBox">
              <h2>異常モードテスト</h2>

              <div className="buttonGrid">
                <button onClick={() => changeTestMode("NORMAL")}>正常</button>
                <button onClick={() => changeTestMode("COMMUNICATION_ERROR")}>
                  通信異常
                </button>
                <button onClick={() => changeTestMode("SENSOR_ERROR")}>
                  センサー異常
                </button>
                <button onClick={() => changeTestMode("OBSTACLE")}>
                  障害物あり
                </button>
                <button onClick={() => changeTestMode("LOW_CONFIDENCE")}>
                  信頼度低下
                </button>
              </div>

              <p>現在のテストモード：{state ? state.test_mode : "--"}</p>
            </div>

            <div className="adminStatusBox">
              <div className="miniStatus">
                <div className="label">現在モード</div>
                <div className="value">{state ? state.display_text : "--"}</div>
              </div>

              <div className="miniStatus">
                <div className="label">
                  {state?.time_status_label || "列車到達まで"}
                </div>
                <div className="value">
                  {state ? `${state.countdown_seconds} 秒` : "-- 秒"}
                </div>
              </div>
            </div>

            {state && (
              <CrossingVisual
                currentMode={state.current_mode}
                waitingVehicles={state.waiting_vehicles}
              />
            )}

            <div className="scheduleBox">
              <h2>現在の列車スケジュール</h2>

              <div className="scheduleGrid">
                {state
                  ? state.train_schedule.map((time) => (
                      <div className="scheduleCard" key={time}>
                        <div className="label">列車到達予定</div>
                        <div className="value">{time} 秒地点</div>
                      </div>
                    ))
                  : "--"}
              </div>
            </div>

            <div className="trafficGrid">
              <div className="trafficCard">
                <div className="label">累計通過車両数</div>
                <div className="value">
                  {state ? `${state.vehicle_count} 台` : "--"}
                </div>
              </div>

              <div className="trafficCard">
                <div className="label">現在の待機車両数</div>
                <div className="value">
                  {state ? `${state.waiting_vehicles} 台` : "--"}
                </div>
              </div>

              <div className="trafficCard">
                <div className="label">平均待ち時間</div>
                <div className="value">
                  {state ? `${state.average_wait_time} 秒` : "--"}
                </div>
              </div>
            </div>

            <div className="simulationDetailBox">
              <h2>交通シミュレーション詳細</h2>

              <div className="simulationDetailGrid">
                <div className="simulationCard">
                  <div className="label">今回到着した車両</div>
                  <div className="value">
                    {state ? `${state.arriving_vehicles} 台` : "--"}
                  </div>
                </div>

                <div className="simulationCard">
                  <div className="label">今回通過した車両</div>
                  <div className="value">
                    {state ? `${state.passed_vehicles} 台` : "--"}
                  </div>
                </div>

                <div className="simulationCard">
                  <div className="label">通過能力</div>
                  <div className="value">
                    {state ? `${state.pass_capacity} 台/秒` : "--"}
                  </div>
                </div>

                <div className="simulationCard">
                  <div className="label">経過時間</div>
                  <div className="value">
                    {state ? `${state.simulation_seconds} 秒` : "--"}
                  </div>
                </div>
              </div>

              <button className="resetButton" onClick={resetSimulation}>
                シミュレーションをリセット
              </button>
            </div>

            <div className="safetyBox">
              <h2>安全ステータス</h2>

              <div className="safetyGrid">
                <div className="safetyCard">
                  <div className="label">通信状態</div>
                  <div className="value">
                    {state ? state.communication_status : "--"}
                  </div>
                </div>

                <div className="safetyCard">
                  <div className="label">センサー状態</div>
                  <div className="value">{state ? state.sensor_status : "--"}</div>
                </div>

                <div className="safetyCard">
                  <div className="label">障害物検知</div>
                  <div className="value">
                    {state ? (state.obstacle_detected ? "あり" : "なし") : "--"}
                  </div>
                </div>

                <div className="safetyCard">
                  <div className="label">判定信頼度</div>
                  <div className="value">
                    {state ? `${Math.round(state.confidence_score * 100)}%` : "--"}
                  </div>
                </div>
              </div>
            </div>

            <div className="summaryBox">
              <h2>シミュレーション結果要約</h2>

              <div
                className={`summaryCard ${
                  state ? state.evaluation_level.toLowerCase() : ""
                }`}
              >
                <div className="summaryMain">
                  {state ? state.evaluation : "--"}
                </div>

                <div className="summaryGrid">
                  <div>
                    <div className="label">実行時間</div>
                    <div className="value">
                      {state ? `${state.simulation_seconds} 秒` : "--"}
                    </div>
                  </div>

                  <div>
                    <div className="label">累計通過車両</div>
                    <div className="value">
                      {state ? `${state.vehicle_count} 台` : "--"}
                    </div>
                  </div>

                  <div>
                    <div className="label">平均待ち時間</div>
                    <div className="value">
                      {state ? `${state.average_wait_time} 秒` : "--"}
                    </div>
                  </div>

                  <div>
                    <div className="label">改善率</div>
                    <div className="value">
                      {state ? `${state.improvement_rate}%` : "--"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="comparisonBox">
              <h2>渋滞改善シミュレーション</h2>

              <div className="comparisonGrid">
                <div className="comparisonCard">
                  <div className="label">現行ルール</div>
                  <div className="smallText">全車一時停止</div>
                  <div className="value">
                    {state ? `${state.current_rule_wait_time} 秒` : "--"}
                  </div>
                </div>

                <div className="comparisonCard">
                  <div className="label">提案ルール</div>
                  <div className="smallText">安全時は徐行</div>
                  <div className="value">
                    {state ? `${state.proposed_rule_wait_time} 秒` : "--"}
                  </div>
                </div>

                <div className="comparisonCard highlight">
                  <div className="label">改善率</div>
                  <div className="value">
                    {state ? `${state.improvement_rate}%` : "--"}
                  </div>
                </div>
              </div>
            </div>

            <div className="info">
              <p>Crossing ID：{state ? state.crossing_id : "--"}</p>
              <p>WebSocket通信：{connectionStatus}</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;