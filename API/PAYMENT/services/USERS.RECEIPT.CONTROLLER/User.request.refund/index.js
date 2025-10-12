export const requestRefund = async (req, res, next) => {
  try {
    const { receiptId } = req.params;
    const { reason = "requested_by_customer" } = req.body;
    const userId = req.user._id;

    if (!receiptId) {
      throw new ErrorHandler("Receipt ID is required", 400);
    }

    // Verify the receipt belongs to the user
    const receipt = await Receipt.findOneForUser(receiptId, userId);
    if (!receipt) {
      throw new ErrorHandler("Receipt not found", 404);
    }

    if (receipt.refunded) {
      throw new ErrorHandler("This payment has already been refunded", 400);
    }

    // Check if refund is within allowed timeframe (e.g., 30 days)
    const refundDeadline = new Date(receipt.paid_at);
    refundDeadline.setDate(refundDeadline.getDate() + 30);

    if (new Date() > refundDeadline) {
      throw new ErrorHandler("Refund period has expired (30 days)", 400);
    }

    const result = await Receipt.processRefund(receiptId, null, reason);

    res.status(200).json({
      success: true,
      message: "Refund requested successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
