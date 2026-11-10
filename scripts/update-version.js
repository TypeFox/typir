import fs from 'fs-extra';
import { getVersionOf, getPath } from './shared.js';

async function runUpdate() {
    const versions = await Promise.all([
        getVersionOf('typir'),
        getVersionOf('typir-langium'),
    ]);
    await Promise.all([
        replaceAll('typir', true, versions),
        replaceAll('typir-langium', true, versions),
        replaceAll('expression', false, versions),
        replaceAll('ox', false, versions),
        replaceAll('lox', false, versions),
    ]);
}

async function replaceAll(project, pkg, versions) {
    const path = getPath(project, pkg);
    let content = await fs.readFile(path, 'utf-8');
    versions.forEach(([project, version]) => {
        const regex = new RegExp("(?<=\"" + project + "\": \"[~\\^]?)\\d+\\.\\d+\\.\\d+", "g");
        content = content.replace(regex, version);
    });
    await fs.writeFile(path, content);
}

runUpdate();
