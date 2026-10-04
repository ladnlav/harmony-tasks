# Contributing to Harmony Tasks

Thanks for your interest in improving Harmony Tasks!

Harmony Tasks is a fork of [BeautyTasks](https://github.com/avnibilgin/BeautyTasks). Please report
anything about this fork here, not upstream.

## Ideas and bug reports

**Ideas and bugs are welcome through
[GitHub issues](https://github.com/ladnlav/harmony-tasks/issues).**

- Search [existing issues](https://github.com/ladnlav/harmony-tasks/issues) first.
- For **bugs**, include: Harmony Tasks version, Obsidian version, OS/platform (desktop or
  mobile), steps to reproduce, and what you expected vs. what happened. A screenshot or a
  short screen recording helps a lot.
- For **feature requests**, describe the problem you're trying to solve, not just the
  solution — it makes it easier to find the best fit.

## Building from source

**Prerequisites:** [Node.js](https://nodejs.org) 20+ and npm.

```bash
npm install       # install dependencies
npm run dev       # esbuild in watch mode (rebuilds main.js on save)
npm run build     # type-check + production bundle
npm run lint      # eslint, mirrors the Obsidian community scanner
npm test          # vitest
```

The plugin's source lives in `src/` and bundles to `main.js`. To try a build in a real
vault, work directly inside a test vault's `.obsidian/plugins/harmony-tasks/` folder (the
[Hot-Reload plugin](https://github.com/pjeby/hot-reload) picks up rebuilds automatically),
or copy `main.js`, `manifest.json` and `styles.css` into that folder and reload Obsidian.

## License

Harmony Tasks is released under the [MIT License](LICENSE).
