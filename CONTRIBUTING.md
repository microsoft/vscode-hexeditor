# Contributing to Visual Studio Code Hex Editor
There are many ways to contribute to the Visual Studio Code Hex Editor project: logging bugs, submitting pull requests, reporting issues, and creating suggestions.

After cloning and building the repo, check out the [issues list](https://github.com/microsoft/vscode-hexeditor/issues?q=is%3Aissue+is%3Aopen+).


### Getting the sources

First, fork the VS Code Hex Editor repository so that you can make a pull request. Then, clone your fork locally:

```
git clone https://github.com/<<<your-github-account>>>/vscode-hexeditor.git
```

Occasionally you will want to merge changes in the upstream repository (the official code repo) with your fork.

```
cd vscode-hexeditor
git checkout main
git pull https://github.com/microsoft/vscode-hexeditor.git main
```

Manage any merge conflicts, commit them, and then push them to your fork.

## Prerequisites

In order to download necessary tools, clone the repository, and install dependencies via `yarn` you need network access.

You'll need the following tools:

- [Git](https://git-scm.com)
- [Node.JS](https://nodejs.org/en/), **x64**, version `>= 12.x`

```
cd vscode-hexeditor
npm install
```

## Build and Run

After cloning the extension and running `npm install` execute `npm run webpack-watch` to initiate webpack's file watcher and then use the debugger in VS Code to execute "Run Extension".

### Linting
We use [eslint](https://eslint.org/) for linting our sources. You can run eslint across the sources by calling `npm run lint` from a terminal or command prompt.
To lint the source as you make changes you can install the [eslint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint).

## Work Branches
Even if you have push rights on the Microsoft/vscode-hexeditor repository, you should create a personal fork and create feature branches there when you need them. This keeps the main repository clean and your personal workflow cruft out of sight.

## Pull Requests
Before we can accept a pull request from you, you'll need to sign a [Contributor License Agreement (CLA)](https://cla.opensource.microsoft.com/microsoft/vscode-hexeditor). It is an automated process and you only need to do it once.

To enable us to quickly review and accept your pull requests, always create one pull request per issue and [link the issue in the pull request](https://github.com/blog/957-introducing-issue-mentions). Never merge multiple requests in one unless they have the same root cause. Be sure to keep code changes as small as possible. Avoid pure formatting changes to code that has not been modified otherwise. Pull requests should contain tests whenever possible.

## Suggestions
We're also interested in your feedback for the future of the hex editor. You can submit a suggestion or feature request through the issue tracker. To make this process more effective, we're asking that these include more information to help define them more clearly.

## Discussion Etiquette

In order to keep the conversation clear and transparent, please limit discussion to English and keep things on topic with the issue. Be considerate to others and try to be courteous and professional at all times.
