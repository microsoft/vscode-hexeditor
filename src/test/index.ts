import Mocha from "mocha";

const fileImports = [
	() => import("./backup.test"),
	() => import("./hexDocumentModel.test"),
];

export async function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: "bdd",
		color: true,
	});

	for (const doImport of fileImports) {
		mocha.suite.emit(Mocha.Suite.constants.EVENT_FILE_PRE_REQUIRE, global, doImport, mocha);
		await doImport();
		mocha.suite.emit(Mocha.Suite.constants.EVENT_FILE_REQUIRE, {}, doImport, mocha);
		mocha.suite.emit(Mocha.Suite.constants.EVENT_FILE_POST_REQUIRE, global, doImport, mocha);
	}

	return new Promise((c, e) => {

		mocha.run(failures => {
			if (failures > 0) {
				e(new Error(`${failures} tests failed.`));
			} else {
				c();
			}
		});
	});
}
