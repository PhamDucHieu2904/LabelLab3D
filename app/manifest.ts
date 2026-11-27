import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HyperMockup — 3D Packaging Mockup Studio",
    short_name: "HyperMockup",
    description:
      "Create photorealistic 3D packaging mockups for bottles, cans, and parametric CAD boxes with 1:1 mm dielines right in your browser.",
    start_url: "/",
    display: "standalone",
    background_color: "#fff5f9",
    theme_color: "#d7195c",
    lang: "vi",
    categories: ["design", "graphics", "productivity"],
    icons: [
      {
        src: "/branding/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/branding/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
