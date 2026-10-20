# Release Process

The release process is mostly automated and requires running only a few commands. After commiting, pushing the changes to `main`, a GitHub Action will publish all npm packages. But only if `package.json` files are updated in their version field.

1. Pull the latest changes from the main branch
2. Create a new branch
3. Uplift the package versions by running `npm version major|minor|patch --no-git-tag-version --workspaces`
4. Update the dependency versions by running `npm run version:dependencies`
5. Create a PR with your updated changes, get a review and merge it
6. The publish process will be triggered automatically when the `package.json` files are updated
   * when making changes in the scope of a PR, the publish process will be executed in dry-run mode
   * when the changes are merged into the main branch, the NPM packages will be published automatically
7. (optional) Create a version tag on the latest commit on main and push it

    ```bash
    git checkout main
    git pull origin main
    git tag <version-tag>
    git push origin <version-tag>
    ```
