import 'reflect-metadata';
import * as _ from 'lodash';
import * as fsSync from 'fs';

export declare type AnyParamConstructor<T> = new (...args: any) => T;

const ConfigPropListKey = Symbol('ConfigPropListKey');

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
   * @param path Path of the file to read.
   * @param opts Optional options for the read and verify operations.
   */
  readFromFileSync(path: fsSync.PathLike, objArgs?:ConstructorParameters<T>, opts?:IConfigrReadOptions): InstanceType<T> {
    // Parse JSON data from the config file.
    const obj:any = JSON.parse(fsSync.readFileSync(path).toString());
    // Pass on to the JSON-specific parser.
    return this.parseJson(obj, objArgs, opts);
  }

  writeToFileSync(obj: T, path: fsSync.PathLike): void {
    // Create a POJO.
    const writeObj:{ [key:string]: any } = {};
    // Map all decorated properties to the POJO given their names.
    this.propList.forEach(prop => {
      writeObj[prop.name] = Reflect.get(obj, prop.propertyKey);
    });
    // Write the POJO to disk.
    fsSync.writeFileSync(path, JSON.stringify(writeObj, null, 2));
  }

  /**
   * Writes a new config file with default values to a given path.
   * @param path Where to write the default config file.
   */
  writeDefaultSync(path: fsSync.PathLike): void {
    const outObj: { [key:string]: any } = {};

    this.propList.forEach(prop => {
      if (prop.default) {
        outObj[prop.name] = prop.default;
      } else if (prop.required) {
        outObj[prop.name] = prop.placeholderText || `REQUIRED FIELD (${prop.designType.name.toLowerCase()})`;
      }
    });

    fsSync.writeFileSync(path, JSON.stringify(outObj, null, 2));
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

  parseJson(json: string | any, objArgs?:ConstructorParameters<T>, opts?:IConfigrReadOptions): InstanceType<T> {
    // If stringified, co-erce to object.
    if (typeof json === 'string')
      json = JSON.parse(json);

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
      if (prop.required && !Reflect.has(json, prop.name))
        missingProperties.push(prop.name);

      if (missingProperties.length)
        throw new Error(`Missing properties in source data: ${missingProperties.join(',')}`);

      Reflect.set(cfgObj, prop.propertyKey, json[prop.name] || prop.default);
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