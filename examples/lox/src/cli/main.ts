/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Command } from "commander";
import { LoxLanguageMetaData } from "../language/generated/module.js";
import { extractDestinationAndName } from "./cli-util.js";
import * as url from "node:url";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as fs from "node:fs";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

const packagePath = path.resolve(__dirname, "..", "..", "package.json");
const packageContent = await fsp.readFile(packagePath, "utf-8");

export const generateAction = async (
    fileName: string,
    opts: GenerateOptions,
): Promise<void> => {
    // const services = createOxServices(NodeFileSystem).Ox;
    // const program = await extractAstNode<OxProgram>(fileName, services);

    const filePathData = extractDestinationAndName(fileName, opts.destination);
    if (!fs.existsSync(filePathData.destination)) {
        fs.mkdirSync(filePathData.destination, { recursive: true });
    }
};

export type GenerateOptions = {
    destination?: string;
};

export default function(): void {
    const program = new Command();

    program.version(JSON.parse(packageContent).version);

    const fileExtensions = LoxLanguageMetaData.fileExtensions.join(", ");
    program
        .command("generate")
        .argument(
            "<file>",
            `source file (possible file extensions: ${fileExtensions})`,
        )
        .option(
            "-d, --destination <dir>",
            "destination directory of generating",
        )
        .description("generates <SMTH> from the source file")
        .action(generateAction);

    program.parse(process.argv);
}
