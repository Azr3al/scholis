"use server";

import { format } from "date-fns";

export const formatDate = async (date: Date) => {
  return format(date, "MMM do yyyy");
};