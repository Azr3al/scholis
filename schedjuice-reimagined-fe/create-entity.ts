// run with bun
// this script shouldn't have other dependencies than fs-extra
import fse from "fs-extra";

const camelToTitleCase = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};
const camelToKebabCase = (str: string) => {
  return str.replace(/([A-Z])/g, "-$1").toLowerCase();
};

const listEntityTemplate = (entityName: string, entityPluralName: string) => {
  const pluralTitle = camelToTitleCase(entityPluralName);
  const kebab = camelToKebabCase(entityPluralName);
  const hookName = `use${pluralTitle}List`;
  return `
"use client";

import {
  ResourceTable,
  useResourceTableState,
  column,
  type Column,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { buttonVariants } from "@/components/primitives";
import { TypographyH1 } from "@/components/typography/h1";
import { cn } from "@/lib/utils";
// TODO: add SDK list hook at src/sdk/hooks/${kebab}.ts (mirror campuses)
// import { ${hookName} } from "@/sdk/hooks/${kebab}";
import Link from "next/link";
import { usePathname } from "next/navigation";

type ${camelToTitleCase(entityName)}Row = { id: number; name?: string };

const columns: Column<${camelToTitleCase(entityName)}Row>[] = [
  column.text({
    id: "name",
    header: "Name",
    accessor: (row) => row.name,
  }),
];

const ${camelToTitleCase(entityName)}ListPage = () => {
  const pathname = usePathname();
  const tableState = useResourceTableState({
    namespace: "${kebab}",
    syncUrl: false,
  });
  // const list = ${hookName}({
  //   page: tableState.page,
  //   pageSize: tableState.pageSize,
  //   sorts: tableState.sorts,
  //   q: tableState.q,
  // });
  const list = {
    rows: [] as ${camelToTitleCase(entityName)}Row[],
    total: 0,
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => {},
  };

  return (
    <PageContainer width="wide" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <TypographyH1>${pluralTitle}</TypographyH1>
        <Link
          href={\`\${pathname}/create\`}
          className={cn(buttonVariants({ variant: "primary", size: "md" }))}
        >
          Create
        </Link>
      </div>
      <ResourceTable
        list={list}
        tableState={tableState}
        columns={columns}
        getRowId={(row) => String(row.id)}
        rowHref={(row) => \`/${kebab}/\${row.id}\`}
      />
    </PageContainer>
  );
};
export default ${camelToTitleCase(entityName)}ListPage;
`;
};

const createEntityTemplate = (
  entityName: string,
  entityPluralName: string,
  createSchema: string,
  typePath: string
) => {
  return `
"use client";

import GenericForm from "@/components/form/generic-form";
import BaseLayout from "@/components/layouts/base-layout";
import { ${createSchema} } from "${typePath}";

const ${camelToTitleCase(entityName)}CreatePage = () => {
  return (
    <BaseLayout backBtnHref="/${camelToKebabCase(entityPluralName)}">
      <GenericForm
        schema={${createSchema}}
        entityName="${camelToTitleCase(entityName)}"
        apiUrl="${camelToKebabCase(entityPluralName)}"
      ></GenericForm>
    </BaseLayout>
  );
};


export default ${camelToTitleCase(entityName)}CreatePage;

    `;
};

const editEntityTemplate = (
  entityName: string,
  entityPluralName: string,
  editSchema: string,
  typePath: string
) => {
  return `
"use client";

import DeleteZone from "@/components/form/delete-zone";
import GenericForm from "@/components/form/generic-form";
import BaseLayout from "@/components/layouts/base-layout";
import { ${editSchema} } from "${typePath}";
import { useParams } from "next/navigation";

const ${camelToTitleCase(entityName)}UpdatePage = () => {
  const { id } = useParams();

  return (
    <BaseLayout backBtnHref={\`/${camelToKebabCase(entityPluralName)}/\${id}\`}>
      <GenericForm
        isEdit={true}
        entityId={String(id)}
        entityName="${camelToTitleCase(entityName)}"
        apiUrl="${camelToKebabCase(entityPluralName)}"
        schema={${editSchema}}
      ></GenericForm>
      <DeleteZone
        validate_input="delete ${entityName}"
        entityName="${camelToTitleCase(entityName)}"
        entityId={String(id)}
        deleteApiUrl="${camelToKebabCase(entityPluralName)}"
        redirectUrl="/${camelToKebabCase(entityPluralName)}"
      ></DeleteZone>
    </BaseLayout>
  );
};

export default ${camelToTitleCase(entityName)}UpdatePage;

`;
};

