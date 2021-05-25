# sorald-buildbreaker

This action runs [Sorald](https://github.com/SpoonLabs/sorald) and breaks the
build if any repairable violations are found.

## Inputs

### `source`

**Required** Path to the source code directory to analyze.

### `ratchet-from`

Commit-ish to ratchet from, such that only the changed lines between the head
commit and the `ratchet-from` commit-ish are considered by this action. In
other words, only changed lines between the head commit and the ratchet point
are considered.

A typical value for this would be a reference to the primary branch, which is
almost always `'origin/main'` or `'origin/master'`. When `sorald-buildbreaker`
runs on pull requests, this has the effect of only acting upon violations that
are contained within the changed lines of the pull request.

### `suggestions-token`

A token to post pull request suggestions with. If provided,
`sorald-buildbreaker` will use it to post pull request review comments with
Sorald's repairs as suggestions.

Typically, this should be provided with the `secrets.GITHUB_TOKEN`.

```yaml
  with:
    suggestions-token: ${{ secrets.GITHUB_TOKEN }}
```

## Outputs

There are no outputs at this time.

## Example usage

We currently only fully support running this Action with `ubuntu-latest`. A
minimal configuration is given below.

```
name: sorald-buildbreaker

on:
  pull_request:
  push:
    branches: master 

jobs:
  buildbreaker:
    runs-on: ubuntu-latest
    name: Run Sorald Buildbreaker
    steps:
      - name: Checkout project
        uses: actions/checkout@v2
      - name: Run Sorald Buildbreaker
        uses: SpoonLabs/sorald-buildbreaker@307ad54331c3428adf0e5816a2b32591a0543b04
        with:
          source: 'src/main/java'
```
