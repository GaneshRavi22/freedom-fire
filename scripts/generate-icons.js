// Run: node scripts/generate-icons.js
// Requires: npm install --save-dev sharp
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const assetsDir = path.join(__dirname, '..', 'assets');

// ── SVG for main app icon (gradient square, no rounded corners — Expo adds those) ──
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF6B00"/>
      <stop offset="100%" stop-color="#FFD166"/>
    </linearGradient>
    <linearGradient id="shine" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.22)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <!-- Shine overlay -->
  <rect width="1024" height="500" fill="url(#shine)"/>

  <!-- Bar 1 (short, left): bottom-aligned at y=916 -->
  <rect x="128" y="624" width="168" height="292" rx="34" fill="rgba(255,255,255,0.65)"/>

  <!-- Bar 2 (medium): bottom-aligned at y=916 -->
  <rect x="428" y="458" width="168" height="458" rx="34" fill="rgba(255,255,255,0.87)"/>

  <!-- Bar 3 (tall, right): bottom-aligned at y=916 -->
  <rect x="728" y="292" width="168" height="624" rx="34" fill="white"/>

  <!-- Flame outer (gold) — centered at x=812, above bar 3 -->
  <path d="M 812 85 C 746 156, 682 205, 698 292 C 698 330, 754 350, 812 350 C 870 350, 926 330, 926 292 C 942 205, 878 156, 812 85 Z" fill="#FFE566"/>

  <!-- Flame middle (orange) -->
  <path d="M 812 148 C 770 200, 745 232, 750 290 C 750 316, 778 333, 812 338 C 846 333, 874 316, 874 290 C 879 232, 854 200, 812 148 Z" fill="#FFB347"/>

  <!-- Flame inner (bright orange) -->
  <path d="M 812 220 C 790 248, 773 270, 776 290 C 776 306, 793 318, 812 322 C 831 318, 848 306, 848 290 C 851 270, 834 248, 812 220 Z" fill="#FF6B35"/>

  <!-- Main sparkle star (upper-left) -->
  <path d="M 295 160 L 318 228 L 388 252 L 318 276 L 295 344 L 272 276 L 202 252 L 272 228 Z" fill="#FFE566"/>

  <!-- Small sparkle accent (upper-center) -->
  <path d="M 592 78 L 607 118 L 648 133 L 607 148 L 592 188 L 577 148 L 536 133 L 577 118 Z" fill="rgba(255,255,255,0.85)"/>
</svg>
`;

// ── SVG for Android adaptive icon — same design scaled to 75% and centered ──
// Android applies the device's icon shape (circle, squircle, etc.) as a mask.
// With the full-bleed design the flame tip (r≈522) and bar corners (r≈557) fall
// outside the inscribed circle (r=512). Scaling to 75% brings all elements within
// r≈420, safely inside any shape mask.
const adaptiveIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF6B00"/>
      <stop offset="100%" stop-color="#FFD166"/>
    </linearGradient>
    <linearGradient id="shine" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.22)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
  </defs>

  <!-- translate(128,128) scale(0.75) centres a 1024-unit design in 768px,
       keeping all elements within r≈420 of the canvas centre (512,512). -->
  <g transform="translate(128, 128) scale(0.75)">
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <rect width="1024" height="500" fill="url(#shine)"/>

    <rect x="128" y="624" width="168" height="292" rx="34" fill="rgba(255,255,255,0.65)"/>
    <rect x="428" y="458" width="168" height="458" rx="34" fill="rgba(255,255,255,0.87)"/>
    <rect x="728" y="292" width="168" height="624" rx="34" fill="white"/>

    <path d="M 812 85 C 746 156, 682 205, 698 292 C 698 330, 754 350, 812 350 C 870 350, 926 330, 926 292 C 942 205, 878 156, 812 85 Z" fill="#FFE566"/>
    <path d="M 812 148 C 770 200, 745 232, 750 290 C 750 316, 778 333, 812 338 C 846 333, 874 316, 874 290 C 879 232, 854 200, 812 148 Z" fill="#FFB347"/>
    <path d="M 812 220 C 790 248, 773 270, 776 290 C 776 306, 793 318, 812 322 C 831 318, 848 306, 848 290 C 851 270, 834 248, 812 220 Z" fill="#FF6B35"/>

    <path d="M 295 160 L 318 228 L 388 252 L 318 276 L 295 344 L 272 276 L 202 252 L 272 228 Z" fill="#FFE566"/>
    <path d="M 592 78 L 607 118 L 648 133 L 607 148 L 592 188 L 577 148 L 536 133 L 577 118 Z" fill="rgba(255,255,255,0.85)"/>
  </g>
</svg>
`;

