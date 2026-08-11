from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import asyncio
import random

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

simulation_config = {
    "cycle_seconds": 240,
    "train_schedule": [200],
}

test_mode = "NORMAL"

# 状態時間
PREPARE_STOP_SECONDS = 60        # 60秒前から黄色
GATE_CLOSE_SECONDS = 35          # 35秒前から赤
TRAIN_PASSING_SECONDS = 10       # 列車通過時間

# 物理モデル
SLOW_PASS_TIME = 3.6
STOP_PASS_TIME = 11.7
STOP_LOSS_TIME = 8.1

traffic_state = {
    "waiting_vehicles": 0.0,
    "total_passed_vehicles": 0.0,
    "total_wait_time": 0.0,
    "simulation_seconds": 0,
}


def get_train_timing():
    cycle_seconds = simulation_config["cycle_seconds"]
    train_schedule = simulation_config["train_schedule"]

    now = int(datetime.now().timestamp())
    now_in_cycle = now % cycle_seconds
    base_time = now - now_in_cycle

    arrivals = []

    for t in train_schedule:
        arrivals.append(base_time - cycle_seconds + t)
        arrivals.append(base_time + t)
        arrivals.append(base_time + cycle_seconds + t)

    # 列車通過中
    for arrival in arrivals:
        if arrival <= now < arrival + TRAIN_PASSING_SECONDS:
            return {
                "seconds_to_arrival": 0,
                "seconds_to_open": arrival + TRAIN_PASSING_SECONDS - now,
                "is_train_passing": True,
                "is_gate_closed": True,
            }

    future_arrivals = [a for a in arrivals if a >= now]
    next_arrival = min(future_arrivals)
    seconds_to_arrival = next_arrival - now

    # 35秒前から遮断中扱い
    is_gate_closed = seconds_to_arrival <= GATE_CLOSE_SECONDS

    if is_gate_closed:
        seconds_to_open = seconds_to_arrival + TRAIN_PASSING_SECONDS
    else:
        seconds_to_open = None

    return {
        "seconds_to_arrival": seconds_to_arrival,
        "seconds_to_open": seconds_to_open,
        "is_train_passing": False,
        "is_gate_closed": is_gate_closed,
    }


def get_safety_status():
    if test_mode == "COMMUNICATION_ERROR":
        return {
            "communication_status": "ERROR",
            "sensor_status": "NORMAL",
            "obstacle_detected": False,
            "confidence_score": 0.98,
        }

    if test_mode == "SENSOR_ERROR":
        return {
            "communication_status": "NORMAL",
            "sensor_status": "ERROR",
            "obstacle_detected": False,
            "confidence_score": 0.98,
        }

    if test_mode == "OBSTACLE":
        return {
            "communication_status": "NORMAL",
            "sensor_status": "NORMAL",
            "obstacle_detected": True,
            "confidence_score": 0.98,
        }

    if test_mode == "LOW_CONFIDENCE":
        return {
            "communication_status": "NORMAL",
            "sensor_status": "NORMAL",
            "obstacle_detected": False,
            "confidence_score": 0.80,
        }

    return {
        "communication_status": "NORMAL",
        "sensor_status": "NORMAL",
        "obstacle_detected": False,
        "confidence_score": 0.98,
    }


def judge_crossing_mode(timing, safety):
    if safety["communication_status"] != "NORMAL":
        return {
            "current_mode": "EMERGENCY_STOP",
            "display_text": "異常停止",
            "message": "通信異常のため停止してください",
            "time_status_label": "異常停止中",
            "display_countdown": 0,
        }

    if safety["sensor_status"] != "NORMAL":
        return {
            "current_mode": "EMERGENCY_STOP",
            "display_text": "異常停止",
            "message": "センサー異常のため停止してください",
            "time_status_label": "異常停止中",
            "display_countdown": 0,
        }

    if safety["obstacle_detected"]:
        return {
            "current_mode": "EMERGENCY_STOP",
            "display_text": "異常停止",
            "message": "踏切内に障害物があります",
            "time_status_label": "異常停止中",
            "display_countdown": 0,
        }

    if safety["confidence_score"] < 0.95:
        return {
            "current_mode": "EMERGENCY_STOP",
            "display_text": "異常停止",
            "message": "判定信頼度が低いため停止してください",
            "time_status_label": "異常停止中",
            "display_countdown": 0,
        }

    if timing["is_gate_closed"]:
        return {
            "current_mode": "STOP",
            "display_text": "遮断中",
            "message": "遮断機が下がっています。列車通過完了まで待機してください",
            "time_status_label": "踏切が開くまで",
            "display_countdown": timing["seconds_to_open"],
        }

    if timing["seconds_to_arrival"] <= PREPARE_STOP_SECONDS:
        return {
            "current_mode": "PREPARE_STOP",
            "display_text": "一時停止",
            "message": "列車が接近しています。踏切前で一時停止してください",
            "time_status_label": "列車到達まで",
            "display_countdown": timing["seconds_to_arrival"],
        }

    return {
        "current_mode": "SLOW_ALLOWED",
        "display_text": "徐行可",
        "message": "列車到達まで余裕があります。踏切区間では徐行してください",
        "time_status_label": "列車到達まで",
        "display_countdown": timing["seconds_to_arrival"],
    }


def get_pass_capacity(current_mode):
    if current_mode == "SLOW_ALLOWED":
        return 1 / SLOW_PASS_TIME

    if current_mode == "PREPARE_STOP":
        return 1 / STOP_PASS_TIME

    return 0.0


