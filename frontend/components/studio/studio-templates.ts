import {
  Armchair,
  Gem,
  Moon,
  Plane,
  Smartphone,
  UserRound,
  UtensilsCrossed,
  Zap,
  Clapperboard,
  Mountain,
  Flame,
  Package,
} from "lucide-react";
import type { StudioTemplate } from "./studio-parts";

/* Card artwork is decorative content (not UI chrome), so these pastels are
   intentionally outside the product palette tokens. */

export const IMAGE_TEMPLATES: StudioTemplate[] = [
  {
    id: "product-hero",
    title: "Product hero",
    meta: "Product · 1:1",
    icon: Gem,
    gradient: "from-[#FBD9C8] to-[#E7CFA6]",
    prompt:
      "Studio product photo of a premium wristwatch on a seamless pastel backdrop, soft diffused key light, subtle reflection, shallow depth of field, crisp detail, e-commerce hero shot",
    aspectRatio: "1:1",
  },
  {
    id: "biryani-hero",
    title: "Biryani hero",
    meta: "Food · 4:5",
    icon: UtensilsCrossed,
    gradient: "from-[#FCE1CB] to-[#E3D0A4]",
    prompt:
      "Overhead hero shot of steaming hyderabadi chicken biryani in a copper handi, saffron rice, fried onions, mint, warm natural window light, rustic wooden table, appetizing food photography",
    aspectRatio: "4:5",
  },
  {
    id: "red-carpet",
    title: "Red carpet portrait",
    meta: "Portraits · 2:3",
    icon: UserRound,
    gradient: "from-[#FFD9DC] to-[#F6B9AE]",
    prompt:
      "Editorial red carpet portrait of an elegant person in a tailored evening outfit, camera flashes bokeh in the background, glossy magazine lighting, sharp focus on the face, 85mm lens",
    aspectRatio: "2:3",
  },
  {
    id: "superhero-poster",
    title: "Superhero poster",
    meta: "Fantasy · 2:3",
    icon: Zap,
    gradient: "from-[#F4E8B8] to-[#D4CC9E]",
    prompt:
      "Cinematic superhero movie poster, hero silhouette standing on a rooftop at dusk with a stormy sky, dramatic rim lighting, bold title space at the bottom, high contrast, epic composition",
    aspectRatio: "2:3",
  },
  {
    id: "dark-product",
    title: "Dark product shot",
    meta: "Product · 4:5",
    icon: Moon,
    gradient: "from-[#DCE0FB] to-[#C9C5F0]",
    prompt:
      "Moody dark-mode product shot of a pair of wireless headphones on black glass, neon violet rim light, fine dust particles, reflective surface, luxury tech advert",
    aspectRatio: "4:5",
  },
  {
    id: "travel-postcard",
    title: "Travel postcard",
    meta: "Travel · 3:2",
    icon: Plane,
    gradient: "from-[#CFE8F5] to-[#B9DCCB]",
    prompt:
      "Vintage travel postcard illustration of the Amalfi coast, pastel buildings stacked on cliffs, turquoise sea, retro print texture, bold lettering space at the top",
    aspectRatio: "3:2",
  },
  {
    id: "app-mockup",
    title: "App mockup",
    meta: "Product · 9:16",
    icon: Smartphone,
    gradient: "from-[#E3D7F8] to-[#C9D6F5]",
    prompt:
      "Clean 3D mockup of a smartphone floating at an angle showing a modern finance app UI, soft violet gradient background, subtle shadow, marketing key visual",
    aspectRatio: "9:16",
  },
  {
    id: "interior",
    title: "Interior render",
    meta: "Design · 3:2",
    icon: Armchair,
    gradient: "from-[#EFE3D3] to-[#D9CDB6]",
    prompt:
      "Photorealistic Scandinavian living room interior, linen sofa, oak floor, large window with morning light, indoor plants, calm neutral palette, architectural digest style",
    aspectRatio: "3:2",
  },
];