// ── SVG for splash screen (transparent bg — shown centered on #0F0E1A) ──
const splashSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <!-- Transparent background -->

  <!-- Bar 1 (short, left) -->
  <rect x="128" y="624" width="168" height="292" rx="34" fill="rgba(255,255,255,0.50)"/>

  <!-- Bar 2 (medium) -->
  <rect x="428" y="458" width="168" height="458" rx="34" fill="rgba(255,255,255,0.75)"/>

  <!-- Bar 3 (tall, right) -->
  <rect x="728" y="292" width="168" height="624" rx="34" fill="white"/>

  <!-- Flame outer (gold) -->
  <path d="M 812 85 C 746 156, 682 205, 698 292 C 698 330, 754 350, 812 350 C 870 350, 926 330, 926 292 C 942 205, 878 156, 812 85 Z" fill="#FFE566"/>

  <!-- Flame middle (orange) -->
  <path d="M 812 148 C 770 200, 745 232, 750 290 C 750 316, 778 333, 812 338 C 846 333, 874 316, 874 290 C 879 232, 854 200, 812 148 Z" fill="#FFB347"/>

  <!-- Flame inner (bright orange) -->
  <path d="M 812 220 C 790 248, 773 270, 776 290 C 776 306, 793 318, 812 322 C 831 318, 848 306, 848 290 C 851 270, 834 248, 812 220 Z" fill="#FF6B35"/>

  <!-- Main sparkle star (upper-left) -->
  <path d="M 295 160 L 318 228 L 388 252 L 318 276 L 295 344 L 272 276 L 202 252 L 272 228 Z" fill="#FFE566"/>

  <!-- Small sparkle accent -->
  <path d="M 592 78 L 607 118 L 648 133 L 607 148 L 592 188 L 577 148 L 536 133 L 577 118 Z" fill="rgba(255,255,255,0.85)"/>
</svg>
`;

async function generate() {
  console.log('Generating FreedomFire icons...');

  // icon.png — 1024×1024 (Expo adds rounded corners / shape masking per platform)
  await sharp(Buffer.from(iconSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(assetsDir, 'icon.png'));
  console.log('  icon.png         1024x1024');

  // adaptive-icon.png — design scaled to 75% and centered so that all elements
  // (flame tip, bar corners) stay within the inscribed circle (r=512).
  // Android circular icon shapes clip anything beyond r=512 from center.
  await sharp(Buffer.from(adaptiveIconSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(assetsDir, 'adaptive-icon.png'));
  console.log('  adaptive-icon.png 1024x1024 (75% centered, circular-safe)');

  // splash-icon.png — transparent logo centered on app background (#0F0E1A)
  await sharp(Buffer.from(splashSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(assetsDir, 'splash-icon.png'));
  console.log('  splash-icon.png  1024x1024 (transparent)');

  // favicon.png — 64×64 for web
  await sharp(Buffer.from(iconSvg))
    .resize(64, 64)
    .png()
    .toFile(path.join(assetsDir, 'favicon.png'));
  console.log('  favicon.png      64x64');

  console.log('Done. All assets written to assets/');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
