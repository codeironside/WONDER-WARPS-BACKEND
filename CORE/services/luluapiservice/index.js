import axios from "axios";
import ErrorHandler from "../../middleware/errorhandler/index.js";
import logger from "../../utils/logger/index.js";
import { config } from "../../utils/config/index.js";
class LuluAPIService {
  constructor() {
    this.baseURL = process.env.LULU_API_BASE_URL || "https://api.lulu.com";
    this.authURL =
      process.env.LULU_AUTH_URL ||
      "https://api.lulu.com/auth/realms/glasstree/protocol/openid-connect/token";
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
      logger.error("Lulu API authentication failed", { error: error.message });
      throw new ErrorHandler("Failed to authenticate with Lulu API", 500);
    }
  }

  async makeRequest(method, endpoint, data = null) {
    try {
      const token = await this.authenticate();

      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
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
    return await this.makeRequest("POST", "/print-job-cost-calculations/", {
      line_items: lineItems,
      shipping_address: shippingAddress,
      shipping_option: shippingOption,
    });
  }

  async getShippingOptions(lineItems, shippingAddress, currency = "USD") {
    return await this.makeRequest("POST", "/shipping-options/", {
      line_items: lineItems,
      shipping_address: shippingAddress,
      currency,
    });
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
