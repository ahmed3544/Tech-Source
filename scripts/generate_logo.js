const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Exact SVG representation of Tech Source (GDS - Global Development) logo
const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="600" height="240" viewBox="0 0 600 240" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Emblem Blue Gradient -->
    <linearGradient id="tsGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0F2B5C" />
      <stop offset="35%" stop-color="#144272" />
      <stop offset="70%" stop-color="#0284C7" />
      <stop offset="100%" stop-color="#00B4D8" />
    </linearGradient>

    <linearGradient id="tsGradAlt" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0096C7" />
      <stop offset="50%" stop-color="#0077B6" />
      <stop offset="100%" stop-color="#03045E" />
    </linearGradient>

    <filter id="subtleShadow" x="-5%" y="-5%" width="110%" height="110%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.06"/>
    </filter>
  </defs>

  <!-- Background White Rounded Card Container -->
  <rect x="10" y="10" width="580" height="220" rx="55" fill="#FFFFFF" filter="url(#subtleShadow)"/>

  <!-- TS Monogram Icon -->
  <g transform="translate(68, 38)">
    <!-- Top Bar of T -->
    <rect x="0" y="0" width="84" height="26" rx="7" fill="url(#tsGrad)" />

    <!-- Left Pillar (Upper Left of T) -->
    <path d="M0 34 C0 30.5 2.5 28 6 28 H26 C29.5 28 32 30.5 32 34 V94 C32 97.5 29.5 100 26 100 H6 C2.5 100 0 97.5 0 94 Z" fill="url(#tsGrad)" />

    <!-- S Curved Middle and Right Pillar of T -->
    <path d="M42 28 H68 C71.5 28 74 30.5 74 34 V68 C74 71.5 71.5 74 68 74 H44 C37.5 74 32 79.5 32 86 V96 C32 102.5 37.5 108 44 108 H84 V136 H6 C2.5 136 0 133.5 0 130 V124 C0 120.5 2.5 118 6 118 H44 C48.5 118 52 114.5 52 110 V94 C52 89.5 48.5 86 44 86 H20 C9 86 0 77 0 66 V42 C0 34.5 5.5 28 13 28 Z" fill="url(#tsGrad)" />

    <!-- Lower Right Base of S / Stem -->
    <path d="M84 78 H90 C93.5 78 96 80.5 96 84 V158 C96 161.5 93.5 164 90 164 H12 C8.5 164 6 161.5 6 158 V146 H84 Z" fill="url(#tsGrad)" />
  </g>

  <!-- Precise Stylized TS Emblem Path Based on Logo Screenshot -->
  <g transform="translate(74, 40)">
    <!-- Top Rounded Cap of T -->
    <rect x="0" y="0" width="82" height="23" rx="6" fill="url(#tsGrad)" />

    <!-- Main TS intertwined shape -->
    <path d="
      M 0 30 
      H 24 
      C 28 30 30 32 30 36 
      V 76 
      C 30 80 33 83 37 83 
      H 66 
      C 76 83 84 91 84 101 
      V 144 
      C 84 148 81 151 77 151 
      H 54 
      C 50 151 48 149 48 145 
      V 109 
      C 48 105 45 102 41 102 
      H 18 
      C 8 102 0 94 0 84 
      V 30 
      Z
    " fill="url(#tsGrad)" />

    <!-- Upper Right Block of T -->
    <path d="
      M 48 30 
      H 76 
      C 80 30 84 34 84 38 
      V 66 
      C 84 70 80 74 76 74 
      H 48 
      C 44 74 42 72 42 68 
      V 36 
      C 42 32 44 30 48 30 
      Z
    " fill="url(#tsGrad)" />

    <!-- Bottom Left Hook of S -->
    <path d="
      M 0 110 
      H 28 
      C 32 110 34 112 34 116 
      V 145 
      C 34 149 30 151 26 151 
      H 8 
      C 3.5 151 0 147.5 0 143 
      V 110 
      Z
    " fill="url(#tsGrad)" />
  </g>

  <!-- Typography: TECH SOURCE GDS-GLOBAL DEVELOPMENT -->
  <!-- Line 1: TECH -->
  <text x="182" y="94" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, 'Montserrat', Roboto, 'Arial Black', sans-serif" font-weight="900" font-size="52" fill="#091E3E" letter-spacing="1">TECH</text>

  <!-- Line 2: SOURCE -->
  <text x="182" y="148" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, 'Montserrat', Roboto, 'Arial Black', sans-serif" font-weight="900" font-size="52" fill="#091E3E" letter-spacing="1">SOURCE</text>

  <!-- Line 3: GDS-GLOBAL DEVELOPMENT -->
  <text x="184" y="178" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, 'Inter', Roboto, sans-serif" font-weight="700" font-size="16" fill="#1E293B" letter-spacing="2.5">GDS-GLOBAL DEVELOPMENT</text>
</svg>`;

async function buildLogos() {
  const publicDir = path.join(__dirname, '..', 'public');
  
  // Write SVG
  fs.writeFileSync(path.join(publicDir, 'logo.svg'), svgContent, 'utf-8');
  console.log('Written public/logo.svg');

  // Generate crisp PNG at 2x resolution (1200 x 480)
  await sharp(Buffer.from(svgContent))
    .resize(1200, 480)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(publicDir, 'logo.png'));
    
  console.log('Generated crisp public/logo.png successfully!');
}

buildLogos().catch(err => {
  console.error(err);
  process.exit(1);
});
