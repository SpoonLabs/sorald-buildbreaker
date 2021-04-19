# sorald-buildbreaker

This action runs [Sorald](https://github.com/SpoonLabs/sorald) and breaks the
build if any repairable violations are found.

## Inputs

### `source`

**Required** Path to the source code directory to analyze.

### `sorald-jar-url`

URL to the Sorald JAR to download and use.

> **Note:** This option is deprecated and will be removed, see
> [this issue](https://github.com/SpoonLabs/sorald-buildbreaker/issues/7)

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
