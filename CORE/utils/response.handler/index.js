export const sendResponse = (
  res,
  statusCode,
  message,
  data = null,
  status = "success",
) => {
  res.status(statusCode).json({
    status: status,
    message: message,
    data: data,
  });
};
