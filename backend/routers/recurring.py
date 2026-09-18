import asyncio
import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Literal
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, validator


logger = logging.getLogger(__name__)

TOKEN_DIR = Path(os.getenv("GARMIN_TOKEN_DIR", str(Path.home() / ".garminconnect")))
SCHEDULES_FILE = TOKEN_DIR / "recurring-schedules.json"
SCHEDULE_TIMEZONE = ZoneInfo("America/Los_Angeles")
RUN_HOUR = 4
VALID_DAYS = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
FILE_LOCK = threading.Lock()

router = APIRouter()


class CreateScheduleRequest(BaseModel):
    type: Literal["food", "meal"]
    itemId: str
    name: str
    days: List[str]
    time: str

    @validator("days")
    def validate_days(cls, days):
        if not days or any(day not in VALID_DAYS for day in days):
            raise ValueError("Select at least one valid day")
        return list(dict.fromkeys(days))

    @validator("time")
    def validate_time(cls, value):
        try:
            datetime.strptime(value, "%H:%M")
        except ValueError as exc:
            raise ValueError("Time must use HH:MM format") from exc
        return value


def _load_schedules_unlocked():
    if not SCHEDULES_FILE.exists():
        return []

    data = json.loads(SCHEDULES_FILE.read_text())
    if not isinstance(data, list):
        raise ValueError("Schedule store must contain a list")
    return data


def load_schedules():
    with FILE_LOCK:
        return _load_schedules_unlocked()


def _write_schedules_unlocked(schedules):
    TOKEN_DIR.mkdir(parents=True, exist_ok=True)
    temporary_file = SCHEDULES_FILE.with_suffix(".tmp")
    temporary_file.write_text(json.dumps(schedules, indent=2))
    temporary_file.replace(SCHEDULES_FILE)


def write_schedules(schedules):
    with FILE_LOCK:
        _write_schedules_unlocked(schedules)


def _response_json(response):
    return response if isinstance(response, dict) else response.json()


def _get_daily_meal_id(client, meal_date, meal_time):
    response = client.client.request(
        "GET",
        "connectapi",
        f"/nutrition-service/meals/{meal_date}",
        api=True,
    )
    meals = _response_json(response).get("meals", [])
    full_time = f"{meal_time}:00"

    for meal in meals:
        start = meal.get("startTime")
        end = meal.get("endTime")
        if start and end and start <= full_time <= end:
            return meal.get("mealId")

    snacks = next(
        (
            meal
            for meal in meals
            if meal.get("mealName") == "SNACKS"
            or meal.get("defaultMealName") == "SNACKS"
        ),
        None,
    )
    if snacks and snacks.get("mealId") is not None:
        return snacks["mealId"]

    raise ValueError(f"No Garmin meal slot matches {meal_time}")


def _get_custom_food(client, food_id):
    start = 0
    page_size = 20

    while True:
        response = client.client.request(
            "GET",
            "connectapi",
            "/nutrition-service/customFood",
            params={
                "searchExpression": "",
                "start": start,
                "limit": page_size,
                "includeContent": "true",
            },
            api=True,
        )
        payload = _response_json(response)
        foods = payload.get("customFoods", [])

        for food in foods:
            if str(food.get("foodMetaData", {}).get("foodId")) == str(food_id):
                return food

        if not payload.get("hasMore") or not foods:
            break
        start += len(foods)

    raise ValueError(f"Garmin custom food {food_id} was not found")


def _get_custom_meal(client, custom_meal_id):
    response = client.client.request(
        "GET",
        "connectapi",
        "/nutrition-service/customMeal",
        params={"customMealId": custom_meal_id},
        api=True,
    )
    meals = _response_json(response).get("customMeals", [])
    if not meals:
        raise ValueError(f"Garmin custom meal {custom_meal_id} was not found")
    return meals[0]


def _build_food_log_item(food, meal_id, meal_time, log_timestamp, serving_qty=1):
    metadata = food.get("foodMetaData") or {}
    nutrition = (
        food.get("selectedNutritionContent")
        or food.get("nutritionContent")
        or next(iter(food.get("nutritionContents") or []), {})
    )
    food_id = metadata.get("foodId")
    serving_id = nutrition.get("servingId")

    if food_id is None or serving_id is None:
        raise ValueError("Garmin food is missing its foodId or servingId")

    return {
        "logTimestamp": log_timestamp,
        "logSource": "GCW",
        "logCategory": "REGULAR_LOG",
        "mealTime": f"{meal_time}:00",
        "action": "ADD",
        "mealId": meal_id,
        "foodId": food_id,
        "servingId": serving_id,
        "source": metadata.get("source") or "GARMIN",
        "regionCode": metadata.get("regionCode") or "US",
        "languageCode": metadata.get("languageCode") or "en",
        "servingQty": serving_qty,
    }


