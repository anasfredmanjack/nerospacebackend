import { prop, modelOptions, getModelForClass } from "@typegoose/typegoose";

@modelOptions({
  schemaOptions: {
    timestamps: true,
  },
})
export class Category {
  @prop({ required: true, unique: true })
  name!: string;

  @prop({ type: () => [String], default: [] })
  subcategories!: string[]; // NOTE:  can refactor this into its own model if needed
}

export const CategoryModel = getModelForClass(Category);
