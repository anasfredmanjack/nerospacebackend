import { CategoryModel } from "@/models/gigs/Category";
import { Gig, GigModel } from "@/models/gigs/Gig";
import { TagModel } from "@/models/gigs/Tag";
import { BidModel } from "@/models/gigs/Bid";
import { Types } from "mongoose";

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

  async createBid(
    gigId: string,
    amount: number,
    message: string,
    userAddress: string
  ) {
    try {
      const bid = await BidModel.create({
        amount,
        message,
        userAddress,
        gig: gigId,
      });
      // Add bid to gig's bids array
      await GigModel.findByIdAndUpdate(gigId, { $push: { bids: bid._id } });
      return bid;
    } catch (error) {
      throw new Error("Failed to create bid: " + error);
    }
  }
}