def log_schedule(client, schedule, meal_date):
    meal_id = _get_daily_meal_id(client, meal_date, schedule["time"])
    log_timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    if schedule["type"] == "food":
        food = _get_custom_food(client, schedule["itemId"])
        items = [
            _build_food_log_item(
                food,
                meal_id,
                schedule["time"],
                log_timestamp,
            )
        ]
    else:
        meal = _get_custom_meal(client, schedule["itemId"])
        foods = meal.get("foods") or []
        if not foods:
            raise ValueError("Garmin custom meal contains no foods")
        items = [
            _build_food_log_item(
                food,
                meal_id,
                schedule["time"],
                log_timestamp,
                food.get("servingQty") or 1,
            )
            for food in foods
        ]

    payload = {
        "mealDate": meal_date,
        "foodLogItems": items,
    }
    client.client.request(
        "PUT",
        "connectapi",
        "/nutrition-service/food/logs",
        json=payload,
        api=True,
    )


def run_due_schedules(app, now=None):
    current = now or datetime.now(SCHEDULE_TIMEZONE)
    if current.hour < RUN_HOUR:
        return

    client = app.state.garmin_client
    if client is None:
        return

    meal_date = current.date().isoformat()
    weekday = current.strftime("%a")

    with FILE_LOCK:
        schedules = _load_schedules_unlocked()

        for schedule in schedules:
            if (
                not schedule.get("enabled", True)
                or weekday not in schedule.get("days", [])
                or schedule.get("lastAttemptDate") == meal_date
            ):
                continue

            schedule["lastAttemptDate"] = meal_date
            schedule["lastError"] = None
            _write_schedules_unlocked(schedules)

            try:
                log_schedule(client, schedule, meal_date)
                schedule["lastRunDate"] = meal_date
                schedule["lastRunAt"] = current.isoformat()
                logger.info("Logged recurring schedule %s", schedule["id"])
            except Exception as exc:
                schedule["lastError"] = str(exc)
                logger.exception("Failed recurring schedule %s", schedule["id"])

            _write_schedules_unlocked(schedules)


async def scheduler_loop(app):
    while True:
        try:
            await asyncio.to_thread(run_due_schedules, app)
        except Exception:
            logger.exception("Recurring schedule loop failed")
        await asyncio.sleep(60)


@router.get("/schedules")
async def get_schedules():
    try:
        return load_schedules()
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load schedules: {exc}")


@router.post("/schedules", status_code=201)
async def create_schedule(body: CreateScheduleRequest):
    schedule = {
        "id": str(uuid4()),
        "type": body.type,
        "itemId": body.itemId,
        "name": body.name,
        "days": body.days,
        "time": body.time,
        "timezone": str(SCHEDULE_TIMEZONE),
        "runAt": "04:00",
        "enabled": True,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "lastAttemptDate": None,
        "lastRunDate": None,
        "lastRunAt": None,
        "lastError": None,
    }

    try:
        with FILE_LOCK:
            schedules = _load_schedules_unlocked()
            schedules.append(schedule)
            _write_schedules_unlocked(schedules)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save schedule: {exc}")

    return schedule


@router.put("/schedules/{schedule_id}")
async def update_schedule(schedule_id: str, body: CreateScheduleRequest):
    try:
        with FILE_LOCK:
            schedules = _load_schedules_unlocked()
            schedule = next(
                (
                    existing
                    for existing in schedules
                    if existing.get("id") == schedule_id
                ),
                None,
            )
            if schedule is None:
                raise HTTPException(status_code=404, detail="Schedule not found")

            schedule.update(
                {
                    "type": body.type,
                    "itemId": body.itemId,
                    "name": body.name,
                    "days": body.days,
                    "time": body.time,
                    "timezone": str(SCHEDULE_TIMEZONE),
                    "runAt": "04:00",
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                }
            )
            _write_schedules_unlocked(schedules)
    except HTTPException:
        raise
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update schedule: {exc}")

    return schedule


@router.delete("/schedules/{schedule_id}", status_code=204)
async def delete_schedule(schedule_id: str):
    try:
        with FILE_LOCK:
            schedules = _load_schedules_unlocked()
            remaining = [
                schedule for schedule in schedules if schedule.get("id") != schedule_id
            ]
            if len(remaining) == len(schedules):
                raise HTTPException(status_code=404, detail="Schedule not found")
            _write_schedules_unlocked(remaining)
    except HTTPException:
        raise
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete schedule: {exc}")
