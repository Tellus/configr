# @specialminds/configr
A small library to help you write better config files. Uses reflect-metadata to read, write, and validate JSON config files based on classes.

*This is **not** the same as the [configr](https://github.com/antz29/node-configr) package in npm. Just a happy coincidence.*

## Installation

Add the package `@specialminds/configr` to your project.

Yarn: `yarn add @specialminds/configr`
NPM: `npm i --save @specialminds/configr`

We use semantic versioning, so be prepared for breaking API changes up to 1.0.0. We *expect* the worst will be naming of functions, but cannot guarantee it.

## Usage

Configr bases itself on configurations defined as TypeScript classes. Decorate
the properties you want to read/write to JSON config files, and let Configr
handle the rest.

Example:

```typescript
import { Configr } from '@specialminds/configr';

class MyConfigurationClass {
  @Prop({
    default: 8080,
  })
  serverPort!: number;

  @Prop({
    required: true,
  })
  tokenSecret!: string;
}

const betterConfig = new Configr(MyConfigurationClass);

// Parse from an object you've already got.
// Will throw because you're missing 'tokenSecret'.
betterConfig.parseJson({
  serverPort: 9191,
});

// Read a config file from disk. This call optionally takes any constructor
// parameters that your configuration class may require.
const cfg = betterConfig.readFromFileSync('./config.json');

console.debug(cfg.serverPort);

cfg.serverPort = 10001;

betterConfig.writeToFileSync(cfg, '/config.json');
```

## Final thoughts

The library is a first implementation and there's a lot of room to grow.
However, we want to keep the project relatively lean, a statically typed and
easy-to-use way to manage configurations for your applications.

### Future ideas ("roadmap")

- Full testing suite.
- read/write to file directly on the augmented config object.
- Asynchronous methods.
- Additional features on decorators (validators, parsers, transformers, proper support for full objects in structure).
- Improvements to documentation
- ???