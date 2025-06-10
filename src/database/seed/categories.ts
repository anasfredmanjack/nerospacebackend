import { CategoryModel } from "@/models/gigs/Category";

const categories = [
  {
    name: "Programming & Tech",
    subcategories: [
      "Web Development",
      "Mobile Development",
      "Desktop Software",
      "Game Development",
      "Database Design",
      "DevOps & Cloud",
      "QA & Testing",
      "Blockchain & Cryptocurrency",
    ],
  },
  {
    name: "Digital Marketing",
    subcategories: [
      "Social Media Marketing",
      "Search Engine Optimization",
      "Content Marketing",
      "Email Marketing",
      "Marketing Strategy",
      "Video Marketing",
      "Web Analytics",
    ],
  },
  {
    name: "Graphics & Design",
    subcategories: [
      "Logo Design",
      "Brand Style Guides",
      "Web & Mobile Design",
      "Social Media Design",
      "Print Design",
      "Packaging & Labels",
      "Illustration",
    ],
  },
  {
    name: "Video & Animation",
    subcategories: [
      "Video Editing",
      "Video Production",
      "Animation",
      "Visual Effects",
      "Motion Graphics",
      "3D Animation",
      "Whiteboard & Animated Videos",
    ],
  },
  {
    name: "Writing & Translation",
    subcategories: [
      "Content Writing",
      "Copywriting",
      "Technical Writing",
      "Translation",
      "Creative Writing",
      "Business Writing",
      "Academic Writing",
    ],
  },
  {
    name: "Music & Audio",
    subcategories: [
      "Voice Over",
      "Music Production",
      "Mixing & Mastering",
      "Sound Effects",
      "Podcast Production",
      "Audio Editing",
      "Music Composition",
    ],
  },
];

export async function seedCategories() {
  try {
    // Clear existing categories
    await CategoryModel.deleteMany({});

    // Insert new categories
    const result = await CategoryModel.insertMany(categories);
    console.log(`✅ Successfully seeded ${result.length} categories`);
    return result;
  } catch (error) {
    console.error("❌ Error seeding categories:", error);
    throw error;
  }
}
