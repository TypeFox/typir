# Release Process

The release process is mostly automated and requires running only a few commands. After commiting, pushing, tagging and releasing the changes, a GitHub Action will publish all npm packages.

1. Pull the latest changes from the main branch
2. Create a new branch
3. Uplift the package versions by running `npm version major|minor|patch --no-git-tag-version --workspaces`
4. Update the dependency versions by running `npm run version:dependencies`
5. Create a PR with your updated changes, get a review and merge it
6. Create a version tag on the latest commit on main and push it

    ```bash
    git checkout main
    git pull origin main
    git tag <version-tag>
    git push origin <version-tag>
    ```

7. Create a [GitHub release](https://github.com/TypeFox/typir/releases) from the new tag (this will trigger the Github Action and publish all artifacts automatically).
