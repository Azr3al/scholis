import { PasswordRequirements } from "@/components/auth/password-requirements";
import {
  Button,
  Field,
  Skeleton,
  useToast,
} from "@/components/primitives";
import {
  RegistrationStep,
  role,
  studentSelfRegisterSchemaObject,
  withSelfRegisterPasswordMatch,
} from "@/types/user";
import AutoForm, {
  type AutoFormGroup,
  type AutoFormInputComponentProps,
} from "@/components/auto-form";
import { GroupSection } from "@/components/custom-fields/group-section";
import { buildConfigSchema } from "@/lib/custom-fields/build-config-schema";
import { evaluatePasswordRequirements } from "@/lib/password-requirements";
import { useRegistrationFormConfig } from "@/hooks/use-registration-form-config";
import { useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import CountrySelect from "../form/country-select";
import { useMutation } from "@tanstack/react-query";
import { makePostRequest } from "@/app/client-api/utils";
import { getDateISOString, birthdayFocusDate } from "@/helpers/date";
import { setFormErrrors, scheduleScrollToFirstFormError } from "@/helpers/form";
import { useMemo, useState } from "react";
import {
  EMPTY_FORM_CONFIG,
  type FormConfig,
  type FormConfigGroup,
} from "@/types/form-config";

interface InfoStepProps {
  setStep: (step: RegistrationStep) => void;
  email: string;
  courseId?: string;
}

const REGISTRATION_INFO_GROUPS: AutoFormGroup[] = [
  {
    id: "account",
    title: "Your account",
    description: "Name, email, and password for your new account.",
    fields: [
      "name",
      "alternative_name",
      "password",
      "confirm_password",
      "email",
      "communication_email",
    ],
  },
  {
    id: "profile",
    title: "Profile",
    description: "Optional details that help us contact you.",
    fields: ["gender", "date_of_birth", "phone_number", "country"],
  },
];

function RegistrationPasswordFieldType({
  label,
  fieldProps,
  error,
}: AutoFormInputComponentProps) {
  const { value, onChange, onBlur, name, ref, ...rest } = fieldProps;
  const [passwordFocused, setPasswordFocused] = useState(false);
  return (
    <Field.Root
      className="w-full max-w-xl"
      name={name}
      invalid={Boolean(error)}
    >
      <Field.Label>{label}</Field.Label>
      <Field.Control
        ref={ref}
        name={name}
        value={value ?? ""}
        type="password"
        autoComplete="new-password"
        {...rest}
        onChange={onChange}
        onBlur={(e) => {
          onBlur?.(e);
          setPasswordFocused(false);
        }}
        onFocus={() => setPasswordFocused(true)}
      />
      <PasswordRequirements
        password={typeof value === "string" ? value : ""}
        visible={passwordFocused}
      />
      <div className="min-h-5">
        {error ? <Field.Error>{error}</Field.Error> : null}
      </div>
    </Field.Root>
  );
}

function RegistrationCountryFieldType({
  fieldProps,
  field,
  isRequired,
  fieldConfigItem,
  error,
}: AutoFormInputComponentProps) {
  const form = useFormContext();
  return (
    <Field.Root
      className="w-full max-w-xl"
      name={field.name}
      invalid={Boolean(error)}
    >
      <CountrySelect
        {...fieldProps}
        value={field.value}
        onChange={(value) => {
          field.onChange(value);
          form.setValue("region", "");
          form.setValue("city", "");
          form.setValue("township", "");
        }}
        isRequired={isRequired}
        formDescription={
          typeof fieldConfigItem.description === "string"
            ? fieldConfigItem.description
            : undefined
        }
      />
      <div className="min-h-5">
        {error ? <Field.Error>{error}</Field.Error> : null}
      </div>
    </Field.Root>
  );
}

function customFieldGroups(config: FormConfig): FormConfigGroup[] {
  return config.groups
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) => field.source === "custom"),
    }))
    .filter((group) => group.fields.length > 0);
}

