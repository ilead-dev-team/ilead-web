import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

// The source artwork is a three-person crest. These paths keep its three heads,
// raised center figure, and paired rising ribbons legible at interface sizes.
const people = `
  <circle cx="626" cy="380" r="55"/>
  <circle cx="409" cy="528" r="47"/>
  <circle cx="845" cy="528" r="47"/>
  <path d="M463 392C519 429 579 470 626 470S733 429 790 392C714 472 673 561 720 693L626 576 532 693C579 561 539 472 463 392Z"/>
  <path d="M522 574C418 574 335 616 307 689C296 719 300 751 312 780C354 687 433 615 522 574Z"/>
  <path d="M730 574C834 574 917 616 945 689C956 719 952 751 940 780C898 687 819 615 730 574Z"/>
  <path d="M626 626C537 719 371 760 221 928C366 885 483 846 587 760C513 800 426 823 345 844C439 748 547 706 626 665Z"/>
  <path d="M626 626C715 719 881 760 1031 928C886 885 769 846 665 760C739 800 826 823 907 844C813 748 705 706 626 665Z"/>
`;

const svg = (body, viewBox, width, height) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${body}</svg>\n`;
const mark = (color) =>
  svg(`<g fill="${color}">${people}</g>`, "170 300 910 670", 910, 670);
const wordmark = (color) =>
  svg(
    `<g fill="${color}" transform="translate(-11 -15) scale(.06)">${people}</g>
    <text x="59" y="32" fill="${color}" font-family="Segoe UI,Arial,sans-serif" font-size="25" font-weight="750" letter-spacing="-.5">iLEAD</text>
    <text x="60" y="46" fill="${color}" font-family="Segoe UI,Arial,sans-serif" font-size="8" letter-spacing="1.6">PLATFORM</text>`,
    "0 0 205 56",
    205,
    56,
  );
const icon = svg(
  `<rect width="1024" height="1024" rx="192" fill="#18181b"/>
   <g fill="#ffffff" transform="translate(-42 47) scale(.885)">${people}</g>`,
  "0 0 1024 1024",
  1024,
  1024,
);

await mkdir("public/brand", { recursive: true });
await mkdir("src/app", { recursive: true });
await mkdir("artifacts", { recursive: true });
await Promise.all([
  writeFile("public/brand/ilead-mark-ink.svg", mark("#18181b")),
  writeFile("public/brand/ilead-mark-white.svg", mark("#ffffff")),
  writeFile(
    "public/brand/ilead-symbol-cyan.svg",
    mark("oklch(0.52 0.105 223.128)"),
  ),
  writeFile("public/brand/ilead-wordmark-ink.svg", wordmark("#18181b")),
  writeFile("public/brand/ilead-wordmark-white.svg", wordmark("#ffffff")),
  writeFile("src/app/icon.svg", icon),
]);

const png = async (size) =>
  sharp(Buffer.from(icon)).resize(size, size).png().toBuffer();
const [png32, png192, png512] = await Promise.all([
  png(32),
  png(192),
  png(512),
]);
await Promise.all([
  writeFile("public/brand/push-192.png", png192),
  writeFile("public/brand/push-512.png", png512),
  writeFile("artifacts/brand-icon-preview.png", png512),
  sharp(Buffer.from(wordmark("#18181b")))
    .resize(820)
    .png()
    .toBuffer()
    .then((buffer) =>
      writeFile("artifacts/brand-wordmark-preview.png", buffer),
    ),
]);

// ICO accepts a PNG payload; the single 32px entry covers legacy tab clients.
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt8(32, 6);
header.writeUInt8(32, 7);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png32.length, 14);
header.writeUInt32LE(header.length, 18);
await writeFile("src/app/favicon.ico", Buffer.concat([header, png32]));
