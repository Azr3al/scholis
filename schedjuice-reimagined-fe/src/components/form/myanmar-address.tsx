"use client";

import { Field, Select } from "@/components/primitives";
import type React from "react";
import { OptionalMark } from "@/components/form/required-mark";
import myanmarData from "@/data/myanmar-locations.json";
import { useMemo, useCallback } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";

interface MyanmarLocation {
  region: string;
  capital_city: string;
  district: string;
  township: string;
}

export function useMyanmarLocationData() {
  return useMemo(() => {
    const locations = myanmarData as MyanmarLocation[];

    const regionsSet = new Set<string>();
    const citiesByRegionMap = new Map<string, Set<string>>();
    const townshipsByRegionAndCityMap = new Map<
      string,
      Map<string, Set<string>>
    >();

    locations.forEach((loc) => {
      regionsSet.add(loc.region);

      if (!citiesByRegionMap.has(loc.region)) {
        citiesByRegionMap.set(loc.region, new Set());
      }
      citiesByRegionMap.get(loc.region)!.add(loc.district);

      if (!townshipsByRegionAndCityMap.has(loc.region)) {
        townshipsByRegionAndCityMap.set(loc.region, new Map());
      }
      if (!townshipsByRegionAndCityMap.get(loc.region)!.has(loc.district)) {
        townshipsByRegionAndCityMap
          .get(loc.region)!
          .set(loc.district, new Set());
      }
      townshipsByRegionAndCityMap
        .get(loc.region)!
        .get(loc.district)!
        .add(loc.township);
    });

    return {
      regions: Array.from(regionsSet).sort(),
      citiesByRegion: citiesByRegionMap,
      townshipsByRegionAndCity: townshipsByRegionAndCityMap,
    };
  }, []);
}

interface MyanmarAddressProps {
  region: string;
  city: string;
  township: string;
  onRegionChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onTownshipChange: (value: string) => void;
  isRequired?: boolean;
  formDescription?: React.ReactNode;
}

/** @deprecated Prefer MyanmarAddressFormFields with react-hook-form Controller. */
const MyanmarAddress: React.FC<MyanmarAddressProps> = ({
  region,
  city,
  township,
  onRegionChange,
  onCityChange,
  onTownshipChange,
  isRequired = false,
  formDescription,
}) => {
  const { regions, citiesByRegion, townshipsByRegionAndCity } =
    useMyanmarLocationData();

  const cities = useMemo(() => {
    if (!region) return [];
    const citySet = citiesByRegion.get(region);
    return citySet ? Array.from(citySet).sort() : [];
  }, [region, citiesByRegion]);

  const townships = useMemo(() => {
    if (!region || !city) return [];
    const townshipSet = townshipsByRegionAndCity.get(region)?.get(city);
    return townshipSet ? Array.from(townshipSet).sort() : [];
  }, [region, city, townshipsByRegionAndCity]);

  const handleRegionChange = useCallback(
    (value: string) => {
      onRegionChange(value);
    },
    [onRegionChange],
  );

  const handleCityChange = useCallback(
    (value: string) => {
      onCityChange(value);
    },
    [onCityChange],
  );

  const handleTownshipChange = useCallback(
    (value: string) => {
      onTownshipChange(value);
    },
    [onTownshipChange],
  );

  return (
    <>
      <Field.Root name="region" className="w-full">
        <Field.Label>
          Region {isRequired && <span className="text-red-500">*</span>}
        </Field.Label>
        <Select
          value={region}
          onValueChange={handleRegionChange}
          items={regions.map((regionName) => ({
            value: String(regionName),
            label: regionName,
          }))}
          placeholder="Select region"
        />
        {formDescription ? (
          <Field.Description>{formDescription}</Field.Description>
        ) : null}
      </Field.Root>

      <Field.Root name="city" className="w-full">
        <Field.Label>
          City {isRequired && <span className="text-red-500">*</span>}
        </Field.Label>
        <Select
          value={city}
          onValueChange={handleCityChange}
          disabled={!region}
          items={cities.map((cityName) => ({
            value: String(cityName),
            label: cityName,
          }))}
          placeholder={region ? "Select city" : "Select region first"}
        />
      </Field.Root>

      <Field.Root name="township" className="w-full">
        <Field.Label>
          Township {isRequired && <span className="text-red-500">*</span>}
        </Field.Label>
        <Select
          value={township}
          onValueChange={handleTownshipChange}
          disabled={!region || !city}
          items={townships.map((townshipName) => ({
            value: String(townshipName),
            label: townshipName,
          }))}
          placeholder={
            !region
              ? "Select region first"
              : !city
                ? "Select city first"
                : "Select township"
          }
        />
      </Field.Root>
    </>
  );
};

