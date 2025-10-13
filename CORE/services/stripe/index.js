import Stripe from "stripe";
import { config } from "../../utils/config/index.js";
import ErrorHandler from "../../middleware/errorhandler/index.js";
import logger from "../../utils/logger/index.js";
class StripeService {
  constructor() {
    this.stripe = new Stripe(config.stripe.secret_key, {
      apiVersion: "2023-10-16",
      maxNetworkRetries: 3,
      timeout: 30000,
      telemetry: false,
    });
    this.currency = "usd";
  }
  async createCheckoutSession(
    amount,
    metadata,
    customerData,
    successUrl,
    cancelUrl,
  ) {
    try {
      const amountInCents = Math.round(amount * 100);

      if (amountInCents < 50) {
        throw new ErrorHandler("Amount must be at least $0.50", 400);
      }

      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Personalized Book: ${metadata.book_title}`,
                description: `Custom story for ${metadata.child_name}`,
                metadata: {
                  book_title: metadata.book_title,
                  child_name: metadata.child_name,
                },
              },
              unit_amount: amountInCents,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: customerData.email,
        metadata: {
          service: "personalized_book",
          ...metadata,
        },
        payment_intent_data: {
          metadata: {
            service: "personalized_book",
            ...metadata,
          },
          description: `Personalized Book: ${metadata.book_title} for ${metadata.child_name}`,
          receipt_email: customerData.email,
        },
      });

      logger.info("Checkout session created successfully", {
        sessionId: session.id,
        amount: amount,
        bookTitle: metadata.book_title,
      });

      return session;
    } catch (error) {

      console.log(error)
      logger.error("Failed to create checkout session", {
        error: error.message,
        amount,
        metadata,
      });

      if (error.type?.includes("Stripe")) {
        throw new ErrorHandler(this.formatStripeError(error), 400);
      }

      throw new ErrorHandler("Payment service temporarily unavailable", 503);
    }
  }

  async getCheckoutSession(sessionId) {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["payment_intent"],
      });

      return {
        id: session.id,
        status: session.status,
        payment_status: session.payment_status,
        amount_total: session.amount_total / 100,
        currency: session.currency,
        customer_email: session.customer_email,
        payment_intent: session.payment_intent,
        metadata: session.metadata,
        url: session.url,
      };
    } catch (error) {
      logger.error("Failed to retrieve checkout session", {
        error: error.message,
        sessionId,
      });

      if (error.type === "StripeInvalidRequestError") {
        throw new ErrorHandler("Checkout session not found", 404);
      }

      throw new ErrorHandler("Failed to retrieve checkout session", 500);
    }
  }

  async createPaymentIntent(amount, metadata = {}, customerEmail = null) {
    try {
      const amountInCents = Math.round(amount * 100);
      if (amountInCents < 50) {
        throw new ErrorHandler("Amount must be at least $0.50", 400);
      }

      if (amountInCents > 99999999) {
        throw new ErrorHandler("Amount exceeds maximum allowed", 400);
      }

      const paymentIntentData = {
        amount: amountInCents,
        currency: this.currency,
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          service: "personalized_book",
          ...metadata,
        },
      };

      if (customerEmail) {
        paymentIntentData.receipt_email = customerEmail;
      }

      const paymentIntent =
        await this.stripe.paymentIntents.create(paymentIntentData);

      logger.info("Payment intent created successfully", {
        paymentIntentId: paymentIntent.id,
        amount: amount,
        metadata: metadata,
      });

      return {
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        amount: amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
      };
    } catch (error) {
      logger.error("Failed to create payment intent", {
        error: error.message,
        amount,
        metadata,
      });

      if (error.type?.includes("Stripe")) {
        throw new ErrorHandler(this.formatStripeError(error), 400);
      }

      throw new ErrorHandler("Payment service temporarily unavailable", 503);
    }
  }
  async confirmPayment(paymentIntentId) {
    try {
      const paymentIntent =
        await this.stripe.paymentIntents.confirm(paymentIntentId);
      if (
        paymentIntent.status === "requires_action" ||
        paymentIntent.status === "requires_confirmation"
      ) {
        return {
          status: paymentIntent.status,
          client_secret: paymentIntent.client_secret,
          payment_intent_id: paymentIntent.id,
        };
      }

      logger.info("Payment confirmed successfully", {
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      });

      return {
        status: paymentIntent.status,
        payment_intent_id: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        payment_method: paymentIntent.payment_method,
        customer: paymentIntent.customer,
      };
    } catch (error) {
      logger.error("Failed to confirm payment", {
        error: error.message,
        paymentIntentId,
      });

      throw new ErrorHandler(this.formatStripeError(error), 400);
    }
  }

  async getPaymentIntent(paymentIntentId) {
    try {
      const paymentIntent =
        await this.stripe.paymentIntents.retrieve(paymentIntentId);

      const charge = paymentIntent.charges?.data[0];

      return {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        customer: paymentIntent.customer,
        payment_method: paymentIntent.payment_method,
        receipt_url: charge?.receipt_url,
        receipt_number: charge?.receipt_number,
        created: new Date(paymentIntent.created * 1000),
        metadata: paymentIntent.metadata,
        description: paymentIntent.description,
        latest_charge: paymentIntent.latest_charge,
      };
    } catch (error) {
      logger.error("Failed to retrieve payment intent", {
        error: error.message,
        paymentIntentId,
      });

      if (error.type === "StripeInvalidRequestError") {
        throw new ErrorHandler("Payment not found", 404);
      }

      throw new ErrorHandler("Failed to retrieve payment information", 500);
    }
  }

  async getReceipt(paymentIntentId) {
    try {
      const paymentIntent = await this.getPaymentIntent(paymentIntentId);

      if (!paymentIntent.receipt_url) {
        throw new ErrorHandler("Receipt not available for this payment", 404);
      }
      let chargeDetails = null;
      if (paymentIntent.latest_charge) {
        chargeDetails = await this.stripe.charges.retrieve(
          paymentIntent.latest_charge,
        );
      }

      return {
        receipt_url: paymentIntent.receipt_url,
        receipt_number: paymentIntent.receipt_number,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase(),
        payment_intent_id: paymentIntent.id,
        status: paymentIntent.status,
        paid_at: chargeDetails
          ? new Date(chargeDetails.created * 1000)
          : paymentIntent.created,
        payment_method: paymentIntent.payment_method,
        customer: paymentIntent.customer,
        metadata: paymentIntent.metadata,
        description: paymentIntent.description,
      };
    } catch (error) {
      if (error instanceof ErrorHandler) throw error;
      throw new ErrorHandler("Failed to retrieve receipt", 500);
    }
  }

  async createCustomer(userData) {
    try {
      const { email, name, userId, phone } = userData;

      const customer = await this.stripe.customers.create({
        email,
        name,
        phone,
        metadata: {
          user_id: userId.toString(),
          platform: "my_story_hat",
        },
      });

      logger.info("Stripe customer created successfully", {
        customerId: customer.id,
        userId,
        email,
      });

      return {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        created: new Date(customer.created * 1000),
      };
    } catch (error) {
      logger.error("Failed to create Stripe customer", {
        error: error.message,
        userData,
      });

      throw new ErrorHandler("Failed to create customer profile", 500);
    }
  }

  async handleWebhook(payload, signature, endpointSecret) {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        endpointSecret,
      );

      logger.info("Stripe webhook received and verified", {
        eventType: event.type,
        eventId: event.id,
      });

      return event;
    } catch (error) {
      logger.error("Stripe webhook signature verification failed", {
        error: error.message,
      });

      throw new ErrorHandler("Invalid webhook signature", 400);
    }
  }

  async createRefund(
    paymentIntentId,
    amount = null,
    reason = "requested_by_customer",
  ) {
    try {
      const refundData = {
        payment_intent: paymentIntentId,
        reason,
      };

      if (amount) {
        refundData.amount = Math.round(amount * 100);
      }

      const refund = await this.stripe.refunds.create(refundData);

      logger.info("Refund created successfully", {
        refundId: refund.id,
        paymentIntentId,
        amount: refund.amount / 100,
        reason,
      });

      return {
        id: refund.id,
        amount: refund.amount / 100,
        currency: refund.currency,
        status: refund.status,
        reason: refund.reason,
        created: new Date(refund.created * 1000),
      };
    } catch (error) {
      logger.error("Failed to create refund", {
        error: error.message,
        paymentIntentId,
      });

      throw new ErrorHandler(this.formatStripeError(error), 400);
    }
  }

  formatStripeError(error) {
    switch (error.type) {
      case "StripeCardError":
        return "Your card was declined. Please try a different payment method.";
      case "StripeRateLimitError":
        return "Too many requests. Please try again later.";
      case "StripeInvalidRequestError":
        return "Invalid payment request. Please check your information.";
      case "StripeAPIError":
        return "Payment service error. Please try again.";
      case "StripeConnectionError":
        return "Network error. Please check your connection and try again.";
      case "StripeAuthenticationError":
        return "Payment authentication failed.";
      default:
        return error.message || "An unexpected error occurred.";
    }
  }

  validatePaymentAmount(paidAmount, expectedAmount) {
    const paidInCents = Math.round(paidAmount * 100);
    const expectedInCents = Math.round(expectedAmount * 100);

    if (paidInCents !== expectedInCents) {
      throw new ErrorHandler(
        `Payment amount (${paidAmount}) does not match expected amount (${expectedAmount})`,
        400,
      );
    }

    return true;
  }

  async getCustomerCharges(customerId, options = {}) {
    try {
      const { limit = 10, starting_after = null } = options;

      const charges = await this.stripe.charges.list({
        customer: customerId,
        limit,
        starting_after,
        expand: ["data.payment_intent"],
      });

      return {
        charges: charges.data.map((charge) => ({
          id: charge.id,
          amount: charge.amount / 100,
          currency: charge.currency.toUpperCase(),
          status: charge.status,
          paid: charge.paid,
          receipt_url: charge.receipt_url,
          receipt_number: charge.receipt_number,
          created: new Date(charge.created * 1000),
          description: charge.description,
          payment_intent: charge.payment_intent.id,
          metadata: charge.metadata,
        })),
        has_more: charges.has_more,
        total_count: charges.data.length,
      };
    } catch (error) {
      logger.error("Failed to retrieve customer charges", {
        error: error.message,
        customerId,
      });

      throw new ErrorHandler("Failed to retrieve payment history", 500);
    }
  }
}

export default new StripeService();
