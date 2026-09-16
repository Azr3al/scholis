import { zodResolver } from "@hookform/resolvers/zod";

import { withRequiredEmptyStringMessages } from "./schema-utils";
import type { ZodObjectOrWrapped } from "./types";

/** AutoForm validation schema — required-string messages + superRefine effects. */
export function resolveAutoFormSchema(schema: ZodObjectOrWrapped) {
  return withRequiredEmptyStringMessages(schema);
}

/** Use on external `useForm` instances passed to GenericForm / AutoForm. */
export function zodResolverForAutoForm(schema: ZodObjectOrWrapped) {
  return zodResolver(resolveAutoFormSchema(schema));
}