export const VIDEO_TEMPLATES: StudioTemplate[] = [
  {
    id: "product-spin",
    title: "Product spin",
    meta: "Product · 5s · 1:1",
    icon: Package,
    gradient: "from-[#DCE0FB] to-[#C6C0F0]",
    prompt:
      "Smooth 360 degree turntable rotation of a matte black sneaker on a pastel studio sweep, soft shadows, crisp reflections, slow and steady camera",
    aspectRatio: "1:1",
    duration: 5,
  },
  {
    id: "sizzle",
    title: "Sizzle shot",
    meta: "Food · 5s · 16:9",
    icon: Flame,
    gradient: "from-[#FCE1CB] to-[#E3C79E]",
    prompt:
      "Close-up of butter melting and sizzling on a hot cast-iron pan with a steak being seared, rising steam, warm kitchen light, slow motion macro",
    aspectRatio: "16:9",
    duration: 5,
  },
  {
    id: "reel-hook",
    title: "Reel hook",
    meta: "Social · 5s · 9:16",
    icon: Smartphone,
    gradient: "from-[#F5D8F2] to-[#E8BFE3]",
    prompt:
      "Fast energetic vertical reel opener, a hand snaps fingers and the scene whip-pans into a colourful neon city street, punchy motion, attention-grabbing first second",
    aspectRatio: "9:16",
    duration: 5,
  },
  {
    id: "cinematic-city",
    title: "Cinematic city",
    meta: "Cinematic · 8s · 16:9",
    icon: Clapperboard,
    gradient: "from-[#F5ECCB] to-[#DCD3AC]",
    prompt:
      "A slow cinematic push-in down a rain-soaked neon street at night, reflections on the asphalt, steam from manholes, shallow depth of field, anamorphic lens flares",
    aspectRatio: "16:9",
    duration: 8,
  },
  {
    id: "drone-landscape",
    title: "Drone landscape",
    meta: "Travel · 6s · 16:9",
    icon: Mountain,
    gradient: "from-[#CFE8F5] to-[#B9DCCB]",
    prompt:
      "Aerial drone shot gliding over a misty mountain valley at sunrise, golden light breaking through clouds, a river winding below, smooth forward motion",
    aspectRatio: "16:9",
    duration: 6,
  },
];

/* ── Documents ────────────────────────────────────────────────────── */

export type DocFormat = "PDF" | "DOCX" | "PPTX" | "XLSX";

export const DOC_FORMAT_LABEL: Record<DocFormat, string> = {
  PDF: "PDF",
  DOCX: "Word",
  PPTX: "PowerPoint",
  XLSX: "Excel",
};

/** The phrase the chat pipeline's document-intent detector recognises. */
export const DOC_FORMAT_NOUN: Record<DocFormat, string> = {
  PDF: "PDF document",
  DOCX: "Word document (.docx)",
  PPTX: "PowerPoint presentation (.pptx)",
  XLSX: "Excel workbook (.xlsx)",
};

export const DOC_LENGTHS: Record<DocFormat, { value: string; label: string }[]> = {
  PDF: [
    { value: "1-2 pages", label: "1–2 pages" },
    { value: "4-6 pages", label: "4–6 pages" },
    { value: "8-12 pages", label: "8–12 pages" },
  ],
  DOCX: [
    { value: "1-2 pages", label: "1–2 pages" },
    { value: "4-6 pages", label: "4–6 pages" },
    { value: "8-12 pages", label: "8–12 pages" },
  ],
  PPTX: [
    { value: "5-7 slides", label: "5–7 slides" },
    { value: "8-12 slides", label: "8–12 slides" },
    { value: "15-20 slides", label: "15–20 slides" },
  ],
  XLSX: [
    { value: "a single sheet", label: "1 sheet" },
    { value: "2-3 sheets", label: "2–3 sheets" },
  ],
};

export const IMAGE_ASPECTS = ["1:1", "4:5", "2:3", "3:2", "16:9", "9:16"] as const;
