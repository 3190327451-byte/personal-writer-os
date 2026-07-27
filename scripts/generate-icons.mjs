import sharp from "sharp";

const icon = (size) => {
  const padding = Math.round(size * 0.16);
  const circle = Math.round(size * 0.68);
  const fontSize = Math.round(size * 0.39);
  return Buffer.from(`
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${Math.round(size * 0.21)}" fill="#F4F0E8"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${circle / 2}" fill="#586B5D"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${circle / 2 - 1}" fill="none" stroke="#718176" stroke-width="${Math.max(1, Math.round(size * 0.008))}"/>
      <text x="${size / 2}" y="${size / 2 + fontSize * 0.34}" text-anchor="middle" font-family="Georgia, serif" font-size="${fontSize}" font-weight="400" fill="#F8F5EE">P</text>
      <rect x="${padding}" y="${Math.round(size * 0.83)}" width="${size - padding * 2}" height="${Math.max(1, Math.round(size * 0.006))}" fill="#C9C1B3"/>
    </svg>
  `);
};

await sharp(icon(192)).png().toFile("public/icon-192.png");
await sharp(icon(512)).png().toFile("public/icon-512.png");
