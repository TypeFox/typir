/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/
export namespace Typir {
    export namespace Attributes {
        export class AttributeType<TOut> {
            _: TOut;
        }
        export function integer() { return new AttributeType<number>(); }
        export function enumeration<TEnum extends string>(..._values: TEnum[]) { return new AttributeType<TEnum>(); }
        export type infer<A> = A extends AttributeType<infer T> ? T : never;
    }
    export namespace Primitives {
        type WithOutput<TAttributes, TOut> = TAttributes & {
            $value: TOut;
        };
        interface PrimitiveBuilder<TIn extends string, TAttributes = Record<never, unknown>> {
            attribute<TName extends string, TAttr>(name: TName, attributeType: Typir.Attributes.AttributeType<TAttr>): PrimitiveBuilder<TIn, TAttributes & {[K in TName]: Typir.Attributes.infer<typeof attributeType>}>;
            parseBy<TOut>(parse: (input: TIn) => WithOutput<TAttributes, TOut>): PrimitiveTypeFactory<TIn, WithOutput<TAttributes, TOut>>;
        }
        class PrimitiveBuilderImpl<TIn extends string, TAttributes = Record<never, unknown>> implements PrimitiveBuilder<TIn, TAttributes> {
            parseBy<TOut>(parse: (input: TIn) => WithOutput<TAttributes, TOut>): PrimitiveTypeFactory<TIn, WithOutput<TAttributes, TOut>> {
                return new PrimitiveTypeFactoryImpl<TIn, WithOutput<TAttributes, TOut>>(parse);
            }
            attribute<TName extends string, TAttr>(_name: TName, _attributeType: Attributes.AttributeType<TAttr>): PrimitiveBuilder<TIn, TAttributes & { [K in TName]: TAttr; }> {
                return new PrimitiveBuilderImpl<TIn, TAttributes & { [K in TName]: TAttr; }>();
            }
        }
        type PrimitiveTypeFactory<TIn extends string, TAttributes = Record<never, unknown>> = {
            parse(input: TIn): TAttributes;
        };
        class PrimitiveTypeFactoryImpl<TIn extends string, TAttributes = Record<never, unknown>> implements PrimitiveTypeFactory<TIn, TAttributes> {
            public parse: (input: TIn) => TAttributes;
            constructor(_parse: (input: TIn) => TAttributes) {
                this.parse = _parse;
            }
        }
        export function create<TIn extends string = string>(): PrimitiveBuilder<TIn> {
            return new PrimitiveBuilderImpl<TIn>();
        }
    }
}


export const CharType = Typir.Primitives.create()
    .attribute('type', Typir.Attributes.enumeration('character', 'graphic', 'uchar', 'widechar', 'nonvarying', 'varying', 'varyingz'))
    .attribute('length', Typir.Attributes.integer())
    .parseBy(input => {
        return {
            length: input.length,
            type: 'varyingz',
            $value: input.substring(1, input.length-2)
        };
    });

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
