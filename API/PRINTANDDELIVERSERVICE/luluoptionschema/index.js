import mongoose from "mongoose";

const luluOptionsSchema = new mongoose.Schema(
  {
    trim_sizes: [
      {
        name: String,
        inches: String,
        sku: String,
        book_type: String,
        size_type: String,
      },
    ],
    color_types: [
      {
        name: String,
        sku: String,
      },
    ],
    print_types: [
      {
        name: String,
        sku: String,
      },
    ],
    bind_types: [
      {
        name: String,
        sku: String,
      },
    ],
    paper_types: [
      {
        name: String,
        sku: String,
        ppi_sku: String,
      },
    ],
    finish_types: [
      {
        name: String,
        sku: String,
      },
    ],
    linen_types: [
      {
        name: String,
        sku: String,
      },
    ],
    foil_types: [
      {
        name: String,
        sku: String,
      },
    ],
  },
  { timestamps: true },
);

const LuluOptions = mongoose.model("LuluOptions", luluOptionsSchema);
export default LuluOptions;
