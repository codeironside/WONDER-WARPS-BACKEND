import axios from "axios";
import ErrorHandler from "../../middleware/errorhandler/index.js";
import logger from "../../utils/logger/index.js";
import { config } from "../../utils/config/index.js";

class LuluAPIService {
  constructor() {
    this.baseURL =
      process.env.LULU_API_BASE_URL || "https://api.sandbox.lulu.com";
    this.authURL =
      process.env.LULU_AUTH_URL ||
      "https://api.sandbox.lulu.com/auth/realms/glasstree/protocol/openid-connect/token";
    this.clientKey = config.lulu.client_key;
    this.clientSecret = config.lulu.client_secret;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async authenticate() {
    try {
      if (
        this.accessToken &&
        this.tokenExpiry &&
        Date.now() < this.tokenExpiry
      ) {
        return this.accessToken;
      }

      const authString = Buffer.from(
        `${this.clientKey}:${this.clientSecret}`,
      ).toString("base64");
      console.log(config.lulu.client_key, config.lulu.client_secret);
      const response = await axios.post(
        this.authURL,
        "grant_type=client_credentials",
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${authString}`,
          },
        },
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;

      logger.info("Lulu API authentication successful");
      return this.accessToken;
    } catch (error) {
      console.log(error);
      logger.error("Lulu API authentication failed", { error: error.message });
      throw new ErrorHandler("Failed to authenticate with Lulu API", 500);
    }
  }

  async makeRequest(method, endpoint, data = null) {
    try {
      const token = await this.authenticate();

      const requestConfig = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      };

      if (data) {
        requestConfig.data = data;
      }

      const response = await axios(requestConfig);

      return response.data;
    } catch (error) {
      console.log(error.response);
      logger.error("Lulu API request failed", {
        endpoint,
        method,
        error: error.response?.data || error.message,
      });

      if (error.response?.status === 401) {
        this.accessToken = null;
      }

      throw new ErrorHandler(
        `Lulu API request failed: ${error.response?.data?.detail || error.message}`,
        error.response?.status || 500,
      );
    }
  }

  async validateInteriorFile(sourceUrl, podPackageId = null) {
    const payload = { source_url: sourceUrl };
    if (podPackageId) payload.pod_package_id = podPackageId;

    return await this.makeRequest("POST", "/validate-interior/", payload);
  }

  async getInteriorValidation(validationId) {
    return await this.makeRequest("GET", `/validate-interior/${validationId}/`);
  }

  async validateCoverFile(sourceUrl, podPackageId, interiorPageCount) {
    return await this.makeRequest("POST", "/validate-cover/", {
      source_url: sourceUrl,
      pod_package_id: podPackageId,
      interior_page_count: interiorPageCount,
    });
  }

  async getCoverValidation(validationId) {
    return await this.makeRequest("GET", `/validate-cover/${validationId}/`);
  }

  async calculateCoverDimensions(podPackageId, interiorPageCount, unit = "pt") {
    return await this.makeRequest("POST", "/cover-dimensions/", {
      pod_package_id: podPackageId,
      interior_page_count: interiorPageCount,
      unit,
    });
  }

  async calculatePrintJobCost(lineItems, shippingAddress, shippingOption) {
    try {
      if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
        throw new ErrorHandler(
          "Line items are required and must be an array",
          400,
        );
      }

      if (!shippingAddress) {
        throw new ErrorHandler("Shipping address is required", 400);
      }

      if (!shippingOption) {
        throw new ErrorHandler("Shipping option is required", 400);
      }
      const validShippingOptions = [
        "MAIL",
        "PRIORITY_MAIL",
        "GROUND_HD",
        "GROUND_BUS",
        "GROUND",
        "EXPEDITED",
        "EXPRESS",
      ];
      if (!validShippingOptions.includes(shippingOption)) {
        throw new ErrorHandler(
          `Invalid shipping option. Must be one of: ${validShippingOptions.join(", ")}`,
          400,
        );
      }

      const payload = {
        line_items: lineItems.map((item) => ({
          page_count: parseInt(item.page_count),
          pod_package_id: item.pod_package_id,
          quantity: parseInt(item.quantity),
        })),
        shipping_address: {
          city: shippingAddress.city,
          country_code: shippingAddress.country_code,
          postcode: shippingAddress.postcode,
          state_code: shippingAddress.state_code,
          street1: shippingAddress.street1,
          ...(shippingAddress.name && { name: shippingAddress.name }),
          ...(shippingAddress.street2 && { street2: shippingAddress.street2 }),
          ...(shippingAddress.phone_number && {
            phone_number: shippingAddress.phone_number,
          }),
        },
        shipping_option: shippingOption,
      };

      logger.debug("Sending print job cost calculation request", {
        lineItemsCount: payload.line_items.length,
        shippingOption: payload.shipping_option,
        shippingAddress: {
          city: payload.shipping_address.city,
          country: payload.shipping_address.country_code,
        },
      });

      const result = await this.makeRequest(
        "POST",
        "/print-job-cost-calculations/",
        payload,
      );

      logger.info("Print job cost calculation successful", {
        totalCost: result.total_cost_incl_tax,
        currency: result.currency,
        lineItemsCount: lineItems.length,
      });
      console.log(result);
      return result;
    } catch (error) {
      console.log(error);
      logger.error("Print job cost calculation failed", {
        error: error.message,
        shippingOption,
        lineItemsCount: lineItems?.length,
      });
      throw error;
    }
  }
  async getShippingOptions(lineItems, shippingAddress, currency = "USD") {
    try {
      const payload = {
        line_items: lineItems.map((item) => ({
          page_count: parseInt(item.page_count),
          pod_package_id: item.pod_package_id,
          quantity: parseInt(item.quantity),
        })),
        shipping_address: {
          city: shippingAddress.city,
          country_code: shippingAddress.country_code,
          postcode: shippingAddress.postcode,
          state_code: shippingAddress.state_code,
          street1: shippingAddress.street1,
          ...(shippingAddress.name && { name: shippingAddress.name }),
          ...(shippingAddress.street2 && { street2: shippingAddress.street2 }),
          ...(shippingAddress.phone_number && {
            phone_number: shippingAddress.phone_number,
          }),
        },
        currency,
      };

      return await this.makeRequest("POST", "/shipping-options/", payload);
    } catch (error) {
      logger.error("Failed to get shipping options", {
        error: error.message,
        currency,
      });
      throw error;
    }
  }
  async createPrintJob(printJobData) {
    return await this.makeRequest("POST", "/print-jobs/", printJobData);
  }

  async getPrintJob(printJobId) {
    return await this.makeRequest("GET", `/print-jobs/${printJobId}/`);
  }

  async getPrintJobStatus(printJobId) {
    return await this.makeRequest("GET", `/print-jobs/${printJobId}/status/`);
  }

  async getPrintJobCosts(printJobId) {
    return await this.makeRequest("GET", `/print-jobs/${printJobId}/costs/`);
  }

  async cancelPrintJob(printJobId) {
    return await this.makeRequest("PATCH", `/print-jobs/${printJobId}/`, {
      name: "CANCELED",
    });
  }

  async listPrintJobs(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString
      ? `/print-jobs/?${queryString}`
      : "/print-jobs/";
    return await this.makeRequest("GET", endpoint);
  }

  async getPrintJobStatistics(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString
      ? `/print-jobs/statistics/?${queryString}`
      : "/print-jobs/statistics/";
    return await this.makeRequest("GET", endpoint);
  }

  async waitForValidation(validationId, type = "interior", maxAttempts = 30) {
    const endpoint =
      type === "interior" ? "/validate-interior/" : "/validate-cover/";

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const validation = await this.makeRequest(
        "GET",
        `${endpoint}${validationId}/`,
      );

      const status = validation.status;

      if (status === "VALIDATED" || status === "NORMALIZED") {
        return validation;
      } else if (status === "ERROR") {
        throw new ErrorHandler(
          `File validation failed: ${validation.errors?.join(", ") || "Unknown error"}`,
          400,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new ErrorHandler("File validation timeout", 408);
  }
}

export default LuluAPIService;
