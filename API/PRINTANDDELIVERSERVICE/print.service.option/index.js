import Joi from "joi";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
import LuluAPIService from "../../../CORE/services/luluapiservice/index.js";
import mongoose from "mongoose";

const printServiceOptionsSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 255 },
    description: { type: String, required: true },
    pod_package_id: { type: String, required: true, trim: true, maxlength: 27 },
    category: {
      type: String,
      enum: ["paperback", "hardcover", "premium", "coil_bound"],
      required: true,
    },
    trim_size: { type: String, required: true },
    color: { type: String, enum: ["bw", "fc"], required: true },
    print_quality: {
      type: String,
      enum: ["standard", "premium"],
      required: true,
    },
    binding: { type: String, required: true },
    paper_type: { type: String, required: true },
    paper_ppi: { type: String, required: true },
    cover_finish: {
      type: String,
      enum: ["matte", "gloss", "unlaminated", "none"],
      default: "none",
    },
    linen_color: {
      type: String,
      enum: [
        "navy",
        "gray",
        "red",
        "black",
        "tan",
        "forest",
        "interior",
        "none",
      ],
      default: "none",
    },
    foil_color: {
      type: String,
      enum: ["gold", "black", "white", "none"],
      default: "none",
    },
    base_price: { type: Number, required: true, min: 0, default: 0 }, // REVERTED to base_price
    is_active: { type: Boolean, default: true },
    min_pages: { type: Number, default: 2 },
    max_pages: { type: Number, default: 800 },
    estimated_production_days: { type: Number, default: 5 },
  },
  { timestamps: true },
);

printServiceOptionsSchema.index({ category: 1, is_active: 1 });
printServiceOptionsSchema.index({ pod_package_id: 1 }, { unique: true });

const validationSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  description: Joi.string().min(1).required(),
  pod_package_id: Joi.string().trim().length(27).optional(),
  category: Joi.string()
    .valid("paperback", "hardcover", "premium", "coil_bound")
    .required(),
  trim_size: Joi.string().required(),
  color: Joi.string().valid("bw", "fc").required(),
  print_quality: Joi.string().valid("standard", "premium").required(),
  binding: Joi.string().required(),
  paper_type: Joi.string().required(),
  paper_ppi: Joi.string().required(),
  cover_finish: Joi.string()
    .valid("matte", "gloss", "unlaminated", "none")
    .optional(),
  linen_color: Joi.string()
    .valid("navy", "gray", "red", "black", "tan", "forest", "interior", "none")
    .optional(),
  foil_color: Joi.string().valid("gold", "black", "white", "none").optional(),
  base_price: Joi.number().precision(2).min(0).default(0), // REVERTED to base_price
  is_active: Joi.boolean().default(true),
  min_pages: Joi.number().integer().min(2).optional(),
  max_pages: Joi.number().integer().min(10).optional(),
  estimated_production_days: Joi.number().integer().min(1).optional(),
});
class PrintServiceOptions {
  static validationSchema = validationSchema;

  static async generatePodPackageId(options) {
    const {
      trim_size_sku,
      color_sku,
      print_quality_sku,
      binding_sku,
      paper_sku,
      paper_ppi,
      finish_sku = "X",
      linen_sku = "X",
      foil_sku = "X",
    } = options;

    if (
      !trim_size_sku ||
      !color_sku ||
      !print_quality_sku ||
      !binding_sku ||
      !paper_sku ||
      !paper_ppi
    ) {
      throw new ErrorHandler(
        "Missing required options for pod_package_id generation",
        400,
      );
    }

    const podPackageId = `${trim_size_sku}${color_sku}${print_quality_sku}${binding_sku}${paper_sku}${paper_ppi}${finish_sku}${linen_sku}${foil_sku}`;

    if (podPackageId.length !== 27) {
      throw new ErrorHandler(
        `Generated pod_package_id must be 27 characters, got ${podPackageId.length}`,
        400,
      );
    }

    return podPackageId;
  }

