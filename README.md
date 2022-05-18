# notion-pull

notion-pull lets you use Notion as your editor for markdown-based static site generators like [Docusaurus](https://docusaurus.io/). Using Notion instead of raw markdown files means that you don't have to teach non-developers how to make git commits and PRs. It also allows you to leverage Notion's database tools to control workflow, commenting feature to discuss changes, etc.

## 1. Set up your documentation site.

First, prepare your markdown-based static file system like [Docusaurus](https://docusaurus.io/). You can then use notion-pull to populate your repository with markdown files and images.

## 2. In Notion, create page to serve as the root of your documentation

You can name it anything you like, e.g. "Documentation Root".

## 3. Create a Notion Integration

Follow [these instructions](https://developers.notion.com/docs/getting-started) to make an "integration" and get your token. Limit your integration to "READ" access.

## 4. "Invite" your Notion Integration to read you page

In Notion, click "Share" on the root of your documentation and "invite" your integration to it.

![image](https://user-images.githubusercontent.com/8448/168930238-1dcf46df-a690-4839-bf4c-c63157f104d8.png)

## 5. Under your documentation root, add a page named "Outline"

## 6. Add your pages under your Outline page.

Currently, notion-pull expects that each page has only one of the following: subpages, links to other pages, or normal content. Do not mix them.

## 7. Pull your pages

First, determine the id of your root page by clicking "Share" and looking at the the url it gives you. E.g.
https://www.notion.so/hattonjohn/My-Docs-0456aa5842946bdbea3a4f37c97a0e5
means that the id is "0456aa5842946PRETEND4f37c97a0e5".

**Be Careful:** notion-pull will delete the markdown output directory before starting.

notion-pull does not delete the image directory because it avoids re-downloading an image if you already have the image from a previous run. The downside of this is that if you delete or replace an image in Notion, notion-pull isn't yet smart enough to remove your local copy.

Determine where you want the markdown files and images to land. The following works well for Docusaurus instances:

```
npx notion-pull -n secret_PRETEND123456789PRETEND123456789PRETEND6789 -r 0456aa5842946PRETEND4f37c97a0e5 -m "./docs" -i "./images"
```

Likely, you will want to store these codes in your environment variables and then use them like this:

```
npx notion-pull -n %MY_NOTION_TOKEN% -r %MY_NOTION_DOCS_ROOT_PAGE_ID% -m "./docs" -i "./static/notion_images"
```

## 8. Commit (or not)

It's up to you whether you want to keep these files in the git history of your site. If you don't, `.gitignore` the two output directories.

# Advanced: using a Notion database

One of the big attractions of Notion for large documentation projects is that you can treat your pages as database items. The advantage of this is that they can then have metadata properties that fit your workflow. For example, we use a simple kanban board view to see where each page is in our workflow:

![image](https://user-images.githubusercontent.com/8448/168929745-e6529375-bb1e-47e9-b8a6-7a1467c8900f.png)

`notion-pull` supports this by letting you link to database pages from your outline.

![image](https://user-images.githubusercontent.com/8448/168929668-f83d7c86-75d2-48e9-940c-84c5268a2854.png)

# Localization

Localize your files in Crowdin (or whatever) based on the markdown files, not in Notion. For how to do this with Docusaurus, see [Docusaurus i18n](https://docusaurus.io/docs/i18n/crowdin).
