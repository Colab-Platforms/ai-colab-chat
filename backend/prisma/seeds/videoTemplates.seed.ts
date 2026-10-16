import prisma from "@root/prisma.js";

type VideoTemplateSeed = {
  title: string;
  category: string;
  previewVideoUrl: string;
  aspectRatio: string;
  duration: number;
  prompt: string;
};

/**
 * Cover image for the card: Cloudinary renders a still from the clip when the
 * delivery URL ends in .jpg, so no separate thumbnail upload is needed.
 */
function posterFromVideo(videoUrl: string): string {
  return videoUrl
    .replace("/video/upload/", "/video/upload/so_0/")
    .replace(/\.[a-z0-9]+$/i, ".jpg");
}

const videoTemplates: VideoTemplateSeed[] = [
  {
    title: "Street Racing Crash Sequence",
    category: "Action",
    previewVideoUrl: "https://res.cloudinary.com/dlmcpmdpn/video/upload/v1791808416/car_rbnlvq.mp4",
    aspectRatio: "16:9",
    duration: 10,
    prompt: `Create an ultra-realistic, high-intensity Hollywood street-racing action sequence with spectacular vehicle collisions, realistic destruction and explosive cinematic effects.

SHOT 1 FULL-SPEED CHASE: Two supercars race down a nighttime city highway at extreme speed. A black muscle car aggressively overtakes a red supercar, weaving between lanes. Low-angle tracking cameras, roaring engines, spinning tires and intense background motion blur.

SHOT 2 DANGEROUS OVERTAKE: The red supercar accelerates alongside the black car. Both vehicles enter a sweeping corner at high speed. The black car loses traction, its rear tires slide sideways, and the driver struggles to regain control. Tire smoke fills the road.

SHOT 3 MASSIVE COLLISION: The black muscle car slams into the rear quarter panel of the red supercar. Show the precise moment of impact in brief cinematic slow motion. Metal bodywork crumples, side panels deform, headlights shatter and bright sparks explode outward. Both vehicles spin violently across the asphalt, leaving long black tire marks.

SHOT 4 CAR FLIPS: The black car strikes the safety barrier and launches into a dramatic sideways rollover. Its undercarriage becomes visible as the car flips through the air. Small fragments of bodywork and glass scatter realistically. The camera tracks the flipping vehicle with dynamic handheld-style energy, then returns to real-time speed as it crashes onto the road.

SHOT 5 CHAIN-REACTION CRASH: A silver sports car swerves to avoid the wreckage, clips the barrier and spins into the empty roadside lane. One damaged vehicle slides into the barrier, producing a huge shower of sparks, followed by a dramatic fireball and thick billowing smoke in the background. The blast throws lightweight debris outward without showing injuries.

SHOT 6 FINAL DESTRUCTION SHOT: The camera races low across the highway through smoke and scattered debris, revealing the wrecked black and red cars resting on the road. Flames flicker in the background, headlights flash through the smoke, sparks occasionally fall from damaged metal, and the soundless visual ends with a slow cinematic camera orbit around the wreckage.

CINEMATOGRAPHY: Hollywood blockbuster action direction, explosive practical-effects aesthetic, aggressive low-angle tracking, road-level camera rigs, aerial drone shots, brief impact slow motion, fast cuts between distinct shots, dramatic speed ramping, realistic vehicle weight and momentum, physically believable collisions, detailed crumpling metal, flying glass, sparks, smoke simulation, volumetric fire and cinematic lighting.

COLOR GRADING: Deep midnight blue, metallic silver, black paint, intense amber firelight and realistic urban reflections.

QUALITY: Photorealistic 4K, 24fps cinematic footage, premium blockbuster production value, realistic motion blur, consistent car designs and colors in every shot.

IMPORTANT: Keep the crash spectacular but physically coherent. No vehicle morphing, no teleporting cars, no impossible motion, no duplicated vehicles, no visible human injuries, no blood, no text, no logos, no watermark. All action occurs on a closed fictional movie-racing set`,
  },
  {
    title: "Supernatural Horror Monster",
    category: "Horror",
    previewVideoUrl:
      "https://res.cloudinary.com/dlmcpmdpn/video/upload/v1791808414/watermark-removed-Supernatural_horror_monster_sequ__1080p_20261012130403_szwyf8.mp4",
    aspectRatio: "16:9",
    duration: 10,
    prompt: `Create an extremely terrifying, photorealistic Hollywood supernatural horror sequence with the atmosphere of a dark alternate dimension, mysterious creatures and large-scale cinematic dread.

SHOT 1 THE DEAD TOWN: Begin with a slow aerial drone shot moving above an abandoned American town at midnight. The streets are empty, streetlights flicker, black vines cover abandoned houses, and thick fog rolls between the buildings. The sky glows an unnatural dark crimson. Tiny particles drift through the air.

SHOT 2 SOMETHING IS MOVING: The camera descends toward an empty street. Deep beneath the cracked asphalt, enormous organic roots begin to move slowly. Streetlights flicker one by one and suddenly go out. In the far distance, a gigantic shadow passes behind the houses, much taller than the rooftops.

SHOT 3 THE FIRST REVEAL: A powerful gust of wind pushes the fog toward the camera. A gigantic humanoid creature slowly emerges from the darkness. First reveal its enormous legs, then its elongated arms, then its terrifying silhouette. Its body moves with disturbing, unnatural precision. Black tendrils writhe across its skin while its flower-like head slowly unfolds.

SHOT 4 THE MONSTER APPROACHES: The creature begins walking toward the camera. Every footstep shakes loose dust from nearby buildings. Dead branches snap, windows vibrate, and thick black roots spread rapidly across the road. The camera retreats slowly at ground level as the creature grows larger in frame.

SHOT 5 HORRIFYING CLOSE-UP: Cut to an extreme close-up of the monster's face. Its organic head opens wider, revealing multiple rows of razor-sharp teeth. Wet-looking tendrils twitch, its jaw expands unnaturally, and a deep red light pulses inside its throat. Its head suddenly snaps toward the camera with frightening speed.

SHOT 6 NIGHTMARE ERUPTION: The creature releases a terrifying silent roar as red lightning illuminates the entire town. A wave of black tendrils erupts from the ground, wrapping around abandoned vehicles and telephone poles. The camera rapidly pulls upward into a wide aerial shot, revealing the enormous creature standing in the middle of the town beneath the blood-red sky.

SHOT 7 FINAL HORROR FRAME: The camera stops above the street. The monster slowly looks directly upward toward the camera. Every light in the town switches off simultaneously. Complete darkness for one brief moment, followed by a single flash of red lightning revealing the creature's enormous face filling the frame.

VISUAL STYLE: Premium Hollywood supernatural horror, terrifying creature design, practical-effects realism combined with high-end VFX, photorealistic organic textures, volumetric fog, floating particles, twisted roots, dramatic crimson lightning, deep shadows, atmospheric perspective, slow dread-building camera movements followed by sudden frightening action, cinematic 4K, 24fps, widescreen 16:9.

Maintain the exact same creature design, anatomy, proportions and environment throughout every shot. No cartoon appearance, no cute monster, no comedy, no excessive gore, no text, no logos, no watermark. Original creature design rather than an exact copy of any existing series character.`,
  },
  {
    title: "Coastal Cycling Drone Shot",
    category: "Travel",
    previewVideoUrl: "https://res.cloudinary.com/dlmcpmdpn/video/upload/v1791808414/drone_tic0e4.mp4",
    aspectRatio: "16:9",
    duration: 10,
    prompt: `Create a breathtaking ultra-realistic cinematic drone video of a young woman riding a bicycle along a beautiful coastal mountain road. Start with a high-angle aerial drone shot showing the woman cycling along the winding road, with the vast blue sea and gentle ocean waves on one side and magnificent lush green mountains on the other. The drone smoothly tracks her movement from behind, then gradually ascends and pulls backward to reveal the spectacular coastline, curving road, mountains and endless ocean. Transition into a wide panoramic bird's-eye view, making the cyclist appear small against the enormous natural landscape. Smooth professional drone movements, realistic bicycle motion, gentle sea breeze moving her hair and dress, sunlight sparkling on the water, cinematic golden-hour lighting, natural motion blur, realistic shadows, premium travel-film aesthetic, 4K, 24fps, 16:9 widescreen. One continuous smooth drone sequence, no sudden camera movements, no zoom effects, no cuts, no text, no logos, no additional people or vehicles.`,
  },
  {
    title: "Warehouse Martial Arts Fight",
    category: "Action",
    previewVideoUrl:
      "https://res.cloudinary.com/dlmcpmdpn/video/upload/v1791808423/hf_20261012_074442_d1f8b758-f8db-45ad-8e1a-d3a5574d11e2_1_xxzzqa.mp4",
    aspectRatio: "16:9",
    duration: 10,
    prompt: `Generate a cinematic Hollywood action sequence featuring two adult male stunt performers in an abandoned industrial warehouse.

The hero and opponent engage in a fast choreographed martial arts fight. The opponent throws a punch, the hero dodges and counters with a quick combination. The opponent blocks and responds with a spinning kick. The hero ducks, jumps sideways and performs an impressive flying kick. Both fighters move rapidly across the warehouse with realistic footwork, defensive blocks, acrobatic movements and perfectly timed stunt reactions.

The opponent rushes forward, and the hero redirects his momentum, sending him safely onto a stack of breakaway wooden crates. The crates collapse dramatically, creating a cloud of dust and flying splinters. The opponent gets back up and launches another attack. The hero dodges, performs a controlled sweeping takedown, and finishes in a confident action-hero pose.

Camera direction: fast side-tracking shots, low-angle full-body shots, dynamic handheld camera movement, brief slow-motion stunt moments and rapid cinematic cuts.

Visual style: premium Hollywood action blockbuster, realistic stunt choreography, dramatic warehouse lighting, blue shadows, orange sparks, volumetric smoke, detailed environments, physically believable movement, photorealistic 4K, 24fps, widescreen 16:9.

Maintain the same two characters, faces and clothing throughout. Fictional staged movie action. No blood, no injuries, no graphic violence, no weapons, no text, no logos, no character morphing. Keep the action exciting, fast and cinematic.`,
  },
];

export async function seedVideoTemplates() {
  console.log("🎬 Seeding video studio templates...");

  for (const [index, template] of videoTemplates.entries()) {
    // No unique key on StudioTemplate, so match on (type, title) to stay idempotent.
    const existing = await prisma.studioTemplate.findFirst({
      where: { type: "VIDEO", title: template.title },
    });

    const data = {
      category: template.category,
      prompt: template.prompt,
      previewUrl: posterFromVideo(template.previewVideoUrl),
      previewVideoUrl: template.previewVideoUrl,
      aspectRatio: template.aspectRatio,
      duration: template.duration,
      requiresPhoto: false,
      sortOrder: index + 1,
      isActive: true,
      isDeleted: false,
    };

    if (existing) {
      await prisma.studioTemplate.update({ where: { id: existing.id }, data });
    } else {
      await prisma.studioTemplate.create({
        data: { type: "VIDEO", title: template.title, ...data },
      });
    }
  }

  console.log(`✅ Seeded ${videoTemplates.length} video studio templates`);
}