  static getLuluOptionMappings() {
    return {
      trim_sizes: [
        {
          name: "4.25 x 6.875",
          inches: "4.25x6.875",
          sku: "0425X0687",
          book_type: "Pocketbook",
          size_type: "Small",
        },
        {
          name: "5 x 8",
          inches: "5x8",
          sku: "0500X0800",
          book_type: "Novella",
          size_type: "Small",
        },
        {
          name: "5.5 x 8.5",
          inches: "5.5x8.5",
          sku: "0550X0850",
          book_type: "Digest",
          size_type: "Small",
        },
        {
          name: "5.83 x 8.27",
          inches: "5.83x8.27",
          sku: "0583X0827",
          book_type: "A5",
          size_type: "Small",
        },
        {
          name: "6 x 9",
          inches: "6x9",
          sku: "0600X0900",
          book_type: "US Trade",
          size_type: "Small",
        },
        {
          name: "6.14 x 9.21",
          inches: "6.14x9.21",
          sku: "0614X0921",
          book_type: "Royal",
          size_type: "Medium",
        },
        {
          name: "6.63 x 10.25",
          inches: "6.63x10.25",
          sku: "0663X1025",
          book_type: "Comic",
          size_type: "Medium",
        },
        {
          name: "7.5 x 7.5",
          inches: "7.5x7.5",
          sku: "0750X0750",
          book_type: "Small Square",
          size_type: "Medium",
        },
        {
          name: "7 x 10",
          inches: "7x10",
          sku: "0700X1000",
          book_type: "Executive",
          size_type: "Medium",
        },
        {
          name: "7.44 x 9.68",
          inches: "7.44x9.68",
          sku: "0744X0968",
          book_type: "Crown Quatro",
          size_type: "Medium",
        },
        {
          name: "8.5 x 8.5",
          inches: "8.5x8.5",
          sku: "0850X0850",
          book_type: "Square",
          size_type: "Medium",
        },
        {
          name: "8.27 x 11.69",
          inches: "8.27x11.69",
          sku: "0827X1169",
          book_type: "A4",
          size_type: "Medium",
        },
        {
          name: "8.5 x 11",
          inches: "8.5x11",
          sku: "0850X1100",
          book_type: "US Letter",
          size_type: "Medium",
        },
        {
          name: "9 x 7",
          inches: "9x7",
          sku: "0900X0700",
          book_type: "Landscape",
          size_type: "Medium",
        },
        {
          name: "11 x 8.5",
          inches: "11x8.5",
          sku: "1100X0850",
          book_type: "US Letter Landscape",
          size_type: "Medium",
        },
        {
          name: "11.69 x 8.27",
          inches: "11.69x8.27",
          sku: "1169X0827",
          book_type: "A4 Landscape",
          size_type: "Medium",
        },
      ],
      color_types: [
        { name: "Black & White", sku: "BW" },
        { name: "Full Color", sku: "FC" },
      ],
      print_types: [
        { name: "Standard", sku: "STD" },
        { name: "Premium", sku: "PRE" },
      ],
      bind_types: [
        { name: "Perfect", sku: "PB" },
        { name: "Coil", sku: "CO" },
        { name: "Saddle Stitch", sku: "SS" },
        { name: "Case Wrap", sku: "CW" },
        { name: "Linen Wrap", sku: "LW" },
        { name: "Wire O", sku: "WO" },
      ],
      paper_types: [
        { name: "60# Uncoated White", sku: "060UW", ppi: "444" },
        { name: "60# Uncoated Cream", sku: "060UC", ppi: "444" },
        { name: "70# Coated White", sku: "070CW", ppi: "460" },
        { name: "80# Coated White", sku: "080CW", ppi: "444" },
        { name: "100# Coated White", sku: "100CW", ppi: "200" },
      ],
      finish_types: [
        { name: "Gloss", sku: "G" },
        { name: "Matte", sku: "M" },
        { name: "Unlaminated", sku: "U" },
        { name: "None", sku: "X" },
      ],
      linen_types: [
        { name: "Red", sku: "R" },
        { name: "Navy", sku: "N" },
        { name: "Black", sku: "B" },
        { name: "Gray", sku: "G" },
        { name: "Tan", sku: "T" },
        { name: "Forest", sku: "F" },
        { name: "Interior Cover Print", sku: "I" },
        { name: "None", sku: "X" },
      ],
      foil_types: [
        { name: "Gold", sku: "G" },
        { name: "Black", sku: "B" },
        { name: "White", sku: "W" },
        { name: "None", sku: "X" },
      ],
    };
  }

