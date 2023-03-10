import { NextFunction, Request, Response } from 'express';
import { getClientIp } from '@supercharge/request-ip/dist';

import { HttpError } from '../models';

import { generateError } from '../utils/app-errors';
import { dateAndTime } from '@shared/utils/log-date';

const handleJWTError = () => generateError('Invalid token', 401, 'INVALID_TOKEN');

const sendErrorDev = (err: HttpError, req: Request, res: Response) => {
  notifyError(err, req);
  res.status(err.status).json({
    code: err.code,
    message: err.message,
    error: err,
  });
};

const sendErrorProd = (err: HttpError, req: Request, res: Response) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    notifyError(err, req);

    return res.status(err.status).json({
      code: err.code,
      message: err.message,
    });
  }

  // Code here is undefined, so we set it
  err.code = 'INTERNAL_SERVER_ERROR';
  notifyError(err, req);

  // Programming or other unknown error: don't leak error details
  // 1) Log error
  // eslint-disable-next-line no-console
  console.error('ERROR 💥', err);

  // 2) Send generic message
  return res.status(500).json({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Oops! Something went wrong...',
  });
};

const notifyError = (err: HttpError, req: Request) => {
  const status = err.status || 500;
  // Avoid notifying on 'not found (404)', 'validation (422)' or 'rate limit (429)' errors
  if (status > 404 && status !== 422 && status !== 429) {
    // Notify admins of important errors
    const { method, originalUrl, headers, params, query, body } = req;

    // Prevent sending sensitive information
    delete body.password;
    delete body.oldPassword;
    delete body.newPassword;
    delete body.token;

    const data = {
      Date: dateAndTime(),
      IP: getClientIp(req),
      Headers: JSON.stringify(headers),
      Parameters: JSON.stringify(params),
      Query: JSON.stringify(query),
      Body: JSON.stringify(body),
      'HTTP Method': method,
      URL: `${originalUrl.split('?')[0]}`,
      'Error Code': err.code,
      'Error Status': status,
      'Error Stack': err.stack,
    };
  }
};

export default function ErrorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  let error = { ...err };
  error.message = err.message;
  error.stack = err.stack;

  if (['JsonWebTokenError', 'TokenExpiredError'].includes(err.name)) error = handleJWTError();

  error.status = error.status || 500;

  // eslint-disable-next-line no-console
  console.log(err.stack);
}
