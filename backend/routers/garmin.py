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

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
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


@router.post("/food/{food_id}/photo")
@router.post("/food/photo")  # fallback when food_id is unknown
async def upload_food_photo(
    file: UploadFile = File(...),
    food_id: str | None = None,
    client: Garmin = Depends(get_garmin_client),
):
    """
    Upload a product photo for a custom food entry.

    Garmin's nutrition-service image upload endpoint is not part of the
    public API and may change.  We try the most likely path; if Garmin
    returns a 4xx the error is surfaced to the caller with a helpful message.
    """
    image_bytes = await file.read()
    if len(image_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 20 MB)")

    media_type = file.content_type or "image/jpeg"
    filename = file.filename or "photo.jpg"

    # Try the most likely endpoint patterns in order.
    # Garmin uses an image UUID flow internally; the direct multipart path
    # may work for custom foods created via the API.
    paths_to_try = []
    if food_id:
        paths_to_try += [
            f"/nutrition-service/customFood/{food_id}/image",
            f"/nutrition-service/food/{food_id}/image",
        ]
    paths_to_try.append("/nutrition-service/customFood/image")

    last_exc: Exception | None = None
    for path in paths_to_try:
        try:
            resp = client.client.post(
                "connectapi",
                path,
                files={"file": (filename, image_bytes, media_type)},
                api=True,
            )
            try:
                return resp.json()
            except Exception:
                return {"status": "uploaded"}
        except GarminConnectAuthenticationError as exc:
            raise HTTPException(
                status_code=401,
                detail=f"Garmin auth error during photo upload: {exc}",
            )
        except Exception as exc:
            last_exc = exc
            continue

    raise HTTPException(
        status_code=502,
        detail=(
            "Photo upload is not supported by this Garmin account or the "
            "API endpoint has changed. The food was saved successfully without a photo. "
            f"Last error: {last_exc}"
        ),
    )
