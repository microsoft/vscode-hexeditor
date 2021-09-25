/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../..');

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(extensionDevelopmentPath, 'dist/test.js');

    const basedir = path.resolve(__dirname, '../..');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        basedir,
				'--disableExtensions',
				'--skip-getting-started',
        '--disable-user-env-probe',
        '--disable-workspace-trust',
      ],
    });
  } catch (err) {
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
