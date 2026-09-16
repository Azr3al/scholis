import type { JSONContent } from "@tiptap/core";
import { Editor, generateHTML } from "@tiptap/core";
import { parseTemplate } from "./template_parser";
import {
  defaultEditorOptions,
  emailRenderOptions,
} from "@/components/editor/config";
import { htmlHeaderString } from "./misc";

const getVariablesFromContent = (content: JSONContent[]) => {
  const variableRegex = /(?<!\\)\$\w+/g;

  const variables: string[] = [];
  content.forEach((node) => {
    if (node.type === "text") {
      // variables start with $
      const matches = node.text?.match(variableRegex);
      if (!matches) return [];
      matches.forEach((match) => {
        variables.push(match.slice(1));
      });
    } else {
      if (node.content) {
        const v = getVariablesFromContent(node.content);
        v.forEach((variable) => {
          variables.push(variable);
        });
      }
    }
  });
  return variables;
};

export const validateContent = (
  content: JSONContent[],
  dataRow: Record<string, string>
) => {
  const variables = getVariablesFromContent(content);
  console.log(content);
  const validVariables = Object.keys(dataRow);
  const missingKeys = variables.filter(
    (variable) => !validVariables.includes(variable)
  );
  console.log(missingKeys);

  return missingKeys;
};

const populateContent = (
  content: JSONContent[],
  dataRow: Record<string, string>
) => {
  // recursively iterate through the content and change the text nodes
  content.forEach((node) => {
    if (node.type === "text") {
      node.text = parseTemplate(node.text || "", dataRow);
    } else {
      if (node.content) {
        populateContent(node.content, dataRow);
      }
    }
  });
  return content;
};
export const getHTMLContent = (content: JSONContent[]) => {
  return `${htmlHeaderString}
  ${generateHTML(
    {
      type: "doc",
      content,
    },
    emailRenderOptions.extensions!
  )}
  <p>This is an automatically generated email. Please do not reply to this.</p>
  </body>
  </html>
  `;
};

export const getPopulatedEmailTemplate = (
  editor: Editor,
  dataRow: Record<string, string>
) => {
  const populatedContent = populateContent(editor.getJSON().content!, dataRow);
  const htmlTemplate = getHTMLContent(populatedContent);
  return {
    json: {
      type: "doc",
      content: populatedContent,
    },
    html: htmlTemplate,
  };
};
