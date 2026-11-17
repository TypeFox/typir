import fs from 'fs-extra';
import { getVersionOf, getPath } from './shared.js';

async function runCheck() {
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
    const manifest = await fs.readJson(path);
    let success = true;
    for (const [dependency, version] of versions) {
        for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
            const declared = manifest[section]?.[dependency];
            if (declared !== undefined) {
                const actual = declared.replace(/^[~^]/, '');
                if (actual !== version) {
                    console.log(`Version mismatch for ${dependency}: expected ${version}, found ${actual} !`);
                    success = false;
                }
            }
        }
    }
    return success;
}

if(!await runCheck()) {
    process.exit(1);
}
