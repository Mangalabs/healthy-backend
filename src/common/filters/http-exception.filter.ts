import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    this.logger.error(
      `Status: ${status} Path: ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    // Respostas com objeto podem trazer `code` e dados extras para o app agir
    // (ex.: TARGET_BELOW_FLOOR com o piso de peso); eles vão em `code`/`details`.
    const body =
      typeof message === 'string' ? {} : (message as Record<string, unknown>);
    const { message: bodyMessage, code } = body;
    const details = Object.fromEntries(
      Object.entries(body).filter(
        ([key]) => !['message', 'statusCode', 'error', 'code'].includes(key),
      ),
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      error: typeof message === 'string' ? message : bodyMessage || message,
      ...(code ? { code } : {}),
      ...(Object.keys(details).length > 0 ? { details } : {}),
    });
  }
}
