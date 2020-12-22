import 'reflect-metadata';
import * as fsSync from 'fs';
import { promises as fs } from 'fs';
import * as path from 'path';

// Import format parsers
import * as json5 from 'json5';
import * as yaml from 'js-yaml';

export declare type AnyParamConstructor<T> = new (...args: any) => T;

type FileFormat = 'json' | 'json5' | 'yaml';

const ConfigPropListKey = Symbol('ConfigPropListKey');

/**
 * Try to guess a fitting parsing function based on a file extension.
 * @param extension File extension. If first character is a period, it will be
 * ignored. The extension is not case sensitive.
 */
function guessParseFunction(extension:string): ((value:string) => any) | null {
  switch (extension.toLowerCase().replace('.', '')) {
    case 'json': return (value) => JSON.parse(value);
    case 'yaml': return (value) => yaml.safeLoad(value, { json: true, schema: yaml.JSON_SCHEMA });
    case 'json5': return (value) => json5.parse(value);
    default: return null;
  }
}

function guessSerializerFunction(extension:string): ((value:any) => string) | null {
  switch (extension.toLowerCase().replace('.', '')) {
    case 'json': return (value) => JSON.stringify(value);
    case 'yaml': return (value) => yaml.safeDump(value, { schema: yaml.JSON_SCHEMA, noCompatMode: true });
    case 'json5': return (value) => json5.stringify(value);
    default: return null;
  }
}

export interface IConfigrReadOptions {
  
}

/**
 * 
 */
export interface IConfigPropOptions {
  /**
   * If set, overrides how the field is serialized to JSON. I.e. if the property
   * itself is named "MyProperty" but you set name to be "myproperty", then the
   * configuration file is expected to contain the latter.
   */
  name?:string;

  /**
   * If set, will be applied as the default value, both when constructing new
   * config objects, as well as when writing a default config file.
   */
  default?: any;

  /**
   * If set, parsing will fail if the property is missing from the source. When
   * writing a default configuration file, a placeholder value wil be put in,
   * referring to expected type.
   */
  required?: boolean;

  /**
   * If set, overrides the default placeholder text for a required property. Has
   * no effect if the property is not required.
   */
  placeholderText?: string;

  description?: string;
}

interface IAugmentedConfigPropOptions extends IConfigPropOptions {
  propertyKey: string | symbol;

  designType: any;
}

/**
 * Wrapped around a user-defined configuration class (that is decorated), an
 * instance of this class enables reading, writing and validation of said class.
 */
export class Configr<T extends AnyParamConstructor<any>> {
  private propList: Required<IAugmentedConfigPropOptions>[] = [];

  // TODO: I'm not entirely sure this type is correct - or the return value.
  // I want this getter to return a type that user-defined code can rely on in
  // case the "original" config schema class isn't available to them.
  public get type():InstanceType<T> {
    return this.ctor.prototype;
  }

  constructor(private ctor: T) {
    this.propList = getConfigPropList(ctor.prototype);

    // console.debug('Constructed handler for class. Got these property names:');
    // console.debug(this.propList.map(l => l.name));
  }

  /**
   * Reads a config file from disk, validates its structure, and returns it as
   * a user-defined configuration object.
   * @param filePath Path of the file to read.
   * @param opts Optional options for the read and verify operations.
   */
  readFromFileSync(filePath: fsSync.PathLike, objArgs?:ConstructorParameters<T>, opts?:IConfigrReadOptions): InstanceType<T> {
    if (!fsSync.existsSync(filePath)) {
      throw new Error(`No file at: ${filePath}`);
    }

    const rawFile:string = fsSync.readFileSync(filePath, 'utf-8');

    return this.fileReaderFn(rawFile, filePath, objArgs, opts);
  }

  /**
   * Asynchronously reads a config file from disk, validates its structure, and
   * returns it as a user-defined configuration object.
   * @param filePath Path of the file to read.
   * @param opts Optional options for the read and verify operations.
   */
  async readFromFile(filePath: fsSync.PathLike, objArgs?:ConstructorParameters<T>, opts?:IConfigrReadOptions): Promise<InstanceType<T>> {
    const stat = fs.stat(filePath);

    if (!(await stat).isFile()) {
      throw new Error(`No file at: ${filePath}`);
    }

    const rawFile:string = await fs.readFile(filePath, 'utf-8');

    return this.fileReaderFn(rawFile, filePath, objArgs, opts);
  }

  private fileReaderFn(rawFile: string, filePath: fsSync.PathLike, objArgs?:ConstructorParameters<T>, opts?:IConfigrReadOptions): InstanceType<T> {
    // Parse the config data using an appropriate parser.
    const extension:string = path.extname(filePath.toString()).toLowerCase();
    const parseFn = guessParseFunction(extension);

    if (!parseFn) {
      throw new Error(`No parser found for file extension "${extension}.`);
    }
    
    // Pass on to the object reader.
    return this.loadFromObject(parseFn(rawFile), objArgs, opts);
  }

  /**
   * Writes a config object to disk.
   * @param obj The object to serialize.
   * @param filePath Target path for the file. Any existing file will be overwritten!
   * @param format Optional, the format to save in. If omitted, will try to
   * guess based on the paths extension, ultimately falling back to 'json'.
   */
  writeToFileSync(obj: T, filePath: fsSync.PathLike, format?: FileFormat): void {
    fsSync.writeFileSync(filePath, this.writeFilePrep(obj, filePath, format));
  }

