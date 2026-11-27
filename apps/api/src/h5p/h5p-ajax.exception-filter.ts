import { Catch } from '@nestjs/common';
import { HttpExceptionFilter, type ErrorResponseBody } from '../common/http-exception.filter.js';

/**
 * The API's error envelope, reshaped for the H5P editor's own client.
 *
 * **Why the stock envelope is dangerous on these routes.** Joubel's
 * `H5PEditor.FileUploader` decides success by the body, not the status: it
 * treats the parsed JSON as a successful upload unless it has an `error` key or
 * `success: false`, and then copies its `path` into the file field. Our envelope
 * has neither, and its `path` is the *request URL* — so a refused upload (an
 * expired editor token is the everyday case) was stored as
 * `"path": "/api/h5p/ajax?token=…&action=files&"`, the image broke everywhere,
 * and the next save deleted the exercise's real files because nothing
 * referenced them any more.
 *
 * So these routes answer the shape the H5P clients read — `success: false` and
 * a `message`, which `FileUploader` shows under the field — and never a `path`.
 * Only the body changes; status, `no-store` and logging are the parent's.
 */
@Catch()
export class H5pAjaxExceptionFilter extends HttpExceptionFilter {
  protected override shape(body: ErrorResponseBody): object {
    return {
      success: false,
      statusCode: body.statusCode,
      message: body.message,
      ...(body.errors ? { errors: body.errors } : {}),
      timestamp: body.timestamp,
    };
  }
}
