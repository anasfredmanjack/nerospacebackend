import { prop, modelOptions, getModelForClass } from "@typegoose/typegoose";

@modelOptions({
  schemaOptions: {
    timestamps: true,
  },
})
export class Tag {
  @prop({ required: true, unique: true, trim: true, lowercase: true })
  name!: string;
}

export const TagModel = getModelForClass(Tag);
