const fs = require('fs');
const path = require('path');

async function generateAppIcons() {
  const root = path.join(__dirname, '..');
  const publicDir = path.join(root, 'public');
  const assetsDir = path.join(root, 'assets');
  const logoPath = path.join(publicDir, 'logo.png');

  fs.mkdirSync(assetsDir, { recursive: true });

  // Vercel builds do not need the optional image-processing package just to
  // complete the web build. If sharp is installed, generate properly sized
  // square icons; otherwise keep the existing logo as the icon source.
  let sharp = null;
  try {
    sharp = require('sharp');
  } catch {
    console.warn('[generate_app_icons] sharp is not installed; using the existing logo.png as the icon source.');
  }

  if (!fs.existsSync(logoPath)) {
    console.warn('[generate_app_icons] public/logo.png not found; skipping icon generation.');
    return;
  }

  if (!sharp) {
    fs.copyFileSync(logoPath, path.join(publicDir, 'icon-192.png'));
    fs.copyFileSync(logoPath, path.join(publicDir, 'icon-512.png'));
    fs.copyFileSync(logoPath, path.join(assetsDir, 'icon.png'));
    return;
  }

  const logo = sharp(logoPath);

  await logo.clone()
    .resize(192, 192, { fit: 'contain', background: '#ffffff' })
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));

  await logo.clone()
    .resize(512, 512, { fit: 'contain', background: '#ffffff' })
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));

  await logo.clone()
    .resize(1024, 1024, { fit: 'contain', background: '#ffffff' })
    .png()
    .toFile(path.join(assetsDir, 'icon.png'));

  console.log('Generated app icons from the header company logo.');
}

generateAppIcons().catch((error) => {
  console.error(error);
  process.exit(1);
});