  /**
   * Writes a config object to disk asynchronously.
   * @param obj The object to serialize.
   * @param filePath Target path for the file. Any existing file will be overwritten!
   * @param format Optional, the format to save in. If omitted, will try to
   * guess based on the paths extension, ultimately falling back to 'json'.
   */
  async writeToFile(obj: T, filePath: fsSync.PathLike, format?: FileFormat): Promise<void> {
    return fs.writeFile(filePath, this.writeFilePrep(obj, filePath, format));
  }

  /**
   * Shared preparation between writeToFile and writeToFileSync.
   * @param obj The object to stringify.
   * @param filePath Full intended path (used as extension fallback).
   * @param format Format to stringify to. If omitted, guesses based on
   * extension or falling entirely back to JSON.
   */
  private writeFilePrep(obj: T, filePath: fsSync.PathLike, format?: FileFormat): string {
    // Create a POJO.
    const writeObj:{ [key:string]: any } = {};
    // Map all decorated properties to the POJO given their names.
    this.propList.forEach(prop => {
      writeObj[prop.name] = Reflect.get(obj, prop.propertyKey);
    });

    // Write the POJO to disk.
    var serializer = guessSerializerFunction(format || path.extname(filePath.toString()));

    // Fallback if no format matched.
    if (!serializer) serializer = JSON.stringify;

    return serializer(writeObj);
  }

  /**
   * Writes a new config file with default values to a given path.
   * @param filePath Where to write the default config file.
   * @param format Target format. @see FileFormat for supported formats.
   */
  writeDefaultSync(filePath: fsSync.PathLike, format?: FileFormat): void {
    fsSync.writeFileSync(filePath, this.serializeDefault(format || path.extname(filePath.toString())));
  }

  /**
   * Asynchronously writes a new config file with default values to a given
   * path.
   * @param filePath Where to write the default config file.
   * @param format Target format. @see FileFormat for supported formats.
   */
  async writeDefault(filePath: fsSync.PathLike, format?: FileFormat): Promise<void> {
    return fs.writeFile(filePath, this.serializeDefault(format || path.extname(filePath.toString())));
  }

  /**
   * Shared code between writeDefaultSync and writeDefault.
   */
  private serializeDefault(format: FileFormat | string = 'json'): string {
    const outObj: { [key:string]: any } = {};

    this.propList.forEach(prop => {
      if (prop.default) {
        outObj[prop.name] = prop.default;
      } else if (prop.required) {
        outObj[prop.name] = prop.placeholderText || `REQUIRED FIELD (${prop.designType.name.toLowerCase()})`;
      }
    });

    const serializer = guessSerializerFunction(format) || JSON.stringify;
    return serializer(outObj);
  }

  /**
   * Validates a configuration object.
   * @param obj The configuration object to validate.
   */
  isValid(obj: T): boolean {
    // TODO: This is very bad programming practice, null pointer kind of stuff.
    // Improve it.
    const _obj:any = <any>obj;
    return this.propList.every((prop) => {
      Reflect.has(_obj, prop.propertyKey)
    });
  }

  loadFromObject(obj: any, objArgs?:ConstructorParameters<T>, opts?:IConfigrReadOptions): InstanceType<T> {
    const missingProperties:string[] = [];

    // Construct a new config object.
    var cfgObj:InstanceType<T>;
    if (objArgs)
      cfgObj = Reflect.construct(this.ctor, objArgs);
    else
      cfgObj = Reflect.construct(this.ctor, []);

    // Inject config data into the new object.
    this.propList.forEach(prop => {
      // if (Reflect.get(cfgObj, prop.propertyKey))
      //   console.warn(`The property ${prop.propertyKey.toString()} already has a value! It will be overridden.`);

      // Missing required property.
      if (prop.required && !Reflect.has(obj, prop.name))
        missingProperties.push(prop.name);

      if (missingProperties.length)
        throw new Error(`Missing properties in source data: ${missingProperties.join(',')}`);

      Reflect.set(cfgObj, prop.propertyKey, obj[prop.name] || prop.default);
    });
    return cfgObj;
  }
}

/**
 * 
 * @param opts 
 */
export function Prop<T>(opts?: IConfigPropOptions): any {
  return (
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>
  ):void => {
    addToPropList(propertyKey, target, opts);
  }
}

/// Adds a property to the list of config properties.
function addToPropList(propertyKey: string | symbol, target: any, propertyOptions?:IConfigPropOptions): void {
  ensurePropList(target);

  const newProps:IAugmentedConfigPropOptions = {
    ... propertyOptions,
    propertyKey,
    designType: Reflect.getMetadata('design:type', target, propertyKey),
  };

  if (!newProps.name) {
    // If a name wasn't defined, use the propertyname in string form.
    // TODO: MAKE SURE THIS WORKS WITH SYMBOLS.
    newProps.name = propertyKey.toString();
  }

  (<IAugmentedConfigPropOptions[]>Reflect.getMetadata(ConfigPropListKey, target)).push(newProps);
}

/// Makes sure the list of config properties has been defined.
function ensurePropList(target:any):void {
  if (!Reflect.hasMetadata(ConfigPropListKey, target)) {
    Reflect.defineMetadata(ConfigPropListKey, [], target);
  }
}

/// Retrieves the current list of config properties.
function getConfigPropList(target:any):Required<IAugmentedConfigPropOptions>[] {
  return Reflect.getMetadata(ConfigPropListKey, target);
}