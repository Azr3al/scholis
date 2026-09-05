"use client";
import { Input, inputClassName } from "@/components/primitives";

import CountrySelect from "@/components/form/country-select";
import { MyanmarAddressFormFields } from "@/components/form/myanmar-address";
import { OptionalMark } from "@/components/form/required-mark";
import { isMyanmarCountry } from "@/components/users/user-form-utils";
import { Controller, type UseFormReturn } from "react-hook-form";

export function AddressCluster({
  form,
  readOnly = false,
}: {
  form: UseFormReturn<any>;
  readOnly?: boolean;
}) {
  const currentCountry = form.watch("country");
  const isMyanmar = isMyanmarCountry(currentCountry);

  return (
    <div className="space-y-4">
      <Controller
        control={form.control}
        name="country"
        render={({ field }) => (
          <div data-field-name="country">
            <CountrySelect
              value={field.value}
              onChange={(value) => {
                field.onChange(value);
                form.setValue("region", "");
                form.setValue("city", "");
                form.setValue("township", "");
              }}
              showOptional
            />
            <p />
          </div>
        )}
      />

      {isMyanmar ? (
        <MyanmarAddressFormFields form={form} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(["region", "city", "township"] as const).map((name) => (
            <Controller
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <div>
                  <label>
                    {name[0].toUpperCase() + name.slice(1)}
                    <OptionalMark />
                  </label>
                  <div>
                    <Input {...field} value={field.value ?? ""} disabled={readOnly} />
                  </div>
                  <p />
                </div>
              )}
            />
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(["house_number", "street"] as const).map((name) => (
          <Controller
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <div>
                <label>
                  {name === "house_number" ? "House number" : "Street"}
                  <OptionalMark />
                </label>
                <div>
                  <Input {...field} value={field.value ?? ""} disabled={readOnly} />
                </div>
                <p />
              </div>
            )}
          />
        ))}
      </div>
    </div>
  );
}
