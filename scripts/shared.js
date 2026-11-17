import fs from 'fs-extra';
import path from 'node:path';

export function getPath(project, pkg) {
    return path.join(pkg ? 'packages' : 'examples', project, 'package.json');
}
export async function getVersionOf(project) {
    const typirPath = getPath(project, true);
    const typirPackage = await fs.readJson(typirPath);
    return [project, typirPackage.version];
}
