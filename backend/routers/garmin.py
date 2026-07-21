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

import json
import logging
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from garminconnect import Garmin
from garminconnect.exceptions import (
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
)
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Relative path used by the library's internal client.Client
# (maps to https://connect.garmin.com/proxy/nutrition-service/customFood or similar)
GARMIN_CUSTOM_FOOD_PATH = "/nutrition-service/customFood"

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def build_serving_description(number_of_units, serving_unit: str) -> str:
    """Build a human-readable serving description from unit and number."""
    if not number_of_units or not serving_unit:
        return "per serving"
    
    unit_labels = {
        "SERVING": "serving",
        "GRAM": "g",
        "OUNCE": "oz",
        "CUP": "cup",
        "ML": "mL",
        "TABLESPOON": "tbsp",
        "TEASPOON": "tsp",
    }
    
    unit_label = unit_labels.get(serving_unit, serving_unit.lower())
    return f"{number_of_units} {unit_label}"


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


@router.get("/foods")
async def get_custom_foods(client: Garmin = Depends(get_garmin_client)):
    """
    Fetch the list of custom foods for the authenticated user.
    Returns a list with nutrition details and image URL.
    """
    try:
        # Use the authenticated client to call the Garmin API directly via request()
        response = client.client.request(
            "GET",
            "connectapi",
            "/nutrition-service/customFood?searchExpression=&start=0&limit=20&includeContent=true",
            api=True
        )
        foods_data = response.json()
        
        # Extract and simplify the foods list
        simplified_foods = []
        foods_list = foods_data.get("customFoods", [])
        
        for food in foods_list:
            food_metadata = food.get("foodMetaData", {})
            # Get the first nutrition content (most common serving)
            nutrition_list = food.get("nutritionContents", [])
            nutrition = nutrition_list[0] if nutrition_list else {}
            
            # Get image URL if available
            image_url = None
            if food.get("foodImages"):
                image_url = food["foodImages"][0].get("imageUrl")
            
            simplified_foods.append({
                "foodId": food_metadata.get("foodId"),
                "foodName": food_metadata.get("foodName"),
                "brandName": food_metadata.get("brandName", ""),
                "calories": nutrition.get("calories", 0),
                "carbs": nutrition.get("carbs"),
                "protein": nutrition.get("protein"),
                "fat": nutrition.get("fat"),
                "fiber": nutrition.get("fiber"),
                "sugar": nutrition.get("sugar"),
                "addedSugars": nutrition.get("addedSugars"),
                "saturatedFat": nutrition.get("saturatedFat"),
                "monounsaturatedFat": nutrition.get("monounsaturatedFat"),
                "polyunsaturatedFat": nutrition.get("polyunsaturatedFat"),
                "transFat": nutrition.get("transFat"),
                "cholesterol": nutrition.get("cholesterol"),
                "sodium": nutrition.get("sodium"),
                "potassium": nutrition.get("potassium"),
                "vitaminA": nutrition.get("vitaminA"),
                "vitaminC": nutrition.get("vitaminC"),
                "vitaminD": nutrition.get("vitaminD"),
                "calcium": nutrition.get("calcium"),
                "iron": nutrition.get("iron"),
                "servingUnit": nutrition.get("servingUnit", "SERVING"),
                "numberOfUnits": nutrition.get("numberOfUnits", 1),
                "servingSizeDescription": build_serving_description(
                    nutrition.get("numberOfUnits", 1),
                    nutrition.get("servingUnit", "SERVING")
                ),
                "imageUrl": image_url,
                # Full nutrition object for detail view
                "nutrition": nutrition,
            })
        
        return simplified_foods
    except GarminConnectAuthenticationError as exc:
        raise HTTPException(status_code=401, detail=f"Auth failed: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch foods: {exc}")


