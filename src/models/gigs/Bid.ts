import {
  prop,
  modelOptions,
  Ref,
  getModelForClass,
} from "@typegoose/typegoose";
import { Gig } from "./Gig";

@modelOptions({
  schemaOptions: {
    timestamps: true,
  },
})
export class Bid {
  @prop({ required: true, min: 0 })
  amount!: number;

  @prop({ required: true, minlength: 1, maxlength: 500 })
  message!: string;

  @prop({ required: true })
  userAddress!: string; // Reference to user by address

  @prop({ ref: () => Gig, required: true })
  gig!: Ref<Gig>;
}

export const BidModel = getModelForClass(Bid);
