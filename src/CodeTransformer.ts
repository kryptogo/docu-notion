import { ListBlockChildrenResponseResult } from "notion-to-md/build/types";

const codeBlockToMarkdown = (text: string, language?: string) => {
  if (language === "plain text") language = "text";
  if (language === "typescript") language = "tsx";

  return `\`\`\`${language ?? ""}
${text}
\`\`\``;
};

export function notionCodeToMarkdown(
  block: ListBlockChildrenResponseResult
): string {
  // @ts-ignore
  const blockContent = block.code.text || block.code.rich_text || [];
  let parsedData = "";
  blockContent.map((content: any) => {
    parsedData += content.plain_text;
  });
  // @ts-ignore
  return codeBlockToMarkdown(parsedData, block.code.language);
}
