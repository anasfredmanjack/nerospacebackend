import {
  Ref,
  prop,
  modelOptions,
  getModelForClass,
} from "@typegoose/typegoose";
import { Category } from "./Category";
import { Tag } from "./Tag";
import { Package } from "./Package";

@modelOptions({
  schemaOptions: {
    timestamps: true,
  },
})
export class Gig {
  @prop({ required: true, minlength: 10, maxlength: 120 })
  title!: string;

  @prop({ ref: () => Category, required: false, default: null })
  category?: Ref<Category> | null;

  @prop({ required: true, minlength: 120 })
  description!: string;

  @prop({ ref: () => Tag, type: () => [Tag], default: [] })
  tags!: Ref<Tag>[];

  @prop({ type: () => [Package], _id: false })
  packages!: Package[];

  @prop()
  thumbnailUrl?: string;

  @prop({ default: false })
  isPublished!: boolean;

  @prop({ default: false })
  hasGallery!: boolean;

  // @prop({ required: true })
  // creatorId!: string; // Ref to User NOTE: Temp commented out for testing purposes. Will be added later
}

export const GigModel = getModelForClass(Gig);
