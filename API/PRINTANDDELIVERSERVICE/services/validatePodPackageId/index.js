import PrintServiceOptions from "../../print.service.option/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
export const validatePodPackageId = async (req, res, next) => {
  try {
    const {
      trim_size,
      color,
      print_quality,
      binding,
      paper_type,
      paper_ppi,
      cover_finish = "none",
      linen_color = "none",
      foil_color = "none",
    } = req.body;

    if (
      !trim_size ||
      !color ||
      !print_quality ||
      !binding ||
      !paper_type ||
      !paper_ppi
    ) {
      throw new ErrorHandler(
        "Missing required options for pod_package_id validation",
        400,
      );
    }

    const mappings = PrintServiceOptions.getLuluOptionMappings();

    const trimSize = mappings.trim_sizes.find((t) => t.name === trim_size);
    const colorType = mappings.color_types.find(
      (c) => c.sku === color.toUpperCase(),
    );
    const printType = mappings.print_types.find(
      (p) => p.name.toLowerCase() === print_quality,
    );
    const bindType = mappings.bind_types.find((b) => b.name === binding);
    const paperType = mappings.paper_types.find((p) => p.name === paper_type);

    if (!trimSize) {
      throw new ErrorHandler(`Invalid trim size: ${trim_size}`, 400);
    }
    if (!colorType) {
      throw new ErrorHandler(`Invalid color: ${color}`, 400);
    }
    if (!printType) {
      throw new ErrorHandler(`Invalid print quality: ${print_quality}`, 400);
    }
    if (!bindType) {
      throw new ErrorHandler(`Invalid binding: ${binding}`, 400);
    }
    if (!paperType) {
      throw new ErrorHandler(`Invalid paper type: ${paper_type}`, 400);
    }

    const finishType = mappings.finish_types.find(
      (f) => f.name.toLowerCase() === cover_finish,
    ) || { sku: "X" };
    const linenType = mappings.linen_types.find(
      (l) => l.name.toLowerCase() === linen_color,
    ) || { sku: "X" };
    const foilType = mappings.foil_types.find(
      (f) => f.name.toLowerCase() === foil_color,
    ) || { sku: "X" };

    const podOptions = {
      trim_size_sku: trimSize.sku,
      color_sku: colorType.sku,
      print_quality_sku: printType.sku,
      binding_sku: bindType.sku,
      paper_sku: paperType.sku,
      paper_ppi: paper_ppi,
      finish_sku: finishType.sku,
      linen_sku: linenType.sku,
      foil_sku: foilType.sku,
    };

    const pod_package_id =
      await PrintServiceOptions.generatePodPackageId(podOptions);

    sendResponse(res, 200, "Pod package ID validated successfully", {
      pod_package_id,
      components: {
        trim_size: trimSize,
        color: colorType,
        print_quality: printType,
        binding: bindType,
        paper: paperType,
        finish: finishType,
        linen: linenType,
        foil: foilType,
      },
      description: generateDescription({
        trim_size: trimSize,
        color: colorType,
        print_quality: printType,
        binding: bindType,
        paper: paperType,
        finish: finishType,
        linen: linenType,
        foil: foilType,
      }),
    });
  } catch (error) {
    next(error);
  }
};

function calculateTotalCombinations(mappings) {
  return (
    mappings.trim_sizes.length *
    mappings.color_types.length *
    mappings.print_types.length *
    mappings.bind_types.length *
    mappings.paper_types.length *
    mappings.finish_types.length *
    mappings.linen_types.length *
    mappings.foil_types.length
  );
}

function generateDescription(components) {
  const {
    trim_size,
    color,
    print_quality,
    binding,
    paper,
    finish,
    linen,
    foil,
  } = components;

  let description = `${trim_size.inches} ${color.name} ${print_quality.name} ${binding.name} book`;

  if (paper) {
    description += ` printed on ${paper.name}`;
  }

  if (finish.sku !== "X") {
    description += ` with ${finish.name.toLowerCase()} cover`;
  }

  if (linen.sku !== "X" && linen.sku !== "I") {
    description += ` and ${linen.name.toLowerCase()} linen cover`;
  } else if (linen.sku === "I") {
    description += ` and interior cover print`;
  }

  if (foil.sku !== "X") {
    description += ` with ${foil.name.toLowerCase()} foil stamping`;
  }

  return description;
}
