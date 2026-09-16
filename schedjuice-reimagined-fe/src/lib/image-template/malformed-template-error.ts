export class MalformedTemplateError extends Error {
  constructor(message = "Malformed template payload") {
    super(message);
    this.name = "MalformedTemplateError";
  }
}
