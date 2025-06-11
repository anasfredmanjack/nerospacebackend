import { CategoryModel } from "@/models/gigs/Category";
import { Gig, GigModel } from "@/models/gigs/Gig";
import { TagModel } from "@/models/gigs/Tag";

export class NeroGigsService {
  async create(gig: Gig) {
    return await GigModel.create(gig);
  }

  async findOne(id: string) {
    // return await GigModel.findById(id);
    console.log("findOne", id);
  }

  async findAll() {
    return await GigModel.find();
  }

  async findGigByCategory(category: string) {
    return await GigModel.find({ category });
  }

  async findAllGigCategories() {
    console.log("findAllGigCategories");
    const categories = await CategoryModel.find();
    console.log("categories", categories);
    return categories;
  }

  async findGigBySubcategory(subcategory: string) {
    return await GigModel.find({ subcategory });
  }

  async findAllGigTags() {
    return await TagModel.find();
  }

  async findGigByTag(tag: string) {
    return await GigModel.find({ tags: tag });
  }
}
