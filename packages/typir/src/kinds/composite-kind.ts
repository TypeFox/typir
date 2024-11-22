/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/
class AttributeType<TOut> {
    _: TOut;
}

export namespace Typir {
    export namespace System {
        export function create() {

        }
    }
    export namespace Attributes {
        export function integer() { return new AttributeType<number>(); }
        export function string() { return new AttributeType<string>(); }
        export function enumeration<TEnum extends string>(..._values: TEnum[]) { return new AttributeType<TEnum>(); }
        export type infer<A> = A extends AttributeType<infer T> ? T : never;
    }
    export namespace Primitives {
        interface PrimitiveBuilder<TIn extends string, TAttributes = {}> {
            attribute<TName extends string, TAttr>(name: TName, attributeType: AttributeType<TAttr>): PrimitiveBuilder<TIn, TAttributes & {[K in TName]: Typir.Attributes.infer<typeof attributeType>}>;
            parseBy(parse: (input: TIn) => TAttributes): PrimitiveTypeFactory<TIn, TAttributes>;
        }
        class PrimitiveBuilderImpl<TIn extends string, TAttributes = {}> implements PrimitiveBuilder<TIn, TAttributes> {
            parseBy(parse: (input: TIn) => TAttributes): PrimitiveTypeFactory<TIn, TAttributes> {
                return new PrimitiveTypeFactoryImpl<TIn, TAttributes>(parse);
            }
            attribute<TName extends string, TAttr>(_name: TName, _attributeType: AttributeType<TAttr>): PrimitiveBuilder<TIn, TAttributes & { [K in TName]: TAttr; }> {
                return new PrimitiveBuilderImpl<TIn, TAttributes & { [K in TName]: TAttr; }>();
            }
        }
        type PrimitiveTypeFactory<TIn extends string, TAttributes = {}> = {
            parse(input: TIn): TAttributes;
        };
        class PrimitiveTypeFactoryImpl<TIn extends string, TAttributes = {}> implements PrimitiveTypeFactory<TIn, TAttributes> {
            public parse: (input: TIn) => TAttributes;
            constructor(_parse: (input: TIn) => TAttributes) {
                this.parse = _parse;
            }
        }
        export function create<TIn extends string = string>(): PrimitiveBuilder<TIn> {
            return new PrimitiveBuilderImpl<TIn>();
        }
    }

    export namespace Composites {
        export function create<TAst>() {

        }
        export namespace Children {
            export function single() {

            }
            export function multipleByIndex() {

            }
            export function multipleByName() {

            }
        }
    }
}

export const system = Typir.System.create()
    .addFeature(Typir.Features.IsSubTypeOf)
    .addFeature(Typir.Features.IsCastableTo)
    .addFeature(Typir.Features.IsEqualTo)
    .build()
    ;

export const CharType = Typir.Primitives.create(system)
    .attribute('type', Typir.Attributes.enumeration('character', 'graphic', 'uchar', 'widechar', 'nonvarying', 'varying', 'varyingz'))
    .attribute('length', Typir.Attributes.integer())
    .parseBy(input => {
        return {
            length: input.length-2,
            type: 'varyingz',
            $value: input.substring(1, input.length-2)
        };
    });

export const ClassType = Typir.Composites.create(system)
    .attribute('name', Typir.Attributes.string())
    .children('members', Typir.Composites.Children.multipleByName(() => system.top())
    .child('superClass', Typir.Composites.Children.single(self => self)
    .children('interfaces', Typir.Composites.Children.multipleByIndex(self => self))
    .inferOn(isMyClass, myClass => {
        return {
...
        }
    })
    ;

// CharType.create({
//     type: 'character',
//     length: 100,
//     value: "'123456'"
// });
// const value: string = CharType.parse("'abcdefg'").length;
// CharType.top({
//     type: 'character',
//     length: 100
// });


//https://www.typescriptlang.org/play/?ts=4.6.4#code/C4TwDgpgBAqgdgSwPZwCpNeCAeGUIAewEcAJgM5QBKEAxkgE6nbnAMJwDmANFAK5wA1nCQB3OAD4JUALxQA3lADaAaSgcoACjyFiZSgOFi4UAPxRBEEEgBmsKAC4ocCADcIDAJQBdJzqIkFPxCIuJmUGq6gZSW1nZ45jCq3o7Obh6pLu4MAL4AUHmgkFAAgrIKeVBVUACGTqzsXHn5hVhQAELl8pXVAEZOcHwAtr0ezQVF0ADCXT1VtE69SEgANhA1cOOtxQAis9VQC6Vbk1BTSCMcEKTl8MhoGFjYZQA+HVBvM287EgUA9AAqbbTC69K43OTdA51KANDicADccyg-Wcw1GDCRByOS1W6xMbxKSPyAL+BXocFYh1B4IAjE5zpcXBCKtCnAByYisdncZGogBMvOxTihB2qMPZ7OR+RaFKp9CZ135DJpzP24o5XOAPL5TkFyKONhqK3IEGaQA
