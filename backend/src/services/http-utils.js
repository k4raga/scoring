export function createHttpError(httpStatus, code, message = code) {
  const error = new Error(message);
  error.httpStatus = httpStatus;
  error.code = code;
  return error;
}

export function normalizeOptionalText(value) {
  return String(value || "").trim();
}

export function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readBooleanEnv(value) {
  const normalized = normalizeOptionalText(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function sendHttpError(response, error, fallbackCode, fallbackStatus = 500) {
  response.status(Number(error?.httpStatus) || fallbackStatus).json({
    error: normalizeOptionalText(error?.code) || fallbackCode
  });
}
