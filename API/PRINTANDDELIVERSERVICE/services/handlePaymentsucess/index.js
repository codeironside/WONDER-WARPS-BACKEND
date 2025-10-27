import PrintOrderService from "../../model/index.js";
import { sendResponse } from "../../../../CORE/utils/response.handler/index.js";
import ErrorHandler from "../../../../CORE/middleware/errorhandler/index.js";
import { config } from "../../../../CORE/utils/config/index.js";

export const handlePaymentSuccess = async (req, res, next) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      throw new ErrorHandler("Session ID is required", 400);
    }

    const printService = new PrintOrderService();
    const result = await printService.handlePaymentSuccessCallback(session_id);

    const redirectUrl = `${config.url.frontendev}/print-order/success?order_id=${result.print_order._id}&session_id=${session_id}&processed=${result.already_processed}`;

    res.redirect(redirectUrl);
  } catch (error) {
    const redirectUrl = `${config.url.frontendev}/print-order/error?session_id=${req.query.session_id}&error=${encodeURIComponent(error.message)}`;
    res.redirect(redirectUrl);
  }
};
