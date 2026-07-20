"""
Garmin Connect food-creation router.

Uses the authenticated python-garminconnect session (Bearer DI OAuth tokens)
to PUT a custom food entry to Garmin's nutrition-service API.

Note: the existing browser extension used session-cookie + CSRF-token auth.
python-garminconnect uses Bearer tokens instead.  Both methods reach the same
Garmin API — Bearer auth is the preferred server-side approach.  If Garmin
ever rejects the Bearer token for this specific endpoint, the error message
returned here will make it clear what happened.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from garminconnect import Garmin
from garminconnect.exceptions import (
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
)
from pydantic import BaseModel

# Relative path used by the library's internal client.Client
# (maps to https://connect.garmin.com/proxy/nutrition-service/customFood or similar)
GARMIN_CUSTOM_FOOD_PATH = "/nutrition-service/customFood"

router = APIRouter()


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------


def get_garmin_client(request: Request) -> Garmin:
    client: Garmin | None = request.app.state.garmin_client
    if client is None:
        raise HTTPException(
            status_code=401, detail="Not authenticated with Garmin Connect"
        )
    return client


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class NutritionContents(BaseModel):
    servingUnit: str = "SERVING"
    numberOfUnits: str = "1"
    calories: float = 0
    carbs: float = 0
    protein: float = 0
    fat: float = 0
    fiber: float | None = None
    sugar: float | None = None
    addedSugars: float | None = None
    saturatedFat: float | None = None
    monounsaturatedFat: float | None = None
    polyunsaturatedFat: float | None = None
    transFat: float | None = None
    cholesterol: float | None = None
    sodium: float | None = None
    potassium: float | None = None
    vitaminA: float | None = None
    vitaminC: float | None = None
    vitaminD: float | None = None
    calcium: float | None = None
    iron: float | None = None


class CreateFoodRequest(BaseModel):
    foodName: str
    brandName: str = "Homemade"
    nutrition: NutritionContents


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/food")
async def create_food(
    body: CreateFoodRequest,
    client: Garmin = Depends(get_garmin_client),
):
    payload = {
        "foodMetaData": {
            "foodId": None,
            "foodName": body.foodName,
            "foodType": "BRAND",
            "brandName": body.brandName or "Homemade",
            "source": "GARMIN",
            "regionCode": "US",
            "languageCode": "en",
            "imageUuid": None,
        },
        "nutritionContents": [
            {
                "servingId": None,
                "servingUnit": body.nutrition.servingUnit,
                "numberOfUnits": body.nutrition.numberOfUnits,
                "calories": body.nutrition.calories,
                "carbs": body.nutrition.carbs,
                "protein": body.nutrition.protein,
                "fat": body.nutrition.fat,
                "fiber": body.nutrition.fiber,
                "sugar": body.nutrition.sugar,
                "addedSugars": body.nutrition.addedSugars,
                "saturatedFat": body.nutrition.saturatedFat,
                "monounsaturatedFat": body.nutrition.monounsaturatedFat,
                "polyunsaturatedFat": body.nutrition.polyunsaturatedFat,
                "transFat": body.nutrition.transFat,
                "cholesterol": body.nutrition.cholesterol,
                "sodium": body.nutrition.sodium,
                "potassium": body.nutrition.potassium,
                "vitaminA": body.nutrition.vitaminA,
                "vitaminC": body.nutrition.vitaminC,
                "vitaminD": body.nutrition.vitaminD,
                "calcium": body.nutrition.calcium,
                "iron": body.nutrition.iron,
            }
        ],
    }

    try:
        response = client.client.put(
            "connectapi", GARMIN_CUSTOM_FOOD_PATH, json=payload, api=True
        )
    except GarminConnectAuthenticationError as exc:
        raise HTTPException(
            status_code=401,
            detail=(
                "Garmin rejected the request (auth error). "
                "Your session may have expired — please log out and log in again. "
                f"Detail: {exc}"
            ),
        )
    except (GarminConnectConnectionError, Exception) as exc:
        raise HTTPException(status_code=502, detail=f"Garmin request failed: {exc}")

    try:
        return response.json()
    except Exception:
        # Some Garmin endpoints return an empty 200/201 body
        return {"status": "created"}
