# Release Process

The release process is mostly automated and requires running only a few commands. After commiting, pushing, tagging and releasing the changes, a GitHub Action will publish all npm packages.

1. Pull the latest changes
2. Uplift the package versions
   Run `npm version major|minor|patch --no-git-tag-version --workspaces`
3. Update the dependency versions
   Run `npm run version:dependencies`
4. Create a PR with your updated changes, get a review and merge it
5. Create a version tag on the latest commit on main and push it
6. Create a GitHub release from the new tag (this will automatically publish all artifacts)
