import prisma from "@root/prisma.js";

type ImageTemplateSeed = {
  title: string;
  category: string;
  previewUrl: string;
  aspectRatio: string;
  prompt: string;
};

const imageTemplates: ImageTemplateSeed[] = [
  {
    title: "Cinematic Luxury Portrait",
    category: "Portrait",
    previewUrl:
      "https://res.cloudinary.com/dlmcpmdpn/image/upload/v1791790597/image-temp-2_smfesj.jpg",
    aspectRatio: "3:4",
    prompt: `Transform the person in the uploaded reference photo into a powerful, cinematic, luxury editorial portrait. Preserve the person's recognizable facial identity, natural facial proportions, skin tone, hairstyle, and defining features. Dress them in a perfectly tailored black outfit with subtle premium textures and understated accessories. Place them in an elegant, dark architectural setting with warm amber practical lights, deep charcoal shadows, subtle atmospheric haze, and a sophisticated background. Use dramatic Rembrandt lighting on the face, a warm golden rim light outlining the hair and shoulders, realistic skin texture, detailed eyes, natural pores, rich blacks, controlled highlights, cinematic color grading, and shallow depth of field. Compose the subject in a confident three-quarter pose with a calm, intense expression. Professional full-frame portrait photography, 85mm lens aesthetic, realistic anatomy, premium magazine-cover quality, photorealistic, high detail. The result should feel like an original film character portrait, not a copy of any existing actor or character. Avoid artificial skin smoothing, distorted facial features, extra fingers, exaggerated muscles, excessive sharpening, watermarks, logos, and random text. Keep the subject's identity consistent with the reference photo.`,
  },
  {
    title: "1970s Bombay Street Style",
    category: "Vintage",
    previewUrl:
      "https://res.cloudinary.com/dlmcpmdpn/image/upload/v1791790597/image-temp-3_eeeqre.jpg",
    aspectRatio: "3:4",
    prompt: `Reimagine the person in the uploaded photo as the lead subject of an authentic-looking 1970s Bombay street-fashion photograph. Preserve their real facial identity, skin tone, facial structure, and recognizable features while adapting the hairstyle, clothing, and surroundings to the era. Style the subject in period-inspired Indian fashion: a textured collared shirt, flared trousers, a vintage blouse, a classic sari, or another era-appropriate outfit suited to the person. Set the scene on an old Mumbai street with period-inspired storefronts, vintage architecture, warm afternoon sunlight, subtle traffic in the distance, and candid everyday details. Capture the image like a real analog photograph shot on 35mm film: warm faded colors, gentle halation, organic film grain, slightly imperfect exposure, soft highlights, muted shadows, natural skin texture, and authentic photographic imperfections. Use a candid, confident pose, realistic clothing folds, environmental storytelling, and a nostalgic editorial composition. Make the image feel like a rediscovered family-album photograph or a still from an original retro Indian film. Photorealistic, period-conscious, emotionally evocative, visually rich without looking digitally overprocessed. Avoid modern cars, contemporary signage, modern smartphones, overly clean digital rendering, fake aging artifacts, inaccurate facial identity, watermarks, and invented text. Preserve the person while changing the era and visual treatment.`,
  },
  {
    title: "Celestial Fantasy Character",
    category: "Fantasy",
    previewUrl:
      "https://res.cloudinary.com/dlmcpmdpn/image/upload/v1791790596/image-temp-4_xotks5.jpg",
    aspectRatio: "3:4",
    prompt: `Transform the uploaded person into an original celestial fantasy character while preserving their recognizable face, facial proportions, skin tone, and distinctive features. Dress them in layered midnight-blue, violet, and silver garments with intricate embroidered patterns, translucent flowing fabric, delicate metallic ornaments, and luminous celestial detailing. Surround the character with elegant orbital rings, floating particles of stardust, distant galaxies, softly glowing constellations, and a radiant halo made from abstract geometric light. Let the environment feel like a vast cosmic temple suspended among the stars. Use rich violet and indigo tones balanced with silver highlights, subtle magenta nebula clouds, volumetric light rays, and carefully controlled magical glow. Create a beautiful, cinematic composition with flowing motion in the fabric, believable facial anatomy, detailed hair, realistic material textures, layered depth, and a clear focal point on the subject's face. Blend photorealistic portrait rendering with sophisticated fantasy concept art. The final image should feel epic, elegant, mysterious, and original, suitable for a fantasy character poster. Keep magical effects around the character rather than obscuring their identity. Avoid excessive glow, visual clutter, malformed hands, extra limbs, generic facial replacement, text, logos, and watermarks. Maintain strong separation between the subject and background.`,
  },
  {
    title: "Designer Collectible Figurine",
    category: "3D & Toys",
    previewUrl:
      "https://res.cloudinary.com/dlmcpmdpn/image/upload/v1791790596/image-temp-5_qzdr2w.jpg",
    aspectRatio: "1:1",
    prompt: `Create a premium 3D collectible figurine based on the person in the uploaded reference image. Preserve their recognizable hairstyle, facial characteristics, skin tone, glasses if present, and signature appearance, translating these details into a charming, polished designer-toy aesthetic. Show the complete miniature figure standing inside a sophisticated transparent display box with a molded insert, a premium matte backing card, rounded packaging corners, subtle embossed decorative details, and realistic reflections on the plastic. Give the figure a stylish outfit inspired by the reference image or the user's requested outfit. Add three to five miniature accessories arranged neatly in separate compartments, such as a laptop, headphones, camera, notebook, backpack, art tools, or other harmless personal-interest objects appropriate to the subject. Use beautifully balanced proportions, a slightly stylized head, clean sculpted surfaces, realistic fabric details, refined paintwork, and soft studio lighting. Photograph the packaging at a three-quarter angle against a neutral luxury product-photography background, with crisp focus, believable contact shadows, realistic materials, and a subtle premium color palette. The result should resemble a high-end designer collectible photographed for an online product launch. Make the figure and packaging visually cohesive and delightful. Keep any printed text minimal and legible; use a short custom name only if supplied by the user. No existing toy brands, copyrighted character designs, random lettering, duplicate accessories, distorted packaging, or watermarks.`,
  },
  {
    title: "Couture Fashion Editorial",
    category: "Fashion",
    previewUrl:
      "https://res.cloudinary.com/dlmcpmdpn/image/upload/v1791790596/image-temp-6_cxscmh.jpg",
    aspectRatio: "3:4",
    prompt: `Use the uploaded image as the identity reference and create a high-end fashion editorial portrait featuring the same person. Preserve their facial identity, natural skin tone, facial proportions, and distinctive features. Style them in a sophisticated couture-inspired outfit with a sculptural silhouette, rich emerald, burgundy, ivory, or black fabric, elegant tailoring, tasteful jewelry, and refined accessories suited to their personal style. Position the subject in a minimal architectural studio with a bold color-blocked backdrop and a carefully designed arrangement of shadows. Use a large directional softbox, controlled specular highlights, subtle fill lighting, natural skin texture, beautiful fabric detail, and professional editorial color grading. Choose an expressive but natural pose, graceful hand placement, confident posture, and direct or thoughtfully averted eye contact. Frame the portrait like a luxury fashion publication: deliberate negative space, clean visual hierarchy, sophisticated contrast, crisp focus on the eyes, realistic proportions, and premium photographic detail. Let the outfit, pose, lighting, and background create the drama without relying on excessive retouching. Photorealistic fashion photography, polished art direction, premium studio finish. No fake fashion-house logos, accidental text, overly airbrushed skin, unrealistic body proportions, malformed hands, excessive accessories, watermarks, or changes to the person's recognizable identity.`,
  },
  {
    title: "Human-Android Hybrid",
    category: "Sci-Fi",
    previewUrl:
      "https://res.cloudinary.com/dlmcpmdpn/image/upload/v1791790596/image-temp-7_fypxfu.jpg",
    aspectRatio: "3:4",
    prompt: `Transform the person in the uploaded reference photo into an original futuristic human-android hybrid. Retain their recognizable facial identity, facial proportions, skin tone in the organic areas, hairstyle where appropriate, and defining features. Blend realistic human skin with precision-engineered mechanical elements around the temples, neck, shoulders, and selected areas of the face. Design the robotic components with brushed titanium, pearl-white ceramic plating, dark graphite joints, fine metallic seams, and subtle cyan luminous circuitry. The technology should appear elegantly integrated beneath the skin rather than resembling random machinery. Keep the eyes expressive and natural, with a faint technological reflection rather than exaggerated glowing pupils. Place the subject in a sophisticated futuristic laboratory or minimalist science-fiction city with soft atmospheric haze, cool architectural lighting, a few warm accent lights, and distant holographic interfaces. Use realistic material reflections, detailed micro-textures, cinematic rim lighting, shallow depth of field, and a strong portrait composition. The final image should feel like a believable live-action science-fiction character reveal, blending human emotion with advanced engineering. Maintain anatomical consistency, realistic joints, coherent mechanical construction, and clear facial identity. Avoid exposed gore, disturbing body transformations, random wires, excessive neon, malformed facial structures, unreadable interface text, logos, and watermarks.`,
  },
  {
    title: "Neon Rain Cyberpunk Street",
    category: "Sci-Fi",
    previewUrl:
      "https://res.cloudinary.com/dlmcpmdpn/image/upload/v1791790596/image-temp-8_zchazt.jpg",
    aspectRatio: "3:4",
    prompt: `Create a photorealistic cinematic portrait of the person in the uploaded photo as the protagonist of an original futuristic urban story. Preserve their recognizable face, natural skin tone, facial structure, and key identity features. Style them in layered technical streetwear, a structured dark jacket, subtle reflective panels, contemporary sneakers if visible, and carefully chosen futuristic accessories. Set the scene on a rain-soaked city street at night with towering architecture, colorful magenta and cyan lights, distant moving traffic, glass reflections, soft mist, and wet pavement reflecting the surrounding neon. Add a few believable environmental details such as blurred pedestrians or illuminated storefronts, keeping the subject clearly dominant. Light the face with a balanced mix of cool cyan and warm magenta, retaining realistic skin color and facial detail. Use cinematic contrast, subtle atmospheric perspective, realistic water droplets on clothing where appropriate, shallow depth of field, a 50mm street-photography aesthetic, and a confident natural pose. Create a visually rich but coherent image with a clear focal point and strong separation from the background. The image should feel like a premium live-action science-fiction movie still rather than a game screenshot. Preserve natural anatomy and believable materials. Avoid excessive neon bloom, illegible signage, distorted eyes, plastic skin, impossible reflections, random logos, watermarks, and facial identity drift.`,
  },
  {
    title: "Rainy Window Cafe",
    category: "Lifestyle",
    previewUrl:
      "https://res.cloudinary.com/dlmcpmdpn/image/upload/v1791790596/image-temp-9_ghedja.jpg",
    aspectRatio: "3:4",
    prompt: `Transform the uploaded person into the subject of a warm, intimate lifestyle photograph. Preserve their facial identity, natural skin tone, hair, and recognizable features. Dress them in comfortable, stylish everyday clothing such as a textured knit sweater, soft cardigan, relaxed shirt, or another outfit that fits the requested aesthetic. Place them beside a large rain-covered window in a charming cafe or cozy apartment. Include a ceramic coffee cup, a softly glowing table lamp, a few books, natural wood, textured blankets, and subtle greenery. Let raindrops on the window create delicate reflections while the outside world falls into a soft, muted blur. Use warm tungsten lighting inside, cool overcast daylight outside, gentle shadows, authentic skin texture, relaxed posture, and a candid expression. Photograph the scene as if captured on a 35mm film camera with subtle grain, soft highlight roll-off, natural color grading, and shallow depth of field. Create a quiet, personal atmosphere that feels lived-in and emotionally authentic rather than staged. Keep the composition balanced and uncluttered, with the person's face clearly visible. Use realistic hands, fabric folds, reflections, and natural proportions. Avoid excessive beauty filters, oversaturated colors, artificial bokeh, unrealistic window reflections, text overlays, logos, and watermarks.`,
  },
  {
    title: "Royal Indian Portrait",
    category: "Cultural",
    previewUrl:
      "https://res.cloudinary.com/dlmcpmdpn/image/upload/v1791790596/image-temp-10_mwc90p.jpg",
    aspectRatio: "3:4",
    prompt: `Create an elegant, cinematic royal Indian portrait of the person in the uploaded reference photo. Preserve their real facial identity, skin tone, facial proportions, and defining features. Dress them in sophisticated traditional Indian attire chosen to suit the person: an intricately embroidered sherwani, an elegant sari, a richly textured lehenga, a tailored kurta, or another culturally appropriate ensemble. Use deep emerald, ruby, ivory, and antique gold accents with detailed embroidery, realistic woven fabrics, refined jewelry, and tasteful traditional accessories. Place the subject in a beautifully designed palace-inspired setting with carved arches, subtle jali patterns, warm sandstone or marble surfaces, and softly glowing lamps. Keep the background elegant and atmospheric rather than crowded with decorations. Use warm golden-hour light, gentle directional illumination on the face, delicate rim lighting, realistic skin texture, rich fabric detail, balanced color grading, and a cinematic portrait composition. Give the subject a poised, dignified expression and a natural stance. Capture the image with the polish of a luxury cultural fashion campaign while retaining the authenticity of a real photograph. Avoid inaccurate facial changes, overly theatrical costumes, excessive jewelry, artificial skin smoothing, stereotyped cultural details, malformed hands, invented symbols, watermarks, and random text. Make the final result refined, contemporary, respectful, and visually memorable.`,
  },
  {
    title: "Premium Anime Character",
    category: "Anime & Illustration",
    previewUrl:
      "https://res.cloudinary.com/dlmcpmdpn/image/upload/v1791790596/image-temp-11_amdkwl.jpg",
    aspectRatio: "3:4",
    prompt: `Turn the person in the uploaded reference photo into an original premium anime-inspired character illustration. Preserve their recognizable identity through their hairstyle, face shape, skin tone, distinctive features, glasses if present, and overall visual character. Translate these features naturally into a polished illustrated design rather than simply placing a realistic face on an animated body. Give the character an expressive but believable face, carefully drawn eyes, clean linework, detailed hair strands, beautifully layered clothing, and a distinctive outfit inspired by the user's chosen persona. Add flowing fabric, subtle decorative details, and a few luminous particles or abstract energy ribbons that complement the composition without obscuring the face. Use a rich cinematic palette of indigo, violet, electric blue, and restrained pink highlights. Create atmospheric depth with softly blurred lights, elegant gradients, directional rim lighting, and a beautifully composed background. Combine crisp illustration edges with painterly environmental details, sophisticated shading, refined color transitions, and professional character-poster art direction. Frame the subject in a dynamic three-quarter portrait with a memorable expression and a clear focal point. Keep anatomy consistent, hands natural, and costume details coherent. The result should be an original, high-quality anime-inspired character artwork, suitable for an avatar or poster, without copying a recognizable existing franchise or character. Avoid inconsistent facial features, extra fingers, cluttered effects, unreadable text, logos, and watermarks.`,
  },
];

export async function seedStudioTemplates() {
  console.log("🖼️  Seeding image studio templates...");

  for (const [index, template] of imageTemplates.entries()) {
    // No unique key on StudioTemplate, so match on (type, title) to stay idempotent.
    const existing = await prisma.studioTemplate.findFirst({
      where: { type: "IMAGE", title: template.title },
    });

    const data = {
      category: template.category,
      prompt: template.prompt,
      previewUrl: template.previewUrl,
      aspectRatio: template.aspectRatio,
      requiresPhoto: true,
      sortOrder: index + 1,
      isActive: true,
      isDeleted: false,
    };

    if (existing) {
      await prisma.studioTemplate.update({ where: { id: existing.id }, data });
    } else {
      await prisma.studioTemplate.create({
        data: { type: "IMAGE", title: template.title, ...data },
      });
    }
  }

  console.log(`✅ Seeded ${imageTemplates.length} image studio templates`);
}
