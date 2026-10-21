import fs from 'fs-extra';
import path from 'path';

async function runUpdate() {
    const versions = await Promise.all([
        getVersionOf('typir'),
        getVersionOf('typir-langium'),
    ]);
    const successes = await Promise.all([
        checkAll('typir', true, versions),
        checkAll('typir-langium', true, versions),
        checkAll('expression', false, versions),
        checkAll('ox', false, versions),
        checkAll('lox', false, versions),
    ]);
    return successes.reduce((acc, curr) => acc && curr, true);
}

async function checkAll(project, pkg, versions) {
    const path = getPath(project, pkg);
    const content = await fs.readFile(path, 'utf-8');
    let success = true;
    versions.forEach(([project, version]) => {
        const regex = new RegExp("(?<=\"" + project + "\": \"[~\\^]?)(\\d+\\.\\d+\\.\\d+)", "g");
        const matches = content.match(regex);
        if(matches) {
            for (const match of matches) {
                if(match !== version) {
                    console.log(`Version mismatch for ${project}: expected ${version}, found ${match} !`);
                    success = false;
                }
            }
        }
    });
    return success;
}

function getPath(project, pkg) {
    return path.join(pkg ? 'packages' : 'examples', project, 'package.json');
}

async function getVersionOf(project) {
    const typirPath = getPath(project, true);
    const typirPackage = await fs.readJson(typirPath);
    return [project, typirPackage.version];
}

if(!await runUpdate()) {
    process.exit(1);
}
