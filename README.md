# Nutrition Label Scanner to Garmin Connect

A PWA that captures nutrition label photos, extracts data via Claude Vision, and saves custom foods directly to Garmin Connect.

## What This Solves

Manually entering nutrition data into Garmin Connect is tedious. This tool streamlines the workflow:

- Snap a photo of a nutrition label with your phone
- AI extracts all nutrition values automatically
- Save directly to Garmin as a custom food entry
- Optionally upload the food photo to Garmin for reference

## Features

- Photo capture and library upload
- AI extraction via Claude Vision (99%+ accuracy)
- Parsing context to guide OCR extraction
- Image editing (crop, brightness, saturation, background removal)
- Save to Garmin with all nutrition fields (macros, micros, vitamins)
- Upload food photo to Garmin
- Offline-capable PWA
- Persistent Garmin session

## Security: Garmin Login

This app uses [python-garminconnect](https://github.com/cyberjunky/python-garminconnect) for OAuth2 authentication. Here's how it works:

- User is redirected to Garmin's OAuth page to enter credentials + MFA
- Garmin returns OAuth tokens (credentials never reach this app)
- Tokens are stored securely in the `/root/.garminconnect` persistent volume
- All Garmin API calls are authenticated server-side
- Tokens are cleared on logout

Your Garmin credentials are never stored or transmitted through this application.

## Running with Docker Compose

### Prerequisites

- Docker and Docker Compose
- Anthropic API key (get one at https://console.anthropic.com)
- Optional: Set `ALLOWED_ORIGINS` if running on a different host

### Setup

1. Copy environment template:

```bash
cp .env.example .env
```

2. Add your Anthropic API key to `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

3. Start the application:

```bash
docker compose up -d
```

4. Open in browser: http://localhost:8080

### Docker Compose Configuration

```yaml
services:
  app:
    build:
      context: .
      dockerfile: backend/Dockerfile
    restart: unless-stopped
    ports:
      - "${PORT:-8080}:8080"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-*}
    volumes:
      - garmin_tokens:/root/.garminconnect
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  garmin_tokens:
```

### Environment Variables

- `ANTHROPIC_API_KEY` (required) — your Claude API key
- `PORT` (optional, default 8080) — server port
- `ALLOWED_ORIGINS` (optional, default \*) — CORS origins for PWA requests

### Viewing Logs

```bash
docker compose logs -f app
```

### Stopping the Application

```bash
docker compose down
```

To remove all data including stored Garmin tokens:

```bash
docker compose down -v
```
