import * as fs from "fs-extra";

import { NotionToMarkdown } from "notion-to-md";
import { HierarchicalNamedLayoutStrategy } from "./HierarchicalNamedLayoutStrategy";
import { LayoutStrategy } from "./LayoutStrategy";
import { initNotionClient, NotionPage, PageType } from "./NotionPage";
import {
  initImageHandling,
  cleanupOldImages,
  markdownToMDImageTransformer,
} from "./images";

import { tweakForDocusaurus } from "./DocusaurusTweaks";
import { setupCustomTransformers } from "./CustomTranformers";
import * as Path from "path";
import { error, info, logDebug, verbose, warning } from "./log";
import { convertInternalLinks } from "./links";
import { ListBlockChildrenResponseResult } from "notion-to-md/build/types";

export type Options = {
  notionToken: string;
  rootPage: string;
  locales: string[];
  markdownOutputPath: string;
  imgOutputPath: string;
  imgPrefixInMarkdown: string;
  statusTag: string;
};

let options: Options;
// let currentSidebarPosition = 0;
let layoutStrategy: LayoutStrategy;
let notionToMarkdown: NotionToMarkdown;
const pages = new Array<NotionPage>();

export async function notionPull(incomingOptions: Options): Promise<void> {
  options = incomingOptions;

  // It's helpful when troubleshooting CI secrets and environment variables to see what options actually made it to docu-notion.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const optionsForLogging = { ...incomingOptions };
  // Just show the first few letters of the notion token, which start with "secret" anyhow.
  optionsForLogging.notionToken =
    optionsForLogging.notionToken.substring(0, 3) + "...";

  verbose(JSON.stringify(optionsForLogging, null, 2));
  await initImageHandling(
    options.imgPrefixInMarkdown || options.imgOutputPath || "",
    options.imgOutputPath || "",
    options.locales
  );

  const notionClient = initNotionClient(options.notionToken);
  notionToMarkdown = new NotionToMarkdown({ notionClient });
  setupCustomTransformers(notionToMarkdown, notionClient);
  layoutStrategy = new HierarchicalNamedLayoutStrategy();

  await fs.mkdir(options.markdownOutputPath, { recursive: true });
  layoutStrategy.setRootDirectoryForMarkdown(options.markdownOutputPath);

  info("Connecting to Notion...");
  // About the complication here of getting all the pages first and then output
  // them all. It would be simpler to just do it all in one pass, however the
  // two passes are required in order to change links between
  // pages in Notion to be changed to point to the equivalent page
  // in the markdown. Unless the LayoutStrategy we're using does not
  // introduce any hierarchy in the resulting page urls, we can't
  // do this link fixing until we've already seen all the pages and
  // figured out what their eventual relative url will be.
  await getPagesRecursively("", options.rootPage, true);
  logDebug("getPagesRecursively", JSON.stringify(pages, null, 2));
  await outputPages(pages);
  await layoutStrategy.cleanupOldFiles();
  await cleanupOldImages();
}

async function outputPages(pages: Array<NotionPage>) {
  for (const page of pages) {
    await outputPage(page);
  }
}

