import { prop } from "@typegoose/typegoose";

export class Package {
  @prop({ required: true })
  title!: string;

  @prop({ required: true })
  description!: string;

  @prop({ required: true, min: 0 })
  price!: number;

  @prop({ required: true, min: 1 })
  deliveryTime!: number;

  @prop({ required: true, min: 0 })
  revisions!: number;

  @prop({ type: () => [String], default: [] })
  features!: string[];
}