function RegistrationInfoForm({
  config,
  email,
  courseId,
  setStep,
}: {
  config: FormConfig;
  email: string;
  courseId?: string;
  setStep: (step: RegistrationStep) => void;
}) {
  const composedSchema = useMemo(
    () =>
      withSelfRegisterPasswordMatch(
        buildConfigSchema(studentSelfRegisterSchemaObject, config, "create"),
      ),
    [config],
  );

  const form = useForm<z.infer<typeof composedSchema>>({
    resolver: zodResolver(composedSchema),
    defaultValues: {
      email,
    },
  });

  const passwordValue = form.watch("password") ?? "";
  const confirmValue = form.watch("confirm_password") ?? "";
  const passwordReady = useMemo(() => {
    const { allMet } = evaluatePasswordRequirements(passwordValue);
    return allMet && passwordValue === confirmValue && passwordValue.length > 0;
  }, [passwordValue, confirmValue]);

  const customGroups = useMemo(() => customFieldGroups(config), [config]);
  const toast = useToast();

  const fieldConfig = useMemo(
    () => ({
      name: {
        description: "Your full name.",
      },
      alternative_name: {
        description: "What name do you prefer to be called?",
      },
      email: {
        inputProps: {
          disabled: true,
        },
      },
      communication_email: {
        description: "Secondary email to contact you.",
      },
      password: {
        fieldType: RegistrationPasswordFieldType,
      },
      confirm_password: {
        inputProps: {
          type: "password",
          autoComplete: "new-password",
        },
      },
      phone_number: {
        inputProps: { placeholder: "+959xxxxxxxx" },
      },
      date_of_birth: {
        inputProps: {
          defaultMonth: birthdayFocusDate(),
        },
      },
      country: {
        fieldType: RegistrationCountryFieldType,
      },
    }),
    [],
  );

  const submitMutation = useMutation({
    mutationKey: ["registerStudent"],
    mutationFn: (data: z.infer<typeof composedSchema>) => {
      const payload: Record<string, unknown> = {
        ...data,
        ...(data.date_of_birth
          ? { date_of_birth: getDateISOString(data.date_of_birth) }
          : {}),
        roles: [role.student],
        is_waiting_for_activation: true,
      };
      if (courseId != null) {
        payload.course_id = courseId;
      }
      return makePostRequest("self-register/student", payload);
    },
    onSuccess: () => {
      toast.add({
        description: "Your account has been successfully created.",
      });
      setStep(RegistrationStep.SUCCESS);
    },
    onError: (e) => {
      const applied = setFormErrrors(e, form);
      if (applied) scheduleScrollToFirstFormError(form);
    },
  });

  return (
    <AutoForm
      onSubmit={(v) => submitMutation.mutate(v)}
      schema={composedSchema}
      saveMode="create"
      groups={REGISTRATION_INFO_GROUPS}
      form={form}
      stickyFooter={false}
      isSubmitting={submitMutation.isPending}
      fieldConfig={fieldConfig}
    >
      {customGroups.length > 0 ? (
        <div className="mt-4 space-y-6">
          {customGroups.map((group) => (
            <GroupSection
              key={group.id ?? group.name}
              form={form}
              group={group}
              surface="create"
              actor="user"
            />
          ))}
        </div>
      ) : null}
      <Button
        isLoading={submitMutation.isPending}
        type="submit"
        className="w-full mt-3"
        disabled={!passwordReady || submitMutation.isPending}
      >
        Register
      </Button>
    </AutoForm>
  );
}

const InfoStep: React.FC<InfoStepProps> = ({ setStep, email, courseId }) => {
  const {
    data: formConfig,
    isLoading,
    isError,
    refetch,
  } = useRegistrationFormConfig();

  if (isLoading) {
    return (
      <>
        <h2 className="text-xl font-bold">Fill out your info</h2>
        <div
          className="space-y-3"
          aria-busy="true"
          aria-label="Loading registration form"
        >
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <h2 className="text-xl font-bold">Fill out your info</h2>
        <div className="rounded-lg border border-destructive/40 p-4 text-sm">
          <p className="text-destructive">
            Could not load the registration form.
          </p>
          <Button
            type="button"
            variant="secondary" size="sm"
            className="mt-3"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 mb-1"
        onClick={() => setStep(RegistrationStep.OTP)}
      >
        Back
      </Button>
      <h2 className="text-xl font-bold ">Fill out your info</h2>
      <RegistrationInfoForm
        config={formConfig ?? EMPTY_FORM_CONFIG}
        email={email}
        courseId={courseId}
        setStep={setStep}
      />
    </>
  );
};

export default InfoStep;