// This walks the "Outline" page and creates a list of all the nodes that will
// be in the sidebar, including the directories, the pages that are linked to
// that are parented in from the "Database", and any pages we find in the
// outline that contain content (which we call "Simple" pages). Later, we can
// then step through this list creating the files we need, and, crucially, be
// able to figure out what the url will be for any links between content pages.
async function getPagesRecursively(
  incomingContext: string,
  pageId: string,
  rootLevel: boolean
) {
  const pageInTheOutline = await NotionPage.fromPageId(incomingContext, pageId);

  info(
    `Reading Outline Page ${incomingContext}/${pageInTheOutline.nameOrTitle}`
  );

  const pageInfo = await pageInTheOutline.getContentInfo();

  if (!rootLevel && pageInfo.hasParagraphs && pageInfo.childPages.length) {
    error(
      `Skipping "${pageInTheOutline.nameOrTitle}"  and its children. docu-notion does not support pages that are both levels and have content at the same time.`
    );

    return;
  }
  if (!rootLevel && pageInfo.hasParagraphs) {
    pages.push(pageInTheOutline);

    // The best practice is to keep content pages in the "database" (kanban), but we do allow people to make pages in the outline directly.
    // So how can we tell the difference between a page that is supposed to be content and one that is meant to form the sidebar? If it
    // have just links, then it's a page for forming the sidebar. If it has contents and no links, then it's a content page. But what if
    // it has both? Well then we assume it's a content page.
    if (pageInfo.linksPages?.length) {
      warning(
        `Note: The page "${pageInTheOutline.nameOrTitle}" is in the outline, has content, and also points at other pages. It will be treated as a simple content page. This is no problem, unless you intended to have all your content pages in the database (kanban workflow) section.`
      );
    }
  }
  // a normal outline page that exists just to create the level, pointing at database pages that belong in this level
  else if (pageInfo.childPages.length || pageInfo.linksPages.length) {
    let context = incomingContext;
    // don't make a level for "Outline" page at the root
    if (!rootLevel && pageInTheOutline.nameOrTitle !== "Outline") {
      context = layoutStrategy.newLevel(
        options.markdownOutputPath,
        incomingContext,
        pageInTheOutline.nameOrTitle
      );
    }
    for (const id of pageInfo.childPages) {
      await getPagesRecursively(context, id, false);
    }

    for (const id of pageInfo.linksPages) {
      pages.push(await NotionPage.fromPageId(context, id));
    }
  } else {
    console.info(
      warning(
        `Warning: The page "${pageInTheOutline.nameOrTitle}" is in the outline but appears to not have content, links to other pages, or child pages. It will be skipped.`
      )
    );
  }
}

async function outputPage(page: NotionPage) {
  if (
    page.type === PageType.DatabasePage &&
    options.statusTag != "*" &&
    page.status !== options.statusTag
  ) {
    verbose(
      `Skipping page because status is not '${options.statusTag}': ${page.nameOrTitle}`
    );
    return;
  }

  info(`Reading Page ${page.context}/${page.nameOrTitle}`);
  layoutStrategy.pageWasSeen(page);

  const mdPath = layoutStrategy.getPathForPage(page, ".md");
  const directoryContainingMarkdown = Path.dirname(mdPath);

  const blocks = (await page.getBlockChildren()).results;

  const relativePathToFolderContainingPage = Path.dirname(
    layoutStrategy.getLinkPathForPage(page)
  );
  logDebug("pull", JSON.stringify(blocks));

  // currentSidebarPosition++;

  // we have to set this one up for each page because we need to
  // give it two extra parameters that are context for each page
  notionToMarkdown.setCustomTransformer(
    "image",
    (block: ListBlockChildrenResponseResult) =>
      markdownToMDImageTransformer(
        block,
        directoryContainingMarkdown,
        relativePathToFolderContainingPage
      )
  );
  const mdBlocks = await notionToMarkdown.blocksToMarkdown(blocks);

  // let frontmatter = "---\n";
  // frontmatter += `title: ${page.nameOrTitle.replaceAll(":", "&#58;")}\n`; // markdown can't handle the ":" here
  // frontmatter += `sidebar_position: ${currentSidebarPosition}\n`;
  // frontmatter += `slug: ${page.slug ?? ""}\n`;
  // if (page.keywords) frontmatter += `keywords: [${page.keywords}]\n`;
  // frontmatter += "---\n";

  let markdown = notionToMarkdown.toMarkdownString(mdBlocks);

  // Improve: maybe this could be another markdown-to-md "custom transformer"
  markdown = await convertInternalLinks(markdown, pages, layoutStrategy);

  // Improve: maybe this could be another markdown-to-md "custom transformer"
  const { body, imports } = tweakForDocusaurus(markdown);
  // const output = `${frontmatter}\n${imports}\n${body}`;
  const output = `${imports}\n${body}`;

  fs.writeFileSync(mdPath, output, {});
}
