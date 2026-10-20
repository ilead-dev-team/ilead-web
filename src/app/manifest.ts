import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "iLead platform",
    short_name: "iLead",
    description: "Rwanda Coding Academy iLead program",
    start_url: "/notifications",
    scope: "/",
    display: "standalone",
    icons: [
      {
        src: "/brand/push-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/push-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
