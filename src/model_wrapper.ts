import { convertModel } from './converter'
import { ValueOf } from './global_types'
import { isObject } from './helpers'
import { preparePropDeclarations, PropDeclaration } from './prop_declaration'

declare interface SerializedObject {
  [usageField: string]: any, deserialize: () => object
}

declare interface DeserializedObject {
  [originalField: string]: any
}

export declare interface ModelWrapper<T = any> {
  new (originalModel: object): SerializedObject
  serialize (originalModel: object): SerializedObject
  deserialize (usageModel: SerializedObject): DeserializedObject
}

export declare interface ModelOptions {
  defaultValues: boolean
  warnings: boolean,
}

const DEFAULT_MODEL_OPTIONS: ModelOptions = {
  defaultValues: false,
  warnings: true,
}

export declare interface ModelConfiguration {
  options: ModelOptions
  declarations: PropDeclaration[]
}

export const createModelConfig = <T>(
  objectWithDeclarations: ValueOf<T>,
  originalModel: object,
  modelOptions?: Partial<ModelOptions>
): ModelConfiguration => ({
  declarations: preparePropDeclarations<T>(objectWithDeclarations, originalModel),
  options: {
    ...DEFAULT_MODEL_OPTIONS,
    ...(modelOptions || {})
  },
})

export const createModel = <T extends (object | (new () => ValueOf<T>))>(
  Model: T,
  partialModelOptions?: Partial<ModelOptions>
): ModelWrapper<T> => {

  const serialize: ModelWrapper['serialize'] = (originalModel) => {

    if (!isObject(originalModel)) {
      console.warn('Original model is not an object. Current value is ', originalModel)

      originalModel = {}
    }

    const instance = typeof Model === 'function' ?
      new (Model as any)() : new (class Model {
        constructor (context: any) {
          Object.assign(this, { ...context })
        }
      })(Model)

    const modelConfig = createModelConfig<T>(instance, originalModel, partialModelOptions)

    Object.assign(instance, convertModel(originalModel, {
      modelConfig,
      toOriginal: false,
    }))

    instance.__proto__.deserialize = () => convertModel(instance, {
      modelConfig,
      toOriginal: true,
    })

    return instance
  }

  const deserialize: ModelWrapper['deserialize'] = (usageModel) => {
    if (!isObject(usageModel)) {
      throw new Error('Usage model is not an object.')
    }
    if (!usageModel.deserialize) {
      throw new Error('Argument of "deserialize" function is not created via "model()" function')
    }
    return usageModel.deserialize()
  }

  return class ModelWrapper {

    static serialize = serialize

    static deserialize = deserialize

    deserialize: any

    constructor (originalModel: object) {
      return serialize(originalModel)
    }

  }
}
