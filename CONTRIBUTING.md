# Contributing

Thank you for your interest in this project. Please read this short policy
before contributing.

## We do not accept pull requests

This project is maintained by a small team and **does not accept pull
requests**. Any pull request opened against this repository will be closed
without review, regardless of content or quality.

## How you can contribute

- **Bug reports**: open an issue describing the problem, the steps to
  reproduce it, the browser and version you used, and what you expected to
  happen instead. A saved design JSON or a screenshot helps a lot.
- **Feature suggestions**: open an issue describing the use case first,
  rather than a finished implementation. Proposals are discussed in the
  issue before any code is written by the maintainers.
- **Security issues**: do not open a public issue. Follow the private
  reporting process in [SECURITY.md](SECURITY.md).

## Running the project locally

The app is a static site with no build step and no runtime dependencies:

```sh
python -m http.server 8000   # or any static file server
npm test                     # unit tests (Node built-in test runner)
npm run sw:bump              # required after changing any HTML/CSS/JS/data file
```

You are welcome to fork the repository and modify your fork as you wish,
subject to the [Apache 2.0 license](LICENSE).

## Code of conduct

All project spaces (issues, discussions, email) are covered by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

By submitting a bug report or suggestion, you agree that any resulting
implementation by the maintainers is released under the project's
[Apache 2.0 license](LICENSE).