  static async createService(serviceData) {
    try {
      const { error, value: validatedData } = this.validationSchema.validate(
        serviceData,
        {
          abortEarly: false,
          stripUnknown: true,
        },
      );

      if (error) {
        throw new ErrorHandler(this.formatValidationError(error), 400);
      }

      if (!validatedData.pod_package_id) {
        const mappings = this.getLuluOptionMappings();
        const trimSize = mappings.trim_sizes.find(
          (t) => t.name === validatedData.trim_size,
        );
        const colorType = mappings.color_types.find(
          (c) => c.sku === validatedData.color.toUpperCase(),
        );
        const printType = mappings.print_types.find(
          (p) => p.name.toLowerCase() === validatedData.print_quality,
        );
        const bindType = mappings.bind_types.find(
          (b) => b.name === validatedData.binding,
        );
        const paperType = mappings.paper_types.find(
          (p) => p.name === validatedData.paper_type,
        );

        if (!trimSize || !colorType || !printType || !bindType || !paperType) {
          throw new ErrorHandler(
            "Invalid option selected for pod_package_id generation",
            400,
          );
        }

        const finishType = mappings.finish_types.find(
          (f) => f.name.toLowerCase() === validatedData.cover_finish,
        ) || { sku: "X" };
        const linenType = mappings.linen_types.find(
          (l) => l.name.toLowerCase() === validatedData.linen_color,
        ) || { sku: "X" };
        const foilType = mappings.foil_types.find(
          (f) => f.name.toLowerCase() === validatedData.foil_color,
        ) || { sku: "X" };

        const podOptions = {
          trim_size_sku: trimSize.sku,
          color_sku: colorType.sku,
          print_quality_sku: printType.sku,
          binding_sku: bindType.sku,
          paper_sku: paperType.sku,
          paper_ppi: validatedData.paper_ppi,
          finish_sku: finishType.sku,
          linen_sku: linenType.sku,
          foil_sku: foilType.sku,
        };

        validatedData.pod_package_id =
          await this.generatePodPackageId(podOptions);
      }

      try {
        const luluAPIService = new LuluAPIService();
        const validationLineItems = [
          {
            pod_package_id: validatedData.pod_package_id,
            page_count: validatedData.min_pages || 24,
            quantity: 1,
          },
        ];

        const validationShippingAddress = {
          name: "Validation Check",
          street1: "123 Main St",
          city: "New York",
          state_code: "NY",
          postcode: "10001",
          country_code: "US",
          phone_number: "+1-555-555-5555",
        };

        const availableOptions = await luluAPIService.getShippingOptions(
          validationLineItems,
          validationShippingAddress,
        );

        if (!availableOptions || availableOptions.length === 0) {
          throw new ErrorHandler(
            "No shipping options are available for this product configuration. The selected combination of size, paper, and binding may not be manufacturable or shippable.",
            400,
          );
        }
      } catch (luluError) {
        throw new ErrorHandler(
          `Lulu API Validation Failed: ${luluError.message}. This print service is likely invalid. Please check the product options.`,
          400,
        );
      }

      const service = new PrintServiceOptionsModel(validatedData);
      await service.save();

      return service.toObject();
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;

      if (error.code === 11000) {
        throw new ErrorHandler(
          "A service option with this exact product ID already exists.",
          409,
        );
      }

      throw new ErrorHandler(
        `Failed to create service option: ${error.message}`,
        500,
      );
    }
  }

  static async findAllActive(filters = {}) {
    try {
      const query = { is_active: true };

      if (filters.category) query.category = filters.category;
      if (filters.color) query.color = filters.color;
      if (filters.binding) query.binding = new RegExp(filters.binding, "i");

      const services = await PrintServiceOptionsModel.find(query)
        .sort({ base_price: 1, category: 1 })
        .lean();

      return services;
    } catch (error) {
      throw new ErrorHandler("Failed to fetch service options", 500);
    }
  }

  static async findById(serviceId) {
    try {
      const service = await PrintServiceOptionsModel.findById(serviceId).lean();

      if (!service) {
        throw new ErrorHandler("Service option not found", 404);
      }

      return service;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to fetch service option", 500);
    }
  }

  static async findByPackageId(podPackageId) {
    try {
      const service = await PrintServiceOptionsModel.findOne({
        pod_package_id: podPackageId,
      }).lean();

      if (!service) {
        throw new ErrorHandler("Service option not found", 404);
      }

      return service;
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to fetch service option", 500);
    }
  }

  static formatValidationError(error) {
    return error.details.map((detail) => detail.message).join(", ");
  }
}

const PrintServiceOptionsModel = mongoose.model(
  "PrintServiceOptions",
  printServiceOptionsSchema,
);
export default PrintServiceOptions;