interface MyanmarAddressFormFieldsProps {
  form: UseFormReturn<any>;
}

/** Myanmar region/city/township selects wired to react-hook-form. */
export function MyanmarAddressFormFields({ form }: MyanmarAddressFormFieldsProps) {
  const { regions, citiesByRegion, townshipsByRegionAndCity } =
    useMyanmarLocationData();
  const region = form.watch("region") ?? "";
  const city = form.watch("city") ?? "";

  const cities = useMemo(() => {
    if (!region) return [];
    const citySet = citiesByRegion.get(region);
    return citySet ? Array.from(citySet).sort() : [];
  }, [region, citiesByRegion]);

  const townships = useMemo(() => {
    if (!region || !city) return [];
    const townshipSet = townshipsByRegionAndCity.get(region)?.get(city);
    return townshipSet ? Array.from(townshipSet).sort() : [];
  }, [region, city, townshipsByRegionAndCity]);

  return (
    <>
      <Controller
        control={form.control}
        name="region"
        render={({ field, fieldState }) => (
          <Field.Root
            name="region"
            className="w-full"
            data-field-name="region"
            invalid={Boolean(fieldState.error)}
          >
            <Field.Label>
              Region
              <OptionalMark />
            </Field.Label>
            <Select
              value={field.value ?? ""}
              onValueChange={(value) => {
                field.onChange(value);
                form.setValue("city", "", { shouldDirty: true });
                form.setValue("township", "", { shouldDirty: true });
              }}
              items={regions.map((regionName) => ({
                value: String(regionName),
                label: regionName,
              }))}
              placeholder="Select region"
            />
            {fieldState.error?.message ? (
              <Field.Error>{fieldState.error.message}</Field.Error>
            ) : null}
          </Field.Root>
        )}
      />

      <Controller
        control={form.control}
        name="city"
        render={({ field, fieldState }) => (
          <Field.Root
            name="city"
            className="w-full"
            data-field-name="city"
            invalid={Boolean(fieldState.error)}
          >
            <Field.Label>
              City
              <OptionalMark />
            </Field.Label>
            <Select
              value={field.value ?? ""}
              onValueChange={(value) => {
                field.onChange(value);
                form.setValue("township", "", { shouldDirty: true });
              }}
              disabled={!region}
              items={cities.map((cityName) => ({
                value: String(cityName),
                label: cityName,
              }))}
              placeholder={region ? "Select city" : "Select region first"}
            />
            {fieldState.error?.message ? (
              <Field.Error>{fieldState.error.message}</Field.Error>
            ) : null}
          </Field.Root>
        )}
      />

      <Controller
        control={form.control}
        name="township"
        render={({ field, fieldState }) => (
          <Field.Root
            name="township"
            className="w-full"
            data-field-name="township"
            invalid={Boolean(fieldState.error)}
          >
            <Field.Label>
              Township
              <OptionalMark />
            </Field.Label>
            <Select
              value={field.value ?? ""}
              onValueChange={field.onChange}
              disabled={!region || !city}
              items={townships.map((townshipName) => ({
                value: String(townshipName),
                label: townshipName,
              }))}
              placeholder={
                !region
                  ? "Select region first"
                  : !city
                    ? "Select city first"
                    : "Select township"
              }
            />
            {fieldState.error?.message ? (
              <Field.Error>{fieldState.error.message}</Field.Error>
            ) : null}
          </Field.Root>
        )}
      />
    </>
  );
}

export default MyanmarAddress;
