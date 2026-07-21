"""
Image analysis router — sends the uploaded photo to Anthropic Claude Vision
and returns structured nutrition data ready for the Garmin custom-food API.
"""

import base64
import json
import os
import re

import anthropic
from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from fastapi.responses import FileResponse, Response

router = APIRouter()

ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-5")

NUTRITION_PROMPT = """\
You are a precise nutrition label reader.

Look at the nutrition label in this image and extract every value you can see.
Return ONLY a single valid JSON object — no markdown fences, no explanation — with these exact keys
(use null for any value not found on the label):

{
  "foodName": "...",
  "brandName": "...",
  "servingUnit": "SERVING",
  "numberOfUnits": "1",
  "servingSizeDescription": "...",
  "calories": 0,
  "carbs": 0,
  "protein": 0,
  "fat": 0,
  "fiber": null,
  "sugar": null,
  "addedSugars": null,
  "saturatedFat": null,
  "monounsaturatedFat": null,
  "polyunsaturatedFat": null,
  "transFat": null,
  "cholesterol": null,
  "sodium": null,
  "potassium": null,
  "vitaminA": null,
  "vitaminC": null,
  "vitaminD": null,
  "calcium": null,
  "iron": null
}

Rules:
- All numeric values must be numbers (not strings), in the unit printed on the label (g or mg).
- cholesterol and sodium are in mg; all other nutrients in g unless the label says otherwise.
- vitaminA, vitaminC, vitaminD, calcium, iron: use mg if the label shows mg; use the % Daily Value number if only % is shown.
- servingUnit: keep "SERVING" unless the label clearly states grams ("GRAM") or ounces ("OUNCE").
- numberOfUnits: the serving-size count as a string, e.g. "1", "0.5", "2".
- servingSizeDescription: human-readable serving size from the label, e.g. "1 cup (240 mL)".
- foodName and brandName: read from the package text if visible; leave as empty string if not visible.

Return ONLY the JSON object.\
"""


def _extract_json(text: str) -> dict:
    """Strip any accidental markdown fencing and parse JSON."""
    cleaned = re.sub(r"^```[a-z]*\n?", "", text.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\n?```$", "", cleaned.strip())
    return json.loads(cleaned)


@router.post("/analyze")
async def analyze(request: Request, file: UploadFile = File(...)):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")

    image_bytes = await file.read()
    if len(image_bytes) > 20 * 1024 * 1024:  # 20 MB guard
        raise HTTPException(status_code=413, detail="Image too large (max 20 MB)")

    media_type = file.content_type or "image/jpeg"
    # Normalise common aliases
    if media_type == "image/jpg":
        media_type = "image/jpeg"

    b64 = base64.standard_b64encode(image_bytes).decode()

    client = anthropic.Anthropic(api_key=api_key)

    try:
        message = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": b64,
                            },
                        },
                        {"type": "text", "text": NUTRITION_PROMPT},
                    ],
                }
            ],
        )
    except anthropic.APIError as exc:
        raise HTTPException(status_code=502, detail=f"Anthropic API error: {exc}")

    raw = message.content[0].text

    try:
        nutrition = _extract_json(raw)
    except (json.JSONDecodeError, IndexError):
        raise HTTPException(
            status_code=502,
            detail=f"Claude returned non-JSON response: {raw[:200]}",
        )

    return nutrition


@router.post("/analyze/remove-background")
async def remove_background(file: UploadFile = File(...)):
    """
    Remove the background from an image using rembg (deep learning model).
    Returns a PNG with white background (opaque).
    """
    import io
    from PIL import Image
    from rembg import remove
    
    image_bytes = await file.read()
    if len(image_bytes) > 20 * 1024 * 1024:  # 20 MB guard
        raise HTTPException(status_code=413, detail="Image too large (max 20 MB)")

    try:
        # Load image
        input_img = Image.open(io.BytesIO(image_bytes))
        
        # Remove background using rembg (returns RGBA with transparency)
        output_img = remove(input_img)
        
        # Create white background image
        white_bg = Image.new("RGB", output_img.size, color=(255, 255, 255))
        
        # Composite the transparent image over white background
        white_bg.paste(output_img, mask=output_img.split()[3] if output_img.mode == "RGBA" else None)
        
        # Save as PNG
        output = io.BytesIO()
        white_bg.save(output, format="PNG", optimize=False)
        output.seek(0)
        
        # Return the PNG with white background
        return Response(
            content=output.getvalue(),
            media_type="image/png",
            headers={"Content-Disposition": "attachment; filename=background-removed.png"},
        )
    
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Background removal failed: {exc}",
        )
