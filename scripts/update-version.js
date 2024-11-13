import fs from 'fs-extra';
import path from 'path';

async function runUpdate() {
    const langiumPath = getPath('typir', true);
    const langiumPackage = await fs.readJson(langiumPath);
    const version = langiumPackage.version;
    await Promise.all([
        replaceAll('typir', true, version),
        replaceAll('typir-langium', true, version),
        replaceAll('ox', false, version),
        replaceAll('lox', false, version),
    ]);
}

async function replaceAll(project, pkg, version) {
    const path = getPath(project, pkg);
    let content = await fs.readFile(path, 'utf-8');
    content = content
        .replace(/(?<="typir": "[~\^]?)\d+\.\d+\.\d+/g, version)
        .replace(/(?<="typir-langium": "[~\^]?)\d+\.\d+\.\d+/g, version)
    await fs.writeFile(path, content);
}

function getPath(project, pkg) {
    return path.join(pkg ? 'packages' : 'examples', project, 'package.json');
}

runUpdate();
