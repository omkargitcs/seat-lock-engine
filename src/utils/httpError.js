// Throw these from services; the error handler in app.js turns them into JSON responses.
export class HttpError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const toPositiveInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Returns a de-duplicated array of positive integers, or null if the input is invalid.
export const toSeatIdList = (value, max) => {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return null;
  const ids = value.map(toPositiveInt);
  if (ids.some((id) => id === null)) return null;
  return [...new Set(ids)];
};
