import { UAParser } from "ua-parser-js";
import geoip from "geoip-lite";
import { config } from "../../utils/config/index.js";

export async function getLoginDetails(req) {
  try {
    const ip = getClientIP(req);
    const userAgent = req.headers["user-agent"] || "Unknown";
    const loginTime = new Date().toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      timeZoneName: "short",
    });

    const location = await getLocationFromIP(ip);
    const deviceInfo = getDeviceInfo(userAgent);

    return {
      location: formatLocation(location),
      device: formatDeviceInfo(deviceInfo),
      time: loginTime,
      ip: ip,
      rawDevice: deviceInfo,
    };
  } catch (error) {
    logger.error("Error getting login details:", error);
    return {
      location: "Unknown Location",
      device: "Unknown Device / Browser",
      time: new Date().toLocaleString(),
      ip: "Unknown",
      rawDevice: { browser: "Unknown", os: "Unknown", device: "Unknown" },
    };
  }
}

function getClientIP(req) {
  try {
    return (
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.headers["x-real-ip"] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.connection?.socket?.remoteAddress ||
      "Unknown IP"
    );
  } catch (error) {
    logger.warn("Could not extract IP address:", error);
    return "Unknown IP";
  }
}

async function getLocationFromIP(ip) {
  try {
    if (
      !ip ||
      ip === "Unknown IP" ||
      ip === "::1" ||
      ip === "127.0.0.1" ||
      ip.startsWith("192.168.") ||
      ip.startsWith("10.") ||
      ip.startsWith("172.")
    ) {
      return {
        city: "Local Network",
        country: "Development Environment",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    }
    if (config.geoip?.enabled) {
      const geo = geoip.lookup(ip);
      if (geo) {
        return {
          city: geo.city || "Unknown City",
          country: geo.country || "Unknown Country",
          region: geo.region || "",
          timezone: geo.timezone || "Unknown Timezone",
          coordinates: geo.ll ? { lat: geo.ll[0], lon: geo.ll[1] } : null,
        };
      }
    }

    if (config.ipgeo?.apikey) {
      return await getLocationFromAPI(ip);
    }

    return {
      city: "Unknown City",
      country: "Unknown Country",
      timezone: "Unknown Timezone",
    };
  } catch (error) {
    logger.warn("Location detection failed:", error);
    return {
      city: "Unknown City",
      country: "Unknown Country",
      timezone: "Unknown Timezone",
    };
  }
}

async function getLocationFromAPI(ip) {
  try {
    const response = await fetch(`http://ipapi.co/${ip}/json/`);
    if (response.ok) {
      const data = await response.json();
      return {
        city: data.city || "Unknown City",
        country: data.country_name || "Unknown Country",
        region: data.region || "",
        timezone: data.timezone || "Unknown Timezone",
        isp: data.org || "",
      };
    }
  } catch (error) {
    logger.warn("IP API location service failed:", error);
  }
  return null;
}

function getDeviceInfo(userAgent) {
  try {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    return {
      browser: result.browser.name
        ? `${result.browser.name} ${result.browser.version}`
        : "Unknown Browser",
      os: result.os.name
        ? `${result.os.name} ${result.os.version}`
        : "Unknown OS",
      device: result.device.vendor || result.device.model || "Desktop",
      type: result.device.type || "desktop",
      userAgent: userAgent.substring(0, 100),
    };
  } catch (error) {
    logger.warn("User agent parsing failed:", error);
    return {
      browser: "Unknown Browser",
      os: "Unknown OS",
      device: "Unknown Device",
      type: "unknown",
    };
  }
}

function formatLocation(location) {
  if (location.city && location.country && location.city !== "Unknown City") {
    return `${location.city}, ${location.country}`;
  } else if (location.country && location.country !== "Unknown Country") {
    return location.country;
  } else {
    return "Unknown Location";
  }
}

function formatDeviceInfo(deviceInfo) {
  const deviceType =
    deviceInfo.type === "mobile"
      ? "Mobile"
      : deviceInfo.type === "tablet"
        ? "Tablet"
        : "Desktop";

  if (
    deviceInfo.browser !== "Unknown Browser" &&
    deviceInfo.os !== "Unknown OS"
  ) {
    return `${deviceType} / ${deviceInfo.browser} on ${deviceInfo.os}`;
  } else if (deviceInfo.browser !== "Unknown Browser") {
    return `${deviceType} / ${deviceInfo.browser}`;
  } else {
    return `${deviceType} / Unknown Browser`;
  }
}

export async function getDetailedLoginDetails(req) {
  const basicDetails = await getLoginDetails(req);

  const additionalInfo = {
    sessionId: req.sessionID || "No Session",
    secure: req.secure ? "HTTPS" : "HTTP",
    language: req.headers["accept-language"]?.split(",")[0] || "Unknown",
    screenResolution: req.headers["sec-ch-width"]
      ? `${req.headers["sec-ch-width"]}x${req.headers["sec-ch-height"]}`
      : "Unknown",
  };

  return {
    ...basicDetails,
    ...additionalInfo,
    timestamp: new Date().toISOString(),
    userAgent: req.headers["user-agent"] || "Unknown",
  };
}
