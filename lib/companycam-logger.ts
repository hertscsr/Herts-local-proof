type LogLevel = "info" | "warn" | "error";

type CompanyCamLogData = Record<string, unknown>;

function writeLog(
  level: LogLevel,
  event: string,
  data: CompanyCamLogData = {}
) {
  const payload = {
    timestamp: new Date().toISOString(),
    service: "companycam",
    level,
    event,
    ...data,
  };

  const message = JSON.stringify(payload);

  if (level === "error") {
    console.error(message);
  } else if (level === "warn") {
    console.warn(message);
  } else {
    console.log(message);
  }
}

export const companyCamLog = {
  info(event: string, data?: CompanyCamLogData) {
    writeLog("info", event, data);
  },

  warn(event: string, data?: CompanyCamLogData) {
    writeLog("warn", event, data);
  },

  error(event: string, data?: CompanyCamLogData) {
    writeLog("error", event, data);
  },
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}