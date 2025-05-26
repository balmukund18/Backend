class ApiError extends Error {
  constructor(
    message = "an unexpected error occurred",
    statusCode,
errors = [],
stack = ""
) {
    super(message);
    this.statusCode = statusCode || 500;
    this.data = null;
    this.message = message;
     this.success = false;
     this.errors =errors;

    this.stack = stack || new Error().stack;

    if(stack) {
        this.stack = stack;
    }else {
        Error.captureStackTrace(this, this.constructor);
    }
  }
} 


export {ApiError}
