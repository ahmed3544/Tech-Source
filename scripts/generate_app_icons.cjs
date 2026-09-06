const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generateAppIcons() {
  const root = path.join(__dirname, '..');
  const publicDir = path.join(root, 'public');
  const assetsDir = path.join(root, 'assets');
  const logoPath = path.join(publicDir, 'logo.png');

  fs.mkdirSync(assetsDir, { recursive: true });

  // Use the exact same company logo shown in the app header.
  // Fit it inside a square canvas so Android/PWA receives valid square icons.
  const logo = sharp(logoPath);

  await logo.clone()
    .resize(192, 192, { fit: 'contain', background: '#ffffff' })
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));

  await logo.clone()
    .resize(512, 512, { fit: 'contain', background: '#ffffff' })
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));

  // Capacitor Assets uses assets/icon.png as the Android app-icon source.
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
