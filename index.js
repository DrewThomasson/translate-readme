const { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } = require("fs");
const { join } = require("path");
const core = require("@actions/core");
const $ = require("@k3rn31p4nic/google-translate-api");
const unified = require("unified");
const parse = require("remark-parse");
const stringify = require("remark-stringify");
const visit = require("unist-util-visit");
const simpleGit = require("simple-git");
const { exec } = require("child_process");

const git = simpleGit();

const toAst = (markdown) => {
  return unified().use(parse).parse(markdown);
};

const toMarkdown = (ast) => {
  return unified().use(stringify).stringify(ast);
};

const mainDir = ".";
let README = readdirSync(mainDir).includes("readme.md")
  ? "readme.md"
  : "README.md";
const lang = core.getInput("LANG") || "zh-CN";
const readme = readFileSync(join(mainDir, README), { encoding: "utf8" });
const readmeAST = toAst(readme);
console.log("AST CREATED AND READ");

// Ensure the translations folder exists in the repo root
const translationsDir = join(mainDir, "readme");
if (!existsSync(translationsDir)) {
  mkdirSync(translationsDir);
  console.log(`Created folder: ${translationsDir}`);
}

let originalText = [];

// Traverse the AST and translate text nodes
visit(readmeAST, async (node) => {
  if (node.type === "text") {
    originalText.push(node.value);
    node.value = (await $(node.value, { to: lang })).text;
  }
});

const translatedText = originalText.map(async (text) => {
  return (await $(text, { to: lang })).text;
});

async function writeToFile() {
  await Promise.all(translatedText);
  writeFileSync(
    join(translationsDir, `README.${lang}.md`),
    toMarkdown(readmeAST),
    "utf8"
  );
  console.log(`README.${lang}.md written in the "readme" folder`);
}

async function commitChanges(branchName) {
  console.log("Commit started");
  await git.add("./*");
  await git.addConfig("user.name", "github-actions[bot]");
  await git.addConfig("user.email", "41898282+github-actions[bot]@users.noreply.github.com");
  await git.commit(`docs: Added README."${lang}".md translation via custom action`);
  console.log("Finished commit");
  await git.push("origin", branchName);
  console.log("Pushed branch:", branchName);
}

async function createPR(branchName) {
  console.log("Creating pull request...");
  exec(
    `gh pr create --title "Translate README to ${lang}" --body "This PR adds a translated README for ${lang}." --base main --head ${branchName}`,
    (error, stdout, stderr) => {
      if (error) {
        console.error(`Error creating PR: ${error}`);
        return;
      }
      console.log(`PR created: ${stdout}`);
    }
  );
}

async function translateReadme() {
  try {
    // Use a static branch name based on the language
    const branchName = `readme-translation-${lang}`;
    // Check if the branch exists
    const branches = await git.branch();
    if (branches.all.includes(branchName)) {
      await git.checkout(branchName);
      console.log(`Checked out existing branch: ${branchName}`);
    } else {
      await git.checkoutLocalBranch(branchName);
      console.log(`Created new branch: ${branchName}`);
    }

    await writeToFile();
    await commitChanges(branchName);
    await createPR(branchName);
    console.log("Translation complete and PR created.");
  } catch (error) {
    throw new Error(error);
  }
}

translateReadme();
