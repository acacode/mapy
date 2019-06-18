import { ModelWrapper, ModelConfiguration } from './class_definitions'
import { AllKeysAre, PropDeclaration } from './global_types'
import { Scheme, SchemeType } from './scheme'

const castWarning = (value: any, currentValue: any) =>
    console.warn('Cannot cast value {', value, '} to type number.\r\nCurrent value will be {' + currentValue + '}')

const checkOnExistingCastType = (type: any, property: any): boolean => {
  const possibleCastTypes = Object.keys(castTo)
  if (possibleCastTypes.indexOf(type) === -1) {
    throw new Error(
        `Type ${type} of value of property ${property} is not possble for type casting\r\n` +
        `Please use one of following types [${possibleCastTypes.join(', ')}]`
    )
  }
  return true
}

const propertyIsExist = (value: object, property: any): boolean => {
  if (typeof value[property] === 'undefined') {
    console.warn(`Property "${property}" is not existing in original model :`, value)
  }
  return true
}

const objectIsDeclarationModel = (declaredModel: any, property: any) => {
  if (!declaredModel.convertToOriginal) {
    throw new Error(
      `Declared model for ${property} is not created via createModel() function.` +
      `Please wrap this model into "createModel()" function`
    )
  }
  return true
}

const castTo = {
  boolean: (value: any) => !!value,
  float: (value: any) => {
    const str = castTo.string(value).replace(',', '.')
    return castTo.number(str)
  },
  integer: (value: any) => {
    const str = castTo.string(value)
    return castTo.number(castTo.number(str).toFixed(0))
  },
  number: (value: any): number => {
    const castedValue = +value

    if (Number.isNaN(castedValue)) {
      castWarning(value, castedValue)
    }

    return castedValue
  },
  string: (value: any): string => {
    const castedValue = value && value.toString ? value.toString() : `${value}`

    if (castedValue === '[object Object]') {
      castWarning(value, castedValue)
    }

    return castedValue
  },
}

declare interface ConvertationConfig<D> {
  declaration: D,
  toOriginal: boolean,
  modelConfiguration: ModelConfiguration,
}

export const convertModel = <D extends AllKeysAre<PropDeclaration>>(
  dataModel: object,
  { declaration, toOriginal, modelConfiguration }: ConvertationConfig<D>
) => {

  const model = {}

  Object.keys(declaration).forEach(key => {
    if (declaration[key]['@@property_declaration']) {
      const { scheme } = declaration[key]
      const converter = (toOriginal ? castAction.toOriginal : castAction.toUsage)[scheme.schemeType as any]
      if (!converter) {
        throw new Error('Unknown scheme type: ' + scheme.schemeType)
      }
      converter(dataModel, { modelConfiguration, model, scheme })
    }
  })

  return model
}


declare interface CastConfig {
  modelConfiguration: ModelConfiguration
  model: object
  scheme: Scheme
}


const toOriginalCast = {
  [SchemeType.STRING_AND_CLASS_FOR_ARRAY]: (dataModel: object, { model, scheme, modelConfiguration }: CastConfig) => {
    propertyIsExist(dataModel, scheme.to.name)
    if (!(dataModel[scheme.to.name] instanceof Array)) {
      throw new Error(
      `For ${scheme.to.name} property you are use 'fromArray' and ` +
      `because of this property ${scheme.to.name} should have type array`
    )
    }
    model[scheme.from.name] =
    (dataModel[scheme.to.name] as object[]).map(usageModel => {
      objectIsDeclarationModel(usageModel, scheme.to.name)
      return (usageModel as InstanceType<ModelWrapper<any>>).convertToOriginal()
    })
  },
  [SchemeType.STRING_AND_CLASS]: (dataModel: object, { model, scheme, modelConfiguration }: CastConfig) => {
    propertyIsExist(dataModel, scheme.to.name)
    objectIsDeclarationModel(dataModel[scheme.to.name], scheme.to.name)
    model[scheme.from.name] = (dataModel[scheme.to.name] as InstanceType<ModelWrapper<any>>).convertToOriginal()
  },
  [SchemeType.CUSTOM_CONVERTERS]: (dataModel: object, { model, scheme, modelConfiguration }: CastConfig) => {
    if (typeof scheme.to.converter === 'function') {
      const partialModel = (scheme.to.converter as Function)(dataModel, model)
      if (partialModel instanceof Array || typeof partialModel !== 'object') {
        throw new Error(
          'Return value of callback function of property .to() should have type object\r\n' +
          'Because return value will be merged into result object model'
        )
      }
      Object.assign(model, partialModel)
    } else delete model[scheme.from.name]
  },
  [SchemeType.THREE_STRINGS]: (dataModel: object, { model, scheme: { from: to, to: from }, modelConfiguration }: CastConfig) => {
    propertyIsExist(dataModel, from.name)
    checkOnExistingCastType(to.type, from.name)
    model[to.name] = castTo[to.type as string](dataModel[from.name])
  }
}

const toUsageCast = {
  [SchemeType.STRING_AND_CLASS_FOR_ARRAY]: (dataModel: object, { model, scheme: { from, to }, modelConfiguration }: CastConfig) => {
    propertyIsExist(dataModel, from.name)
    if (!(dataModel[from.name] instanceof Array)) {
      throw new Error(
          `For ${from.name} property you are use 'fromArray' and ` +
          `because of this property ${from.name} should have type array`
        )
    }
    model[to.name] = (dataModel[from.name] as object[]).map(part => {
      const instance = new (from.type as ModelWrapper<any>)(part)
      return objectIsDeclarationModel(instance, from.name) && instance
    })
  },
  [SchemeType.STRING_AND_CLASS]: (dataModel: object, { model, scheme, modelConfiguration }: CastConfig) => {
    propertyIsExist(dataModel, scheme.from.name)
    const instance = new (scheme.from.type as ModelWrapper<any>)(dataModel[scheme.from.name])
    objectIsDeclarationModel(instance, scheme.from.name)
    model[scheme.to.name] = instance
  },
  [SchemeType.CUSTOM_CONVERTERS]: (dataModel: object, { model, scheme, modelConfiguration }: CastConfig) => {
    if (typeof scheme.from.converter !== 'function') {
      throw new Error('Custom handler should be exist and have type functions')
    }
    model[scheme.to.name] = scheme.from.converter(dataModel)
  },
  [SchemeType.THREE_STRINGS]: (dataModel: object, { model, scheme: { from, to }, modelConfiguration }: CastConfig) => {
    propertyIsExist(dataModel, from.name)
    checkOnExistingCastType(to.type, from.name)
    model[to.name] = castTo[to.type as string](dataModel[from.name])
  }
}

const castAction = {
  toOriginal: toOriginalCast,
  toUsage: toUsageCast,
}