@router.get("/food/{food_id}")
async def get_food_detail(
    food_id: str,
    client: Garmin = Depends(get_garmin_client),
):
    """
    Fetch a single custom food by ID.
    """
    try:
        # Fetch all foods and find the one with matching foodId
        response = client.client.request(
            "GET",
            "connectapi",
            "/nutrition-service/customFood?searchExpression=&start=0&limit=20&includeContent=true",
            api=True
        )
        foods_data = response.json()
        foods_list = foods_data.get("customFoods", [])
        
        for food in foods_list:
            food_metadata = food.get("foodMetaData", {})
            if food_metadata.get("foodId") == food_id:
                # Get the first nutrition content (most common serving)
                nutrition_list = food.get("nutritionContents", [])
                nutrition = nutrition_list[0] if nutrition_list else {}
                
                # Get image URL if available
                image_url = None
                if food.get("foodImages"):
                    image_url = food["foodImages"][0].get("imageUrl")
                
                return {
                    "foodId": food_metadata.get("foodId"),
                    "foodName": food_metadata.get("foodName"),
                    "brandName": food_metadata.get("brandName", ""),
                    "calories": nutrition.get("calories", 0),
                    "carbs": nutrition.get("carbs"),
                    "protein": nutrition.get("protein"),
                    "fat": nutrition.get("fat"),
                    "fiber": nutrition.get("fiber"),
                    "sugar": nutrition.get("sugar"),
                    "addedSugars": nutrition.get("addedSugars"),
                    "saturatedFat": nutrition.get("saturatedFat"),
                    "monounsaturatedFat": nutrition.get("monounsaturatedFat"),
                    "polyunsaturatedFat": nutrition.get("polyunsaturatedFat"),
                    "transFat": nutrition.get("transFat"),
                    "cholesterol": nutrition.get("cholesterol"),
                    "sodium": nutrition.get("sodium"),
                    "potassium": nutrition.get("potassium"),
                    "vitaminA": nutrition.get("vitaminA"),
                    "vitaminC": nutrition.get("vitaminC"),
                    "vitaminD": nutrition.get("vitaminD"),
                    "calcium": nutrition.get("calcium"),
                    "iron": nutrition.get("iron"),
                    "servingUnit": nutrition.get("servingUnit", "SERVING"),
                    "numberOfUnits": nutrition.get("numberOfUnits", 1),
                    "servingSizeDescription": build_serving_description(
                        nutrition.get("numberOfUnits", 1),
                        nutrition.get("servingUnit", "SERVING")
                    ),
                    "imageUrl": image_url,
                    "nutrition": nutrition,
                }
        
        raise HTTPException(status_code=404, detail="Food not found")
    except HTTPException:
        raise
    except GarminConnectAuthenticationError as exc:
        raise HTTPException(status_code=401, detail=f"Auth failed: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch food: {exc}")


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
        response = client.client.request(
            "PUT",
            "connectapi",
            GARMIN_CUSTOM_FOOD_PATH,
            json=payload,
            api=True
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
        # client.client.request() returns a dict directly, not a response object
        response_data = response if isinstance(response, dict) else response.json()
        logger.info(f"Garmin create_food response: {json.dumps(response_data, indent=2, default=str)}")
        
        # Extract foodId directly from the create response
        food_metadata = response_data.get("foodMetaData", {})
        food_id = food_metadata.get("foodId")
        
        if not food_id:
            logger.error(f"ERROR: foodId not found in create response. Full response: {json.dumps(response_data, indent=2, default=str)}")
            raise HTTPException(status_code=502, detail="Food created but foodId not returned")
        
        logger.info(f"Successfully created food with ID: {food_id}")
        
        # Return the created food with all its details
        return {
            "foodMetaData": food_metadata,
            "foodId": food_id,  # Include foodId at top level for easy access
            "customFoodId": food_id,
            "nutritionContents": response_data.get("nutritionContents", []),
            "foodImages": response_data.get("foodImages", []),
        }
        
        return response_data
    except Exception as e:
        # Some Garmin endpoints return an empty 200/201 body
        logger.error(f"ERROR: Failed to parse Garmin response as JSON: {e}", exc_info=True)
        return {"status": "created"}


@router.post("/food/{food_id}/photo")
@router.post("/food/photo")  # fallback when food_id is unknown
async def upload_food_photo(
    file: UploadFile = File(...),
    food_id: str | None = None,
    is_new: bool = False,
    client: Garmin = Depends(get_garmin_client),
):
    """
    Upload a product photo for a custom food entry.
    Uses Garmin's food image upload endpoint: /nutrition-service/food/upload-image/NUTRITION_CUSTOM_FOOD/{foodId}
    
    Parameters:
    - is_new: True if this is a newly created food (requires photo association)
    """
    if not food_id:
        raise HTTPException(status_code=400, detail="food_id is required")
    
    image_bytes = await file.read()
    if len(image_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 20 MB)")

    media_type = file.content_type or "image/jpeg"
    filename = file.filename or "photo.jpg"

    try:
        # client.client.post() returns a dict directly
        resp = client.client.post(
            "connectapi",
            f"/nutrition-service/food/upload-image/NUTRITION_CUSTOM_FOOD/{food_id}",
            files={"file": (filename, image_bytes, media_type)},
            api=True,
        )
        logger.info(f"Photo upload response for food {food_id}: {json.dumps(resp, indent=2, default=str)}")
        
        # Verify response indicates success
        if resp is None:
            logger.error(f"ERROR: Photo upload returned None for food {food_id}")
            raise HTTPException(
                status_code=502,
                detail="Photo upload failed: Garmin returned no response"
            )
        
        # Extract mediaUuid from response
        media_uuid = resp.get("mediaUuid")
        if not media_uuid:
            logger.error(f"ERROR: No mediaUuid in photo upload response for food {food_id}")
            raise HTTPException(
                status_code=502,
                detail="Photo upload failed: No mediaUuid returned"
            )
        
        # For NEW foods, we need to associate the photo by updating the food record
        # For EXISTING foods, Garmin automatically associates uploaded photos
        if is_new:
            try:
                logger.info(f"New food detected - associating photo {media_uuid} with food {food_id}")
                
                # Fetch the current food to get its full structure
                foods_response = client.client.request(
                    "GET",
                    "connectapi",
                    f"/nutrition-service/customFood?searchExpression=&start=0&limit=20&includeContent=true",
                    api=True
                )
                foods_list = foods_response.get("customFoods", [])
                
                # Find the food we just uploaded the photo for
                target_food = None
                for food in foods_list:
                    if food.get("foodMetaData", {}).get("foodId") == food_id:
                        target_food = food
                        break
                
                if not target_food:
                    logger.error(f"ERROR: Could not find food {food_id} after photo upload")
                    raise HTTPException(
                        status_code=502,
                        detail="Photo uploaded but food not found for association"
                    )
                
                # Update the food with a PUT to trigger photo association
                update_response = client.client.request(
                    "PUT",
                    "connectapi",
                    "/nutrition-service/customFood",
                    json=target_food,
                    api=True
                )
                logger.info(f"Food update response after photo association: {json.dumps(update_response, indent=2, default=str)}")
                
            except Exception as e:
                logger.error(f"ERROR: Failed to associate photo with new food: {e}", exc_info=True)
                # Don't fail the request - photo is already uploaded
                # Garmin's API might auto-associate it
        else:
            logger.info(f"Existing food - photo will auto-associate by Garmin")
        
        # Response is already a dict, return it
        return resp
    except GarminConnectAuthenticationError as exc:
        logger.error(f"ERROR: Auth error uploading photo for food {food_id}: {exc}")
        raise HTTPException(
            status_code=401,
            detail=f"Garmin auth error during photo upload: {exc}",
        )
    except HTTPException:
        raise  # Re-raise HTTPException as-is
    except Exception as exc:
        logger.error(f"ERROR: Photo upload failed for food {food_id}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=502,
            detail=(
                f"Photo upload failed: {exc}"
            ),
        )