def update_traffic_simulation(current_mode):
    traffic_state["simulation_seconds"] += 1

    arriving_vehicles = random.choices(
        population=[0, 1, 2],
        weights=[30, 50, 20],
        k=1,
    )[0]

    traffic_state["waiting_vehicles"] += arriving_vehicles

    pass_capacity = get_pass_capacity(current_mode)

    passed_vehicles = min(
        traffic_state["waiting_vehicles"],
        pass_capacity,
    )

    traffic_state["waiting_vehicles"] -= passed_vehicles
    traffic_state["total_passed_vehicles"] += passed_vehicles
    traffic_state["total_wait_time"] += traffic_state["waiting_vehicles"]

    if traffic_state["total_passed_vehicles"] > 0:
        average_wait_time = (
            traffic_state["total_wait_time"]
            / traffic_state["total_passed_vehicles"]
        )
    else:
        average_wait_time = 0.0

    current_rule_wait_time = round(average_wait_time + STOP_LOSS_TIME, 1)
    proposed_rule_wait_time = round(average_wait_time, 1)

    if current_rule_wait_time > 0:
        improvement_rate = round(
            (current_rule_wait_time - proposed_rule_wait_time)
            / current_rule_wait_time
            * 100,
            1,
        )
    else:
        improvement_rate = 0.0

    return {
        "vehicle_count": round(traffic_state["total_passed_vehicles"], 1),
        "waiting_vehicles": round(traffic_state["waiting_vehicles"], 1),
        "average_wait_time": round(average_wait_time, 1),
        "arriving_vehicles": arriving_vehicles,
        "passed_vehicles": round(passed_vehicles, 2),
        "pass_capacity": round(pass_capacity, 3),
        "simulation_seconds": traffic_state["simulation_seconds"],
        "current_rule_wait_time": current_rule_wait_time,
        "proposed_rule_wait_time": proposed_rule_wait_time,
        "improvement_rate": improvement_rate,
        "slow_pass_time": SLOW_PASS_TIME,
        "stop_pass_time": STOP_PASS_TIME,
        "stop_loss_time": STOP_LOSS_TIME,
    }


def get_evaluation(improvement_rate):
    if improvement_rate >= 50:
        return {
            "evaluation": "渋滞改善効果が高い",
            "evaluation_level": "HIGH",
        }

    if improvement_rate >= 20:
        return {
            "evaluation": "一定の改善効果あり",
            "evaluation_level": "MEDIUM",
        }

    return {
        "evaluation": "改善効果は限定的",
        "evaluation_level": "LOW",
    }


def reset_traffic_state():
    traffic_state["waiting_vehicles"] = 0.0
    traffic_state["total_passed_vehicles"] = 0.0
    traffic_state["total_wait_time"] = 0.0
    traffic_state["simulation_seconds"] = 0


def build_payload():
    timing = get_train_timing()
    safety = get_safety_status()
    result = judge_crossing_mode(timing, safety)
    traffic = update_traffic_simulation(result["current_mode"])
    evaluation = get_evaluation(traffic["improvement_rate"])

    return {
        "crossing_id": "CR001",
        "test_mode": test_mode,
        "cycle_seconds": simulation_config["cycle_seconds"],
        "train_schedule": simulation_config["train_schedule"],

        # UI互換用
        "countdown_seconds": result["display_countdown"],

        # 詳細表示用
        "seconds_to_arrival": timing["seconds_to_arrival"],
        "seconds_to_open": timing["seconds_to_open"],
        "is_train_passing": timing["is_train_passing"],
        "is_gate_closed": timing["is_gate_closed"],
        "gate_close_seconds": GATE_CLOSE_SECONDS,
        "train_passing_seconds": TRAIN_PASSING_SECONDS,

        **result,
        **safety,
        **traffic,
        **evaluation,
    }


@app.get("/")
def root():
    return {
        "message": "踏切通行支援システム API",
        "test_mode": test_mode,
        "config": simulation_config,
    }


@app.get("/api/crossings/CR001/state")
def get_crossing_state():
    return build_payload()


@app.post("/api/test-mode/{mode}")
def set_test_mode(mode: str):
    global test_mode

    allowed_modes = [
        "NORMAL",
        "COMMUNICATION_ERROR",
        "SENSOR_ERROR",
        "OBSTACLE",
        "LOW_CONFIDENCE",
    ]

    if mode not in allowed_modes:
        return {
            "success": False,
            "message": "無効なモードです",
            "allowed_modes": allowed_modes,
        }

    test_mode = mode

    return {
        "success": True,
        "test_mode": test_mode,
    }


@app.post("/api/simulation/reset")
def reset_simulation():
    reset_traffic_state()

    return {
        "success": True,
        "message": "シミュレーションをリセットしました",
    }


@app.post("/api/simulation/config")
def update_simulation_config(config: dict):
    global simulation_config

    cycle_seconds = config.get("cycle_seconds")
    train_schedule = config.get("train_schedule")

    if not isinstance(cycle_seconds, int) or cycle_seconds <= 0:
        return {
            "success": False,
            "message": "cycle_seconds は1以上の整数にしてください",
        }

    if not isinstance(train_schedule, list) or len(train_schedule) == 0:
        return {
            "success": False,
            "message": "train_schedule は空でないリストにしてください",
        }

    if not all(isinstance(t, int) and 0 < t < cycle_seconds for t in train_schedule):
        return {
            "success": False,
            "message": "train_schedule は 0 より大きく cycle_seconds 未満の整数にしてください",
        }

    simulation_config = {
        "cycle_seconds": cycle_seconds,
        "train_schedule": sorted(train_schedule),
    }

    reset_traffic_state()

    return {
        "success": True,
        "message": "シミュレーション設定を更新しました",
        "config": simulation_config,
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            await websocket.send_json(build_payload())
            await asyncio.sleep(1)
    except Exception:
        print("WebSocket disconnected")