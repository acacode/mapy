import { SchemeType } from './constants'
import { AllKeysAre } from './global_types'
import { error, isObject, isPrimitive, warn } from './helpers'
import { ModelConfiguration, ModelOptions, ModelWrapper } from './model_wrapper'
import { Scheme, SchemeConfig } from './scheme'

declare type CastAction = (dataModel: object, { model, scheme: { from, to }, modelOptions }: CastConfig) => void

declare type CastActionsObject = {
  [key in SchemeType]: {
    toOriginal: CastAction,
    toUsage: CastAction,
  }
}

declare type PrimitiveCaster<ReturnValue> = (value: any) => ReturnValue

export declare interface CastPrimitiveTo {
  any: PrimitiveCaster<any>
  boolean: PrimitiveCaster<boolean>
  number: PrimitiveCaster<number>
  object: PrimitiveCaster<object>
  string: PrimitiveCaster<string>
}

const impossibleCastWarning = (value: any, toType: string) =>
  // checks on null is required. Because most APIs have nullable fields.
  value !== null && warn('Not possible to cast value "', value, `" to type ${toType}.`)

const checkOnExistingCastType = (type: any, property: any): boolean => {
  const possibleCastTypes = Object.keys(castTo)
  if (possibleCastTypes.indexOf(type) === -1) {
    error(
        `Type `, type, ` of value of property `, property, ` is not possible for type casting\r\n` +
        `Please use one of following types: ${possibleCastTypes.join(', ')}`
    )
  }
  return true
}

const propertyIsNotExist = (model: object, property: any): boolean => {
  if (typeof model[property] === 'undefined') {
    warn(`Property "`,property,`" is not existing in model :`, model)
  }
  return true
}

const objectIsDeclarationModel = (declaredModel: any, property: any) => {
  if (!declaredModel.deserialize) {
    error(
      `Declared model for `,property,` is not created via model() function.` +
      `Please wrap this model into "model()" function`
    )
  }
  return true
}

const castTo: CastPrimitiveTo = {
  any: (value: any): any => value,
  boolean: (value: any): boolean => !!value,
  number: (value: any): number => {
    const castedValue = +value

    if (!isPrimitive(value) || Number.isNaN(castedValue)) {
      impossibleCastWarning(value, 'number')
      return value
    }

    return castedValue
  },
  object: (value: any): object => {

    if (!isObject(value)) {
      impossibleCastWarning(value, 'object')
      return value
    }

    return Object.assign({}, value)
  },
  string: (value: any): string => {

    if (!isPrimitive(value)) {
      impossibleCastWarning(value, 'string')
      return value
    }

    return value && value.toString ? value.toString() : `${value}`
  }
}

declare interface ConvertConfig {
  modelConfiguration: ModelConfiguration,
  toOriginal: boolean
}

export const convertModel = (
  dataModel: object,
  { modelConfiguration, toOriginal }: ConvertConfig
) => {
  const model = {}

  for (const { scheme } of modelConfiguration.declarations) {
    if (toOriginal ? !scheme.readOnly : !scheme.writeOnly) {
      const serializer = castAction[scheme.schemeType][toOriginal ? 'toOriginal' : 'toUsage']
      serializer(dataModel, {
        model,
        modelOptions: modelConfiguration.options,
        scheme
      })
    }
  }

  return model
}

const isNotArrayError = (usageProperty: string, originalProperty: string): never => error(
  `For `,usageProperty,` property you are use 'fieldArray()' and ` +
  `because of this the original property `,originalProperty,` should have type array`
)

declare interface CastConfig {
  modelOptions: ModelOptions
  model: object
  scheme: Scheme
}

