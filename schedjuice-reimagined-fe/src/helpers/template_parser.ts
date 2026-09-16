// Supports both {{variable}} and $variable syntax
// make sure the data object contains all possible variables
export const parseTemplate = (
  template: string,
  dataRow: Record<string, string>
): string => {
  const curlyBraceRegex = /\{\{(\w+)\}\}/g;
  const dollarSignRegex = /(?<!\\)\$\w+/g;
  
  let result = template.replace(curlyBraceRegex, (match, variable) => {
    return dataRow[variable] || match;
  });
  
  result = result.replace(dollarSignRegex, (match) => {
    const variable = match.slice(1);
    return dataRow[variable] || match;
  });
  
  return result;
};

// in a give string, check all the variables declared are in the data object's keys
// this function returns a list of missing keys
export const checkVariables = (
  template: string,
  // the first non-header row of a csv file
  dataRow: Record<string, string>
): string[] => {
  const curlyBraceRegex = /\{\{(\w+)\}\}/g;
  const dollarSignRegex = /(?<!\\)\$\w+/g;
  
  const curlyMatches = template.match(curlyBraceRegex);
  const dollarMatches = template.match(dollarSignRegex);
  
  const missingVariables: string[] = [];
  
  if (curlyMatches) {
    curlyMatches.forEach((match) => {
      const variable = match.slice(2, -2);
      if (!dataRow[variable]) {
        missingVariables.push(variable);
      }
    });
  }
  
  if (dollarMatches) {
    dollarMatches.forEach((match) => {
      const variable = match.slice(1);
      if (!dataRow[variable]) {
        missingVariables.push(variable);
      }
    });
  }
  
  return Array.from(new Set(missingVariables));
};
