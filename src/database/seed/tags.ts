import { TagModel } from "@/models/gigs/Tag";

const tags = [
  // Programming & Tech
  "web-development",
  "mobile-development",
  "desktop-software",
  "game-development",
  "database-design",
  "devops",
  "cloud-computing",
  "qa-testing",
  "blockchain",
  "cryptocurrency",
  "react",
  "nodejs",
  "python",
  "java",
  "javascript",
  "typescript",
  "php",
  "ruby",
  "swift",
  "kotlin",
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",

  // Digital Marketing
  "social-media-marketing",
  "seo",
  "content-marketing",
  "email-marketing",
  "marketing-strategy",
  "video-marketing",
  "web-analytics",
  "ppc",
  "sem",
  "affiliate-marketing",
  "influencer-marketing",
  "branding",
  "market-research",

  // Graphics & Design
  "logo-design",
  "brand-identity",
  "ui-design",
  "ux-design",
  "web-design",
  "mobile-design",
  "print-design",
  "packaging-design",
  "illustration",
  "icon-design",
  "typography",
  "infographic",
  "social-media-graphics",
  "presentation-design",

  // Video & Animation
  "video-editing",
  "video-production",
  "animation",
  "motion-graphics",
  "3d-animation",
  "whiteboard-animation",
  "visual-effects",
  "character-animation",
  "explainer-videos",
  "commercial-videos",
  "product-videos",
  "youtube-videos",

  // Writing & Translation
  "content-writing",
  "copywriting",
  "technical-writing",
  "translation",
  "creative-writing",
  "business-writing",
  "academic-writing",
  "blog-writing",
  "article-writing",
  "proofreading",
  "editing",
  "ghostwriting",
  "scriptwriting",

  // Music & Audio
  "voice-over",
  "music-production",
  "mixing",
  "mastering",
  "sound-effects",
  "podcast-production",
  "audio-editing",
  "music-composition",
  "jingle-production",
  "audio-book-narration",
  "audio-post-production",
  "sound-design",
];

export async function seedTags() {
  try {
    // Clear existing tags
    await TagModel.deleteMany({});

    // Insert new tags
    const tagDocuments = tags.map((name) => ({ name }));
    const result = await TagModel.insertMany(tagDocuments);
    console.log(`✅ Successfully seeded ${result.length} tags`);
    return result;
  } catch (error) {
    console.error("❌ Error seeding tags:", error);
    throw error;
  }
}