const castClassToOriginal: CastAction = (
  dataModel: object,
  { model, scheme: { from, to, arrayType, writeOnly }, modelOptions }: CastConfig
) => {

  modelOptions.warnings && !writeOnly && propertyIsNotExist(dataModel, to.name)

  const cast = (model: AllKeysAre<any>) => {
    objectIsDeclarationModel(model, to.name)
    return (to.type as ModelWrapper<any>).deserialize(model)
  }

  if (arrayType) {
    if (!(dataModel[to.name] instanceof Array)) {
      isNotArrayError(to.name, to.name)
    }
    model[from.name] = (dataModel[to.name] as object[]).map(cast)
  } else {
    model[from.name] = cast(dataModel[to.name])
  }
}

const castClassToUsage: CastAction = (
  dataModel: object,
  { model, scheme: { from, to, arrayType, readOnly }, modelOptions }: CastConfig
) => {

  modelOptions.warnings && !readOnly && propertyIsNotExist(dataModel, from.name)

  const cast = (model: AllKeysAre<any>) => {
    const instance = (from.type as ModelWrapper<any>).serialize(model)
    return objectIsDeclarationModel(instance, from.name) && instance
  }

  if (arrayType) {
    if (!(dataModel[from.name] instanceof Array)) {
      isNotArrayError(from.name, from.name)
    }
    model[to.name] = (dataModel[from.name] as object[]).map(cast)
  } else {
    model[to.name] = cast(dataModel[from.name])
  }
}

const castSerializersToOriginal: CastAction = (
  dataModel: object,
  { model, scheme: { from, to }, modelOptions }: CastConfig
) => {

  if (typeof to.serializer === 'function') {
    const partialModel = to.serializer(dataModel, model)
    if (!isObject(partialModel)) {
      error(
        'Return value of callback function of property .to() should have type object\r\n' +
        'Because return value will be merged into result object model'
      )
    }
    Object.assign(model, partialModel)
  } else delete model[from.name]
}

const castSerializersToUsage: CastAction = (
  dataModel: object,
  { model, scheme: { from, to }, modelOptions }: CastConfig
) => {

  if (typeof from.serializer !== 'function') {
    error('Custom handler should be exist and have type functions')
  }
  model[to.name] = (from.serializer as Function)(dataModel)
}

declare interface ShortCastConfig {
  model: object,
  arrayType: boolean,
  warnings: boolean,
  currentPropScheme: SchemeConfig,
  usagePropScheme: SchemeConfig,
}

const castStrings = (
  dataModel: object,
  {
    model,
    arrayType,
    warnings,
    currentPropScheme,
    usagePropScheme
  }: ShortCastConfig
) => {

  warnings && propertyIsNotExist(dataModel, currentPropScheme.name)

  const cast = (value: any) => {
    checkOnExistingCastType(usagePropScheme.type, currentPropScheme.name)
    return castTo[usagePropScheme.type as keyof CastPrimitiveTo](value)
  }

  if (arrayType) {
    if (!(dataModel[currentPropScheme.name] instanceof Array)) {
      isNotArrayError(currentPropScheme.name, currentPropScheme.name)
    }
    model[usagePropScheme.name] = (dataModel[currentPropScheme.name] as any[]).map(cast)
  } else {
    model[usagePropScheme.name] = cast(dataModel[currentPropScheme.name])
  }
}

const castAction: CastActionsObject = {
  [SchemeType.STRING_AND_CLASS]: {
    toOriginal: castClassToOriginal,
    toUsage: castClassToUsage,
  },
  [SchemeType.SERIALIZERS]: {
    toOriginal: castSerializersToOriginal,
    toUsage: castSerializersToUsage,
  },
  [SchemeType.THREE_STRINGS]: {
    toOriginal: (dataModel, { scheme, model, modelOptions }) => castStrings(dataModel, {
      arrayType: scheme.arrayType,
      currentPropScheme: scheme.to,
      model,
      usagePropScheme: scheme.from,
      warnings: modelOptions.warnings && !scheme.writeOnly,
    }),
    toUsage:  (dataModel, { scheme, model, modelOptions }) => castStrings(dataModel, {
      arrayType: scheme.arrayType,
      currentPropScheme: scheme.from,
      model,
      usagePropScheme: scheme.to,
      warnings: modelOptions.warnings && !scheme.readOnly,
    }),
  }
}
