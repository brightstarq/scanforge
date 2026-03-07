# ScanForge — PDF Scan Effect Tool

> Node.js 18+ · ES Modules · No signup · 100% local

## Requirements

- **Node.js 18+**
- **Ghostscript** for PDF → image conversion

```bash
# Linux
sudo apt install ghostscript

# macOS
brew install ghostscript
```

## Setup

```bash
npm install
npm start
# → http://localhost:3000
```

## Dev mode (auto-restart on save)

```bash
npm run dev
```

## Stack

| Package     | Role                            |
|-------------|----------------------------------|
| express 5   | HTTP server                      |
| multer      | File upload handling             |
| sharp       | Image processing (tint/blur/noise/rotation) |
| pdf-lib     | Assembles processed images → PDF |
| ghostscript | Renders PDF pages → PNG          |

## Intensity Levels

| Level  | Noise | Warmth | Rotation | Effect             |
|--------|-------|--------|----------|--------------------|
| Light  | Low   | Subtle | ±0.2°    | Fresh office scan  |
| Medium | Mid   | Warm   | ±0.4°    | Natural scan       |
| Heavy  | High  | Strong | ±0.7°    | Old worn photocopy |
