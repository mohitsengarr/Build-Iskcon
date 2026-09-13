// Test stand-in for npm:@anthropic-ai/sdk. Each create() call is delegated to
// globalThis.__anthropicCreate(params, requestOptions, clientOptions). No network.
export class APIError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "APIError";
  }
}

export default class Anthropic {
  constructor(opts) {
    this.opts = opts;
    this.beta = {
      messages: {
        create: (params, reqOpts) => globalThis.__anthropicCreate(params, reqOpts, opts),
      },
    };
  }
}

Anthropic.APIError = APIError;
