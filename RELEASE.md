# Release Process

## `latest` releases

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


## `next` releases

The release process for `next` releases is different from the `latest` releases. We configured a GitHub action to publish the `next` packages. It has to be called manually (it is a `workflow_dispatch`). This will release the current state of `main`. Follow these steps to release a `next` version:

1. Go to the Actions tab of your repository.
2. On the left there is a list of workflows. Click the one with the title "Publish `next`".
3. A blue ribbon will appear, stating `This workflow has a workflow_dispatch event trigger.`.
4. Click the button `Run workflow` from the ribbon.
5. A popup will appear, asking you for which branch you want to run the workflow. Select `main` and click the button `Run workflow`.

Hint: What happens behind the scene is:

1. The action calls `npm run version:next` for each workspace package.
2. Then it calls `npm run version:dependencies` to update the dependencies.
3. Then it calls `npm run publish:next` to publish the updated packages.
4. The action discards all changes afterwards, no changes will be committed or pushed to the repository.