const detailsEntityTemplate = (
  entityName: string,
  entityPluralName: string,
  typePath: string
) => {
  return `
    "use client";

import { fetchEntity } from "@/client-api/utils";
import DetailsPageLayout from "@/components/layouts/details-page-layout";
import TextSkeleton from "@/components/skeletons/text-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

const ${camelToTitleCase(entityName)}DetailsPage = () => {
  const { id } = useParams();
  const { data, isPending } = useQuery({
    queryKey: ["get${camelToTitleCase(entityName)}", id],
    queryFn: () => fetchEntity("${camelToKebabCase(entityPluralName)}", String(id)),
  });

  return (
    <DetailsPageLayout backBtnHref="/${camelToKebabCase(entityPluralName)}">
      <Card>
        <CardHeader>
          <CardTitle>
            {isPending ? <TextSkeleton></TextSkeleton> : data?.data.data.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>
            {isPending ? (
              <TextSkeleton></TextSkeleton>
            ) : (
              <>{data?.data.data.description}</>
            )}
          </p>
        </CardContent>
      </Card>
    </DetailsPageLayout>
  );
};

export default ${camelToTitleCase(entityName)}DetailsPage;
    `;
};

const createEntity = async (
  entityName: string,
  entityPluralName: string,
  typePathArg?: string,
  createSchemaNameArg?: string,
  editSchemaNameArg?: string
) => {
  let typePath = typePathArg || `@/types/${entityPluralName}`;
  let createSchemaName = createSchemaNameArg || `${entityName}CreateEditSchema`;
  let editSchemaName = editSchemaNameArg || `${entityName}CreateEditSchema`;

  const rootPath = "./src/app/(internal)";
  const entityPath = `${rootPath}/${camelToKebabCase(entityPluralName)}`;
  const createPath = `${entityPath}/create`;
  const editPath = `${entityPath}/[id]/edit`;
  const detailsPath = `${entityPath}/[id]`;
  let isFileAlreadyExists = false;
  [entityPath, createPath, editPath, detailsPath].forEach(async (path) => {
    // make sure folders are not pre-existing
    if (await fse.pathExists(path)) {
      console.log(`${path} already exists`);
      isFileAlreadyExists = true;
    }
  });
  if (isFileAlreadyExists) {
    console.log(`${entityName} already exists`);
    return;
  }

  await fse.outputFile(
    `${createPath}/page.tsx`,
    createEntityTemplate(
      entityName,
      entityPluralName,
      createSchemaName,
      typePath
    )
  );
  await fse.outputFile(
    `${entityPath}/page.tsx`,
    listEntityTemplate(entityName, entityPluralName)
  );
  await fse.outputFile(
    `${entityPath}/create/page.tsx`,
    createEntityTemplate(
      entityName,
      entityPluralName,
      createSchemaName,
      typePath
    )
  );
  await fse.outputFile(
    `${entityPath}/[id]/edit/page.tsx`,
    editEntityTemplate(entityName, entityPluralName, editSchemaName, typePath)
  );
  await fse.outputFile(
    `${entityPath}/[id]/page.tsx`,
    detailsEntityTemplate(entityName, entityPluralName, typePath)
  );
  console.log(`${entityName} created successfully`);
};

const helpFunction = () => {
  console.log(`create-entity.ts
Note: This script will create the following files:
    - \${entityPath}/page.tsx
    - \${entityPath}/create/page.tsx
    - \${entityPath}/[id]/edit/page.tsx
Before running this script, make sure the followings exist:
    - zod schema file in \${typePath}
    - columns registered in @/config/column-defs.ts

Usage: bun create-entity.ts <entity-name> <entity-plural-name> <type-path> <create-schema-name> <edit-schema-name>
Arguments:
    entity-name: The name of the entity. (required) (camel case)
    entity-plural-name: The plural name of the entity. (required) (camel case)
    type-path: The path to the type file. (optional)
    create-schema-name: The name of the create schema. (optional)
    edit-schema-name: The name of the edit schema. (optional)
Commands:
    --help: Show this help message
    `);
};

const getArgs = () => {
  const args = process.argv.slice(2);
  return args;
};

const main = () => {
  const args = getArgs();
  if (args.includes("--help")) {
    helpFunction();
    return;
  }
  if (args.length < 2) {
    helpFunction();
    return;
  }
  const entityName = args[0];
  const entityPluralName = args[1];
  const typePath = args[2];
  const createSchemaName = args[3];
  const editSchemaName = args[4];
  createEntity(
    entityName,
    entityPluralName,
    typePath,
    createSchemaName,
    editSchemaName
  );
};

main();
