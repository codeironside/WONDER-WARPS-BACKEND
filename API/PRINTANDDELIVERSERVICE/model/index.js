import PrintOrder from "../print.order.model/index.js";
import PrintOrderPayment from "../print.order.payment.model/index.js";
import PersonalizedBook from "../../PERSONALISATION/model/index.js";
import LuluAPIService from "../../../CORE/services/luluapiservice/index.js";
import PrintServiceOptions from "../print.service.option/index.js";
import ErrorHandler from "../../../CORE/middleware/errorhandler/index.js";
import logger from "../../../CORE/utils/logger/index.js";
import { config } from "../../../CORE/utils/config/index.js";
import S3Service from "../../../CORE/services/s3/index.js";
import stripeService from "../../../CORE/services/stripe/index.js";
class PrintOrderService {
  constructor() {
    this.luluService = new LuluAPIService();
  }

  async createPrintOrderWithCost(userId, orderData) {
    try {
      const {
        personalized_book_id,
        service_option_id,
        quantity,
        shipping_address,
        shipping_level,
        contact_email,
      } = orderData;

      const book = await PersonalizedBook.findById(personalized_book_id);
      if (!book || book.user_id.toString() !== userId.toString()) {
        throw new ErrorHandler("Personalized book not found", 404);
      }

      if (!book.is_paid) {
        throw new ErrorHandler(
          "Book must be paid for before ordering physical copy",
          403,
        );
      }

      const serviceOption =
        await PrintServiceOptions.findById(service_option_id);
      if (!serviceOption) {
        throw new ErrorHandler("Invalid print service option", 400);
      }

      const pageCount = await this.calculateBookPageCount(book);

      if (
        pageCount < serviceOption.min_pages ||
        pageCount > serviceOption.max_pages
      ) {
        throw new ErrorHandler(
          `Page count (${pageCount}) is outside the allowed range for this service (${serviceOption.min_pages}-${serviceOption.max_pages} pages)`,
          400,
        );
      }

      const costCalculation = await this.calculatePrintCosts(
        serviceOption.pod_package_id,
        pageCount,
        quantity,
        shipping_address,
        shipping_level,
      );

      const printOrder = await PrintOrder.createOrder(userId, {
        personalized_book_id,
        service_option_id,
        quantity,
        shipping_address,
        shipping_level,
        contact_email,
        external_id: orderData.external_id,
        production_delay: orderData.production_delay,
      });

      await PrintOrder.updateCostBreakdown(printOrder._id, costCalculation);

      logger.info("Print order created with cost calculation", {
        printOrderId: printOrder._id,
        totalCost: costCalculation.total_cost_incl_tax,
        userId,
        calculatedPageCount: pageCount,
      });

      return {
        print_order: printOrder,
        cost_breakdown: costCalculation,
        service_option: serviceOption,
        book: {
          title: book.personalized_content?.book_title,
          child_name: book.child_name,
          page_count: pageCount,
          calculated_structure: this.getPageBreakdown(book),
        },
      };
    } catch (error) {
      logger.error("Failed to create print order with cost", {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  calculateBookPageCount(book) {
    try {
      let pageCount = 0;

      pageCount += 1;
      if (
        book.dedication_message &&
        book.dedication_message.trim() !== "" &&
        book.dedication_message !== " Dedication message"
      ) {
        pageCount += 1;
      }
      const chapters = book.personalized_content?.chapters || [];
      chapters.forEach((chapter) => {
        pageCount += 2;
        if (chapter.image_position === "full scene") {
          pageCount += 1;
        }
      });

      pageCount += 1;

      logger.debug("Page count calculation completed", {
        bookId: book._id,
        totalPages: pageCount,
        chaptersCount: chapters.length,
        hasDedication: !!(
          book.dedication_message &&
          book.dedication_message.trim() !== "" &&
          book.dedication_message !== " Dedication message"
        ),
        fullSceneChapters: chapters.filter(
          (ch) => ch.image_position === "full scene",
        ).length,
      });

      return pageCount;
    } catch (error) {
      logger.error("Failed to calculate book page count", {
        bookId: book?._id,
        error: error.message,
      });
      return (
        book.personalized_content?.page_count ||
        book.personalized_content?.chapters?.length * 2 + 3 ||
        10
      );
    }
  }

  getPageBreakdown(book) {
    const chapters = book.personalized_content?.chapters || [];
    const fullSceneChapters = chapters.filter(
      (ch) => ch.image_position === "full scene",
    );

    return {
      title_page: 1,
      dedication_page:
        book.dedication_message &&
        book.dedication_message.trim() !== "" &&
        book.dedication_message !== " Dedication message"
          ? 1
          : 0,
      chapters: {
        total: chapters.length,
        base_pages: chapters.length * 2, // Title + content for each chapter
        full_scene_pages: fullSceneChapters.length,
        other_image_positions: chapters.length - fullSceneChapters.length,
      },
      end_page: 1,
      calculated_total: this.calculateBookPageCount(book),
      image_positions_breakdown: {
        full_scene: fullSceneChapters.length,
        comic_strips: chapters.filter(
          (ch) => ch.image_position === "comic strips",
        ).length,
        split_screens: chapters.filter(
          (ch) => ch.image_position === "split screens",
        ).length,
        side_bar: chapters.filter((ch) => ch.image_position === "side bar")
          .length,
        footer_illustration: chapters.filter(
          (ch) => ch.image_position === "footer illustration",
        ).length,
        header_banner: chapters.filter(
          (ch) => ch.image_position === "header banner",
        ).length,
      },
    };
  }

  async createPrintOrderCheckout(printOrderId, userId) {
    try {
      const printOrder = await PrintOrder.findByIdForUser(printOrderId, userId);

      if (printOrder.payment_status === "paid") {
        throw new ErrorHandler("Print order already paid for", 400);
      }

      console.log(printOrder.personalized_book_id._id.toString());
      const book = await PersonalizedBook.findById(
        printOrder.personalized_book_id,
      );
      const serviceOption = await PrintServiceOptions.findById(
        printOrder.service_option_id,
      );
      const totalAmount = printOrder.cost_breakdown.total_cost_incl_tax;
      const bookTitle =
        book.personalized_content?.book_title || "Personalized Book";
      const childName = book.child_name;

      const metadata = {
        service: "print_on_demand",
        print_order_id: printOrderId.toString(),
        personalized_book_id: printOrder.personalized_book_id._id.toString(),
        user_id: userId,
        service_option_id: printOrder.service_option_id.toString(),
        pod_package_id: serviceOption.pod_package_id,
        quantity: printOrder.quantity.toString(),
        shipping_level: printOrder.shipping_level,
      };

      const customerData = {
        email: printOrder.contact_email,
        name: printOrder.shipping_address.name,
      };

      const checkoutSession = await stripeService.createCheckoutSession(
        totalAmount,
        metadata,
        customerData,
        config.lulu.successUrl,
        config.lulu.cancelUrl,
      );
      const paymentRecord = await PrintOrderPayment.createPendingPayment({
        user_id: userId,
        print_order_id: printOrderId,
        personalized_book_id: printOrder.personalized_book_id._id.toString(),
        checkout_session_id: checkoutSession.id,
        amount: totalAmount,
        currency: "usd",
        status: "pending",
      });

      logger.info("Print order checkout session created", {
        printOrderId,
        checkoutSessionId: checkoutSession.id,
        amount: totalAmount,
      });

      return {
        checkout_url: checkoutSession.url,
        checkout_session_id: checkoutSession.id,
        amount: totalAmount,
        currency: "usd",
        print_order: printOrder,
      };
    } catch (error) {
      logger.error("Failed to create print order checkout session", {
        printOrderId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }
  async handlePaymentSuccessCallback(checkoutSessionId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const checkoutSession =
        await stripeService.getCheckoutSession(checkoutSessionId);

      if (!checkoutSession) {
        throw new ErrorHandler("Checkout session not found", 404);
      }

      if (checkoutSession.payment_status !== "paid") {
        throw new ErrorHandler(
          `Payment not completed: ${checkoutSession.payment_status}`,
          400,
        );
      }
      const paymentRecord =
        await PrintOrderPayment.findByCheckoutSession(checkoutSessionId);
      if (!paymentRecord) {
        throw new ErrorHandler("Payment record not found", 404);
      }
      if (paymentRecord.callback_processed) {
        logger.info("Payment already processed via callback", {
          checkoutSessionId,
          printOrderId: paymentRecord.print_order_id,
        });

        const printOrder = await PrintOrder.findById(
          paymentRecord.print_order_id,
        );
        return {
          print_order: printOrder,
          payment: paymentRecord,
          already_processed: true,
        };
      }

      const paymentIntentId = checkoutSession.payment_intent?.id;
      const receiptUrl = checkoutSession.payment_intent?.receipt_url;

      const confirmedPayment = await PrintOrderPayment.confirmPayment(
        checkoutSessionId,
        {
          payment_intent_id: paymentIntentId,
          payment_method: checkoutSession.payment_method_types?.[0],
          receipt_url: receiptUrl,
          metadata: checkoutSession.metadata,
        },
      );

      const printOrder = await PrintOrder.updatePaymentInfo(
        paymentRecord.print_order_id,
        confirmedPayment._id,
        paymentRecord.amount,
      );

      const submissionResult = await this.submitPrintJobToLulu(
        paymentRecord.print_order_id,
      );

      await session.commitTransaction();
      session.endSession();

      logger.info(
        "Print order payment processed via callback and job submitted",
        {
          printOrderId: paymentRecord.print_order_id,
          checkoutSessionId,
          luluJobId: submissionResult.luluPrintJob.id,
        },
      );

      return {
        print_order: printOrder,
        payment: confirmedPayment,
        lulu_print_job: submissionResult.luluPrintJob,
        already_processed: false,
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      logger.error("Failed to handle payment success callback", {
        checkoutSessionId,
        error: error.message,
      });
      throw error;
    }
  }

  async handlePaymentCancelCallback(checkoutSessionId) {
    try {
      const paymentRecord =
        await PrintOrderPayment.findByCheckoutSession(checkoutSessionId);

      if (!paymentRecord) {
        throw new ErrorHandler("Payment record not found", 404);
      }

      await PrintOrderPayment.markAsFailed(checkoutSessionId);

      const printOrder = await PrintOrder.findById(
        paymentRecord.print_order_id,
      );

      logger.info("Payment cancelled by user", {
        checkoutSessionId,
        printOrderId: paymentRecord.print_order_id,
      });

      return {
        print_order: printOrder,
        payment:
          await PrintOrderPayment.findByCheckoutSession(checkoutSessionId),
        cancelled: true,
      };
    } catch (error) {
      logger.error("Failed to handle payment cancel callback", {
        checkoutSessionId,
        error: error.message,
      });
      throw error;
    }
  }

  async checkPaymentStatus(checkoutSessionId, userId) {
    try {
      const checkoutSession =
        await stripeService.getCheckoutSession(checkoutSessionId);

      if (!checkoutSession) {
        throw new ErrorHandler("Checkout session not found", 404);
      }

      const paymentRecord =
        await PrintOrderPayment.findByCheckoutSession(checkoutSessionId);
      if (!paymentRecord) {
        throw new ErrorHandler("Payment record not found", 404);
      }

      if (paymentRecord.user_id !== userId) {
        throw new ErrorHandler("Access denied", 403);
      }

      if (
        checkoutSession.payment_status === "paid" &&
        !paymentRecord.callback_processed
      ) {
        return await this.handlePaymentSuccessCallback(checkoutSessionId);
      }
      const printOrder = await PrintOrder.findById(
        paymentRecord.print_order_id,
      );

      return {
        print_order: printOrder,
        payment: paymentRecord,
        stripe_status: checkoutSession.payment_status,
        processed: paymentRecord.callback_processed,
      };
    } catch (error) {
      logger.error("Failed to check payment status", {
        checkoutSessionId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  async submitPrintJobToLulu(printOrderId) {
    try {
      const printOrder = await PrintOrder.findById(printOrderId);
      if (!printOrder) {
        throw new ErrorHandler("Print order not found", 404);
      }

      if (
        printOrder.status !== "created" &&
        printOrder.payment_status !== "paid"
      ) {
        throw new ErrorHandler(
          "Print order must be paid before submission",
          402,
        );
      }

      const serviceOption = await PrintServiceOptions.findById(
        printOrder.service_option_id,
      );
      const book = await PersonalizedBook.findById(
        printOrder.personalized_book_id,
      );
      const pageCount = this.calculateBookPageCount(book);

      const { interiorFileUrl, coverFileUrl } =
        await this.generatePrintFiles(book);

      await this.validateFilesWithLulu(
        interiorFileUrl,
        coverFileUrl,
        serviceOption.pod_package_id,
        pageCount,
      );

      const luluPrintJobPayload = {
        contact_email: printOrder.contact_email,
        external_id: printOrder._id.toString(),
        shipping_level: this.mapToLuluShippingOption(printOrder.shipping_level),
        shipping_address: {
          name: printOrder.shipping_address.name,
          street1: printOrder.shipping_address.street1,
          street2: printOrder.shipping_address.street2,
          city: printOrder.shipping_address.city,
          state_code: printOrder.shipping_address.state_code,
          country_code: printOrder.shipping_address.country_code,
          postcode: printOrder.shipping_address.postcode,
          phone_number: printOrder.shipping_address.phone_number,
        },
        line_items: [
          {
            title: book.personalized_content?.book_title || "Personalized Book",
            external_id: `item-${printOrder.personalized_book_id}`,
            quantity: printOrder.quantity,
            printable_normalization: {
              pod_package_id: serviceOption.pod_package_id,
              interior: { source_url: interiorFileUrl },
              cover: { source_url: coverFileUrl },
            },
          },
        ],
      };

      const luluPrintJob =
        await this.luluService.createPrintJob(luluPrintJobPayload);

      await PrintOrder.updateLuluJobId(printOrderId, luluPrintJob.id);
      await PrintOrder.updateStatus(printOrderId, "in_production");

      logger.info("Print job submitted to Lulu successfully", {
        printOrderId,
        luluJobId: luluPrintJob.id,
      });

      return this._formatLuluResponse(luluPrintJob, printOrder);
    } catch (error) {
      logger.error("Failed to submit print job to Lulu", {
        printOrderId,
        error: error.message,
      });

      await PrintOrder.updateStatus(printOrderId, "error");
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to submit print job", 500);
    }
  }

  _formatLuluResponse(luluPrintJob, printOrder) {
    const serviceFee = printOrder.service_option_id.platform_fee || 0;
    const totalCost = parseFloat(luluPrintJob.costs?.total_cost_incl_tax || 0);

    return {
      lulu_order_id: luluPrintJob.id,
      status: luluPrintJob.status.name,
      message: luluPrintJob.status.message,
      created_at: luluPrintJob.date_created,
      shipping_address: luluPrintJob.shipping_address,
      shipping_level: luluPrintJob.shipping_level,
      estimated_shipping_dates: luluPrintJob.estimated_shipping_dates,
      line_items: luluPrintJob.line_items.map((item) => ({
        item_id: item.id,
        title: item.title,
        quantity: item.quantity,
        status: item.status.name,
        message: item.status.messages?.info,
      })),
      costs: {
        ...luluPrintJob.costs,
        platform_fee: serviceFee.toFixed(2),
        final_total: (totalCost + serviceFee).toFixed(2),
      },
      internal_order_id: printOrder._id,
    };
  }

  async getPrintOrderStatus(printOrderId, userId = null) {
    try {
      let printOrder;
      if (userId) {
        printOrder = await PrintOrder.findByIdForUser(printOrderId, userId);
      } else {
        printOrder = await PrintOrder.findById(printOrderId);
      }

      if (!printOrder) {
        throw new ErrorHandler("Print order not found", 404);
      }

      let luluStatus = null;
      let trackingInfo = null;

      if (printOrder.lulu_print_job_id) {
        try {
          luluStatus = await this.luluService.getPrintJobStatus(
            printOrder.lulu_print_job_id,
          );

          await PrintOrder.updateStatus(
            printOrderId,
            luluStatus.name.toLowerCase(),
          );
          if (luluStatus.name === "SHIPPED" && luluStatus.line_item_statuses) {
            trackingInfo = luluStatus.line_item_statuses[0]?.messages;
            if (trackingInfo) {
              await PrintOrder.updateStatus(
                printOrderId,
                "shipped",
                trackingInfo,
              );
            }
          }
        } catch (error) {
          logger.warn("Failed to get Lulu status", {
            printOrderId,
            luluJobId: printOrder.lulu_print_job_id,
            error: error.message,
          });
        }
      }

      const payment = await PrintOrderPayment.findByPrintOrder(printOrderId);

      return {
        print_order: printOrder,
        payment: payment,
        lulu_status: luluStatus,
        tracking_info: trackingInfo,
      };
    } catch (error) {
      throw new ErrorHandler("Failed to get print order status", 500);
    }
  }

  async processPendingPayments() {
    try {
      const pendingPayments = await PrintOrderPayment.getPendingPayments();
      const results = {
        processed: 0,
        failed: 0,
        errors: [],
      };

      for (const payment of pendingPayments) {
        try {
          const checkoutSession = await stripeService.getCheckoutSession(
            payment.checkout_session_id,
          );

          if (checkoutSession.payment_status === "paid") {
            await this.handlePaymentSuccessCallback(
              payment.checkout_session_id,
            );
            results.processed++;
          } else if (
            checkoutSession.payment_status === "expired" ||
            checkoutSession.payment_status === "canceled"
          ) {
            await PrintOrderPayment.markAsFailed(payment.checkout_session_id);
            results.failed++;
          }
        } catch (error) {
          results.errors.push({
            paymentId: payment._id,
            checkoutSessionId: payment.checkout_session_id,
            error: error.message,
          });
          logger.error("Failed to process pending payment", {
            checkoutSessionId: payment.checkout_session_id,
            error: error.message,
          });
        }
      }

      logger.info("Pending payments processing completed", results);
      return results;
    } catch (error) {
      logger.error("Failed to process pending payments", {
        error: error.message,
      });
      throw new ErrorHandler("Failed to process pending payments", 500);
    }
  }

  async calculatePrintCosts(
    podPackageId,
    pageCount,
    quantity,
    shippingAddress,
    shippingLevel,
  ) {
    try {
      const lineItems = [
        {
          page_count: pageCount,
          pod_package_id: podPackageId,
          quantity: quantity,
        },
      ];

      const luluShippingOption = this.mapToLuluShippingOption(shippingLevel);

      const costCalculation = await this.luluService.calculatePrintJobCost(
        lineItems,
        shippingAddress,
        luluShippingOption,
      );

      logger.info("Print costs calculated successfully", {
        podPackageId,
        pageCount,
        quantity,
        totalCost: costCalculation.total_cost_incl_tax,
        currency: costCalculation.currency,
      });

      return costCalculation;
    } catch (error) {
      logger.error("Failed to calculate print costs", {
        podPackageId,
        pageCount,
        quantity,
        error: error.message,
      });
      throw new ErrorHandler("Failed to calculate printing costs", 500);
    }
  }

  mapToLuluShippingOption(shippingLevel) {
    const shippingMap = {
      MAIL: "MAIL",
      PRIORITY_MAIL: "PRIORITY_MAIL",
      GROUND: "GROUND",
      EXPEDITED: "EXPEDITED",
      EXPRESS: "EXPRESS",
    };

    return shippingMap[shippingLevel] || "GROUND";
  }

  async generatePrintFiles(book) {
    try {
      const BookToPDF = (
        await import("../../../CORE/services/booktopdf/index.js")
      ).default;
      const bookToPDF = new BookToPDF(book);
      const pdfBuffer = await bookToPDF.generatePDF();
      const interiorFileUrl = await this.uploadToStorage(
        pdfBuffer,
        `interior-${book._id}.pdf`,
      );
      const coverFileUrl = await this.uploadToStorage(
        pdfBuffer,
        `cover-${book._id}.pdf`,
      );

      return {
        interiorFileUrl,
        coverFileUrl,
      };
    } catch (error) {
      logger.error("Failed to generate print files", {
        bookId: book._id,
        error: error.message,
      });
      throw new ErrorHandler("Failed to generate files for printing", 500);
    }
  }

  async validateFilesWithLulu(
    interiorFileUrl,
    coverFileUrl,
    podPackageId,
    book,
  ) {
    try {
      const pageCount = book.personalized_content?.page_count || 100;

      const interiorValidation = await this.luluService.validateInteriorFile(
        interiorFileUrl,
        podPackageId,
      );
      await this.luluService.waitForValidation(
        interiorValidation.id,
        "interior",
      );

      const coverValidation = await this.luluService.validateCoverFile(
        coverFileUrl,
        podPackageId,
        pageCount,
      );
      await this.luluService.waitForValidation(coverValidation.id, "cover");

      return {
        interiorValid: true,
        coverValid: true,
      };
    } catch (error) {
      logger.error("File validation failed with Lulu", {
        podPackageId,
        error: error.message,
      });
      throw new ErrorHandler(`File validation failed: ${error.message}`, 400);
    }
  }

  async uploadToStorage(fileBuffer, fileName) {
    try {
      const s3Service = new S3Service();

      const key = `books/pdfs/${Date.now()}-${fileName}`;

      const fileUrl = await s3Service.uploadBuffer(
        fileBuffer,
        key,
        "application/pdf",
      );

      logger.info("PDF uploaded to S3 successfully", {
        fileName,
        key,
        fileSize: fileBuffer.length,
      });

      return fileUrl;
    } catch (error) {
      logger.error("Failed to upload file to S3", {
        fileName,
        error: error.message,
      });
      throw new ErrorHandler("Failed to upload file to storage", 500);
    }
  }
}

export default PrintOrderService;
