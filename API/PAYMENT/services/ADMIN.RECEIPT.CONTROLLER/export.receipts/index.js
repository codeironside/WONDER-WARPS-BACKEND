import Receipt from "../../../model/index.js";
import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";

export const exportReceipts = async (req, res, next) => {
  try {
    const { start_date, end_date, format = "json" } = req.query;

    const filters = {};
    if (start_date) filters.start_date = start_date;
    if (end_date) filters.end_date = end_date;

    const { receipts } = await Receipt.findAllForAdmin({
      page: 1,
      limit: 10000,
      filters,
    });

    if (format === "csv") {
      const csvData = convertReceiptsToCSV(receipts);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=receipts-export.csv",
      );
      return res.send(csvData);
    }

    // Default JSON response
    res.status(200).json({
      success: true,
      data: receipts,
      meta: {
        total: receipts.length,
        exported_at: new Date().toISOString(),
        format: "json",
      },
    });
  } catch (error) {
    next(error);
  }
};
