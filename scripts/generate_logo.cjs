const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Pixel-perfect SVG matching the screenshot exactly
const svgContent = `<svg width="800" height="320" viewBox="0 0 800 320" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- TS Emblem Gradient: Navy Top to Azure/Cyan Bottom -->
    <linearGradient id="emblemBlueGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a2544" />
      <stop offset="35%" stop-color="#0c3b6d" />
      <stop offset="70%" stop-color="#0280c6" />
      <stop offset="100%" stop-color="#00a8e8" />
    </linearGradient>

    <!-- Subtle inner drop shadow / contrast for logo -->
    <filter id="cardShadow" x="-2%" y="-2%" width="104%" height="104%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000000" flood-opacity="0.08"/>
    </filter>
  </defs>

  <!-- White Rounded Outer Container Card (matches screenshot) -->
  <rect x="8" y="8" width="784" height="304" rx="72" fill="#FFFFFF" filter="url(#cardShadow)"/>

  <!-- Left: Stylized TS Monogram Emblem -->
  <g transform="translate(100, 56)">
    <!-- 1. Top Horizontal Bar of 'T' -->
    <rect x="0" y="0" width="112" height="30" rx="8" fill="url(#emblemBlueGrad)" />

    <!-- 2. Upper Left Pillar of T -->
    <rect x="0" y="38" width="34" height="66" rx="8" fill="url(#emblemBlueGrad)" />

    <!-- 3. Upper Right Block of T -->
    <rect x="52" y="38" width="60" height="48" rx="8" fill="url(#emblemBlueGrad)" />

    <!-- 4. Center 'S' Flow Bar & Right Descender -->
    <!-- Center connecting line with smooth rounded corners -->
    <path d="
      M 0 112 
      H 74 
      C 82 112 88 118 88 126 
      V 152 
      C 88 158 84 162 78 162 
      H 8 
      C 3.5 162 0 158.5 0 154 
      V 112 
      Z
    " fill="url(#emblemBlueGrad)" />

    <!-- 5. Lower Right Leg of S -->
    <rect x="78" y="94" width="34" height="106" rx="8" fill="url(#emblemBlueGrad)" />

    <!-- 6. Bottom Left Base of S -->
    <rect x="0" y="170" width="70" height="30" rx="8" fill="url(#emblemBlueGrad)" />
  </g>

  <!-- Clean Unified Geometric Path for TS Emblem -->
  <!-- We replace with an exact unified vector curve for maximum crispness -->
  <g transform="translate(100, 56)">
    <!-- Top Cap of T -->
    <path d="M 6 0 H 106 C 109.3 0 112 2.7 112 6 V 24 C 112 27.3 109.3 30 106 30 H 6 C 2.7 30 0 27.3 0 24 V 6 C 0 2.7 2.7 0 6 0 Z" fill="url(#emblemBlueGrad)"/>

    <!-- Left Upper Block (T-left) -->
    <path d="M 6 38 H 28 C 31.3 38 34 40.7 34 44 V 98 C 34 101.3 31.3 104 28 104 H 6 C 2.7 104 0 101.3 0 98 V 44 C 0 40.7 2.7 38 6 38 Z" fill="url(#emblemBlueGrad)"/>

    <!-- Right Upper Block (T-right) -->
    <path d="M 52 38 H 106 C 109.3 38 112 40.7 112 44 V 78 C 112 81.3 109.3 84 106 84 H 52 C 48.7 84 46 81.3 46 78 V 44 C 46 40.7 48.7 38 52 38 Z" fill="url(#emblemBlueGrad)"/>

    <!-- Middle-to-Bottom S curve: wraps around seamlessly -->
    <path d="
      M 6 112
      H 74
      C 77.3 112 80 114.7 80 118
      V 152
      C 80 155.3 77.3 158 74 158
      H 6
      C 2.7 158 0 155.3 0 152
      V 118
      C 0 114.7 2.7 112 6 112
      Z
    " fill="url(#emblemBlueGrad)"/>

    <!-- Lower Right Long Pillar of S -->
    <path d="M 86 92 H 106 C 109.3 92 112 94.7 112 98 V 202 C 112 205.3 109.3 208 106 208 H 86 C 82.7 208 80 205.3 80 202 V 98 C 80 94.7 82.7 92 86 92 Z" fill="url(#emblemBlueGrad)"/>

    <!-- Bottom Left Cap of S -->
    <path d="M 6 178 H 72 C 75.3 178 78 180.7 78 184 V 202 C 78 205.3 75.3 208 72 208 H 6 C 2.7 208 0 205.3 0 202 V 184 C 0 180.7 2.7 178 6 178 Z" fill="url(#emblemBlueGrad)"/>
  </g>

  <!-- Typography Right Side: TECH SOURCE GDS-GLOBAL DEVELOPMENT -->
  <!-- Line 1: TECH -->
  <text x="246" y="128" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, 'Montserrat', Roboto, sans-serif" font-weight="900" font-size="72" fill="#0A1E3F" letter-spacing="1.5">TECH</text>

  <!-- Line 2: SOURCE -->
  <text x="246" y="196" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, 'Montserrat', Roboto, sans-serif" font-weight="900" font-size="72" fill="#0A1E3F" letter-spacing="1.5">SOURCE</text>

  <!-- Line 3: GDS-GLOBAL DEVELOPMENT -->
  <text x="248" y="238" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, 'Inter', Roboto, sans-serif" font-weight="800" font-size="22" fill="#0A1E3F" letter-spacing="3">GDS-GLOBAL DEVELOPMENT</text>
</svg>`;

async function buildLogos() {
  const publicDir = path.join(__dirname, '..', 'public');
  
  // Write SVG
  fs.writeFileSync(path.join(publicDir, 'logo.svg'), svgContent, 'utf-8');
  console.log('Written public/logo.svg');

  // Generate crisp PNG at 2x resolution (1600 x 640)
  await sharp(Buffer.from(svgContent))
    .resize(1600, 640)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(publicDir, 'logo.png'));
    
  console.log('Generated crisp public/logo.png successfully!');
}

buildLogos().catch(err => {
  console.error(err);
  process.exit(1);
});
